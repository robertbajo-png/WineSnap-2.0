import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.argv.length, 2);
assert.ok(!process.env.WINESNAP_FEATURE_SCOPE || process.env.WINESNAP_FEATURE_SCOPE === "prices");
const pricesOnly = process.env.WINESNAP_FEATURE_SCOPE === "prices";
const reportFile = pricesOnly
  ? "local-windows-prices-report.json"
  : "local-windows-features-report.json";
const project = "pzniyupmgwvlldvztzqh";
const origin = `https://${project}.supabase.co`;
const app = "http://127.0.0.1:5210";
let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  assert.ok(raw.length <= 16384);
}
const keys = JSON.parse(raw);
raw = "";
assert.equal(keys.project, project);
const report = {
  project,
  scope: pricesOnly ? "prices" : "features",
  completed: false,
  checks: [],
  cleanupFailures: 0,
  outstanding: [],
  ...(pricesOnly
    ? { notCovered: ["Live AI availability", "Privacy/reset/recovery acceptance"] }
    : {}),
};
const save = async () => {
  await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
  await writeFile(
    new URL(`../dist/${reportFile}`, import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
};
const check = async (name, run) => {
  try {
    await run();
    report.checks.push({ name, passed: true });
  } catch (error) {
    report.checks.push({
      name,
      passed: false,
      ...(error instanceof assert.AssertionError
        ? { actual: typeof error.actual === "number" ? error.actual : "unexpected_result" }
        : {}),
    });
    throw new Error("local_feature_acceptance_failed");
  } finally {
    await save();
  }
};
const backendFetch = (url, init) => {
  assert.equal(new URL(url instanceof Request ? url.url : String(url)).origin, origin);
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: backendFetch },
};
const admin = createClient(origin, keys.secret, options);
const ok = ({ data, error }) => {
  if (error) {
    report.backendError = /^[a-zA-Z0-9_]{1,60}$/.test(error.code ?? "")
      ? error.code
      : String(error.status ?? "unknown");
    throw new Error("test_backend_failure");
  }
  return data;
};
const call = (path, body = {}, token) =>
  fetch(app + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
const users = [];
const objects = [];
let browser;
try {
  for (const [path, body] of [
    ["/api/ai/restaurant-match", { text: "Synthetic menu" }],
    ["/api/ai/extract-preference-signals", { tastingNoteId: randomUUID() }],
    ["/api/privacy/privacy-export", {}],
    ["/api/privacy/privacy-controls", { action: "reset_memory", confirm: "reset_memory" }],
    ["/api/privacy/privacy-maintenance", { execute: true }],
    ["/api/public/hooks/refresh-cellar-values", { action: "refresh", wineIds: [randomUUID()] }],
    ["/api/public/hooks/refresh-wishlist-prices", { ids: [randomUUID()] }],
  ])
    await check(`${path}: anonymous and invalid JWT denied`, async () => {
      for (const token of [null, "invalid-synthetic-jwt"]) {
        const response = await call(path, body, token);
        assert.equal(response.status, 401);
      }
    });
  for (let i = 0; i < 2; i++) {
    report.stage = "create_fixture_users";
    const email = `winesnap-local-features-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const fixture = {
      id: user.id,
      email,
      password,
      deleted: false,
      client: createClient(origin, keys.publishable, options),
    };
    users.push(fixture);
    fixture.session = ok(await fixture.client.auth.signInWithPassword({ email, password })).session;
  }
  const [owner, peer] = users;
  report.stage = "create_fixture_wine";
  const wine = ok(
    await owner.client
      .from("wines")
      .insert({
        user_id: owner.id,
        producer: "Zehn Morgen",
        wine_name: "Chardonnay & Weisser Burgunder",
        vintage: 2023,
        country: "Germany",
        region: "Nahe",
        wine_type: "white",
        bottle_ml: 750,
        quantity: 1,
        is_public: false,
        acidity: 8,
        tannin: 1,
        body: 5,
      })
      .select()
      .single(),
  );
  report.stage = "create_fixture_note";
  const note = ok(
    await owner.client
      .from("tasting_notes")
      .insert({
        user_id: owner.id,
        wine_id: wine.id,
        rating: 4,
        notes: "Jag tycker om frisk syra och ogillar kraftig ek. Detta vin passade mig.",
      })
      .select("id")
      .single(),
  );
  report.stage = "create_fixture_image";
  const path = `${owner.id}/${randomUUID()}.png`;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=",
    "base64",
  );
  ok(
    await owner.client.storage
      .from("wine-labels")
      .upload(path, bytes, { contentType: "image/png" }),
  );
  objects.push(path);
  ok(await owner.client.from("wines").update({ image_url: path }).eq("id", wine.id));
  await check("another user cannot extract preferences from a private note", async () => {
    assert.equal(
      (
        await call(
          "/api/ai/extract-preference-signals",
          { tastingNoteId: note.id },
          peer.session.access_token,
        )
      ).status,
      404,
    );
  });
  if (!pricesOnly)
    await check("real Gemini preference extraction persists owner-only evidence", async () => {
      const response = await call(
        "/api/ai/extract-preference-signals",
        { tastingNoteId: note.id },
        owner.session.access_token,
      );
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.signals.length > 0);
      const signals = ok(
        await owner.client.from("taste_signals").select("id").eq("user_id", owner.id),
      );
      assert.ok(signals.length > 0);
      assert.deepEqual(
        ok(await peer.client.from("taste_signals").select("id").eq("user_id", owner.id)),
        [],
      );
    });
  const { chromium } = await import(
    pathToFileURL(
      `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
    ).href
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  const hosted = [];
  page.on("pageerror", () => errors.push(true));
  page.on("request", (request) => {
    if (
      /\/functions\/v1\/(restaurant-match|extract-preference-signals|privacy-controls|privacy-export)/.test(
        request.url(),
      )
    )
      hosted.push(true);
  });
  await check("ordinary sign-in works in the actual mobile app", async () => {
    await page.goto(app + "/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.getByRole("button", { name: /^(Sign In|Logga in)$/i }).click();
    await page.waitForURL(app + "/", { timeout: 20000 });
  });
  if (!pricesOnly)
    await check(
      "real restaurant analysis uses the local route and renders on mobile and desktop",
      async () => {
        await page.goto(app + "/restaurant");
        await page
          .locator("#restaurant-menu")
          .fill(
            "Zehn Morgen Chardonnay & Weisser Burgunder 2023, Nahe, Germany, 450 SEK\nDr. Loosen Riesling 2023, Mosel, Germany, 550 SEK",
          );
        const pending = page.waitForResponse((r) => r.url() === app + "/api/ai/restaurant-match", {
          timeout: 90000,
        });
        await page.getByRole("button", { name: /Analysera|Analyze|Hitta|Find/i }).click();
        const response = await pending;
        assert.equal(response.status(), 200);
        const result = await response.json();
        assert.ok(result.picks.length > 0);
        await page.getByText(result.picks[0].wine_name, { exact: false }).first().waitFor();
        for (const [name, viewport] of [
          ["mobile", { width: 390, height: 844 }],
          ["desktop", { width: 1440, height: 1000 }],
        ]) {
          await page.setViewportSize(viewport);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await page.screenshot({
            path: fileURLToPath(new URL(`../dist/local-restaurant-${name}.png`, import.meta.url)),
            fullPage: true,
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
      },
    );
  await check("cellar refresh is owner-scoped and persists an honest catalog result", async () => {
    const input = { action: "refresh", wineIds: [wine.id] };
    const stranger = await call(
      "/api/public/hooks/refresh-cellar-values",
      input,
      peer.session.access_token,
    );
    assert.equal(stranger.status, 200);
    assert.equal((await stranger.json()).results[0].status, "skipped");
    const response = await call(
      "/api/public/hooks/refresh-cellar-values",
      input,
      owner.session.access_token,
    );
    assert.equal(response.status, 200);
    const result = (await response.json()).results[0];
    assert.ok(["matched", "review", "missing", "error"].includes(result.status));
    report.catalogResult = result.status;
    if (result.status === "error")
      report.outstanding.push("Live retail catalog is unavailable; prices must not be invented.");
    const updated = ok(
      await owner.client
        .from("wines")
        .select("retail_price_status,retail_price_attempted_at")
        .eq("id", wine.id)
        .single(),
    );
    assert.equal(updated.retail_price_status, result.status);
    assert.ok(updated.retail_price_attempted_at);
  });
  await check(
    "live mirror prices persist with exact identity and accurate source attribution",
    async () => {
      const proposal = ok(
        await owner.client
          .from("wines")
          .select("retail_price_candidates")
          .eq("id", wine.id)
          .single(),
      ).retail_price_candidates;
      const hit = proposal?.candidates?.find(
        (candidate) =>
          candidate.source === "susbolaget.emrik.org" && candidate.vintage && candidate.volumeMl,
      );
      assert.ok(hit, "A current public source product is required; do not invent a fixture quote");
      const identity = {
        producer: hit.producer,
        wine_name: hit.name,
        vintage: hit.vintage,
        bottle_ml: hit.volumeMl,
        country: hit.country,
        systembolaget_id: hit.productNumber,
      };
      const exact = ok(
        await owner.client
          .from("wines")
          .insert({
            ...identity,
            user_id: owner.id,
            quantity: 1,
            wine_type: "white",
            is_public: false,
          })
          .select("id")
          .single(),
      );
      const response = await call(
        "/api/public/hooks/refresh-cellar-values",
        { action: "refresh", wineIds: [exact.id] },
        owner.session.access_token,
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).results[0].status, "matched");
      const persisted = ok(
        await owner.client
          .from("wines")
          .select("market_price,market_price_source,retail_price_match")
          .eq("id", exact.id)
          .single(),
      );
      assert.equal(persisted.market_price, hit.price);
      assert.equal(persisted.market_price_source, hit.source);
      assert.equal(persisted.retail_price_match.sourceAsOf, hit.sourceAsOf);
      assert.notEqual(wine.vintage, hit.vintage);
      assert.equal(report.catalogResult, "review");
      report.liveRetailQuote = {
        productNumber: hit.productNumber,
        vintage: hit.vintage,
        price: hit.price,
        source: hit.source,
        sourceAsOf: hit.sourceAsOf,
      };
      await page.goto(app + "/cellar/overview");
      const details = page.locator("details").filter({ hasText: hit.source });
      await details.locator("summary").click();
      await details
        .getByText(new RegExp(hit.source.replaceAll(".", "\\.")))
        .first()
        .waitFor();
      for (const [name, viewport] of [
        ["mobile", { width: 390, height: 844 }],
        ["desktop", { width: 1440, height: 1000 }],
      ]) {
        await page.setViewportSize(viewport);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({
          path: fileURLToPath(new URL(`../dist/local-retail-${name}.png`, import.meta.url)),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const wish = ok(
        await owner.client
          .from("wishlist")
          .insert({
            ...identity,
            user_id: owner.id,
            notify_on_drop: true,
            price_currency: "SEK",
            target_price: hit.price + 1,
          })
          .select("id")
          .single(),
      );
      for (const triggered of [1, 0]) {
        const response = await call(
          "/api/public/hooks/refresh-wishlist-prices",
          { ids: [wish.id] },
          owner.session.access_token,
        );
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.failed, 0);
        assert.equal(result.triggered, triggered);
      }
      const storedWish = ok(
        await owner.client
          .from("wishlist")
          .select("price_source,last_checked_price")
          .eq("id", wish.id)
          .single(),
      );
      assert.equal(storedWish.price_source, hit.source);
      assert.equal(storedWish.last_checked_price, hit.price);
      ok(await owner.client.from("wishlist").delete().eq("id", wish.id));
      ok(await owner.client.from("wines").delete().eq("id", exact.id));
    },
  );
  await check("wishlist refresh is wired to the local authenticated backend", async () => {
    const row = ok(
      await owner.client
        .from("wishlist")
        .insert({
          user_id: owner.id,
          wine_name: "Synthetic missing identity",
          notify_on_drop: false,
        })
        .select("id")
        .single(),
    );
    const response = await call(
      "/api/public/hooks/refresh-wishlist-prices",
      { ids: [row.id] },
      owner.session.access_token,
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.checked, 1);
    assert.equal(result.unmatched, 1);
  });
  if (!pricesOnly) {
    await check(
      "private export contains only the owner and complete image bytes are readable",
      async () => {
        const response = await call("/api/privacy/privacy-export", {}, owner.session.access_token);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const result = await response.json();
        assert.equal(result.account.id, owner.id);
        assert.equal(result.tables.wines.length, 1);
        assert.equal(result.files.length, 1);
        const file = await backendFetch(result.files[0].signedUrl);
        assert.equal(file.status, 200);
        assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
        assert.ok(!JSON.stringify(result).includes(peer.email));
      },
    );
    await check("reset memory removes signals but preserves wines and notes", async () => {
      await page.goto(app + "/me");
      await page.getByRole("button", { name: /Nollställ smakminnet|Reset taste memory/ }).click();
      const dialog = page.getByRole("alertdialog");
      const confirm = dialog.getByRole("button", { name: /^(Nollställ|Reset)$/ });
      assert.equal(await confirm.isDisabled(), true);
      await dialog.getByRole("checkbox").check();
      const pending = page.waitForResponse(
        (r) => r.url() === app + "/api/privacy/privacy-controls",
      );
      await confirm.click();
      const response = await pending;
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).complete, true);
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(ok(await owner.client.from("taste_signals").select("id")), []);
      assert.equal(ok(await owner.client.from("wines").select("id")).length, 1);
      assert.equal(ok(await owner.client.from("tasting_notes").select("id")).length, 1);
    });
    await check(
      "profile export downloads embedded image bytes with readable mobile and desktop controls",
      async () => {
        const downloading = page.waitForEvent("download");
        await page.getByRole("button", { name: /Exportera mina uppgifter|Export my data/ }).click();
        const download = await downloading;
        const data = JSON.parse(await readFile(await download.path(), "utf8"));
        assert.equal(data.account.id, owner.id);
        assert.equal(data.files.length, 1);
        assert.deepEqual(Buffer.from(data.files[0].base64, "base64"), bytes);
        assert.ok(!JSON.stringify(data).includes("signedUrl"));
        for (const [name, viewport] of [
          ["mobile", { width: 390, height: 844 }],
          ["desktop", { width: 1440, height: 1000 }],
        ]) {
          await page.setViewportSize(viewport);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await page.screenshot({
            path: fileURLToPath(new URL(`../dist/local-privacy-${name}.png`, import.meta.url)),
            fullPage: true,
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
      },
    );
    await check(
      "local recovery grant changes the synthetic user's password without sending email",
      async () => {
        const recovery = ok(
          await admin.auth.admin.generateLink({
            type: "recovery",
            email: peer.email,
            options: { redirectTo: app + "/reset-password" },
          }),
        );
        const action = new URL(recovery.properties.action_link);
        assert.equal(action.origin, origin);
        assert.equal(action.searchParams.get("redirect_to"), app + "/reset-password");
        const verified = await fetch(action, {
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
        assert.equal(verified.status, 303);
        const destination = new URL(verified.headers.get("location"));
        assert.equal(destination.origin, app);
        assert.equal(destination.pathname, "/reset-password");
        const reset = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const recoveryPage = await reset.newPage();
        await recoveryPage.goto(destination.href);
        const password = randomUUID() + randomUUID();
        await recoveryPage.locator("#new-password").fill(password);
        await recoveryPage.locator("#confirm-password").fill(password);
        await recoveryPage.locator('button[type="submit"]').click();
        await recoveryPage.waitForURL(app + "/", { timeout: 20000 });
        ok(
          await createClient(origin, keys.publishable, options).auth.signInWithPassword({
            email: peer.email,
            password,
          }),
        );
        await reset.close();
        report.outstanding.push(
          "Custom SMTP is off in WineSnap-test; real email delivery is not accepted. The default sender is team-only.",
        );
      },
    );
    await check("erasure removes image before Auth and blocks the old session", async () => {
      await page.getByRole("button", { name: /Radera mitt konto|Delete my account/ }).click();
      const dialog = page.getByRole("alertdialog");
      const confirm = dialog.getByRole("button", { name: /^(Radera kontot|Delete account)$/ });
      assert.equal(await confirm.isDisabled(), true);
      await dialog.getByRole("checkbox").check();
      const pending = page.waitForResponse(
        (r) => r.url() === app + "/api/privacy/privacy-controls",
      );
      await confirm.click();
      const response = await pending;
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).complete, true);
      owner.deleted = true;
      assert.equal((await admin.auth.admin.getUserById(owner.id)).data.user, null);
      assert.deepEqual(
        ok(await admin.rpc("privacy_account_storage_objects", { _user_id: owner.id, _limit: 200 })),
        [],
      );
      assert.notEqual(
        (
          await call(
            "/api/ai/extract-preference-signals",
            { tastingNoteId: note.id },
            owner.session.access_token,
          )
        ).status,
        200,
      );
    });
  }
  await check(
    "no private keys in markup, unexpected browser errors or hosted AI/privacy calls",
    async () => {
      assert.equal(errors.length, 0);
      assert.equal(hosted.length, 0);
      const html = await page.content();
      for (const key of [keys.openai, keys.gemini, keys.secret]) assert.ok(!html.includes(key));
    },
  );
  report.completed = true;
} catch {
  report.failure = "local_feature_acceptance_failed";
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const path of objects) {
    try {
      ok(await admin.storage.from("wine-labels").remove([path]));
    } catch {
      report.cleanupFailures++;
    }
  }
  for (const user of users) {
    try {
      ok(await admin.from("wine_photos").delete().eq("user_id", user.id));
      if (!user.deleted) {
        ok(await admin.from("wines").delete().eq("user_id", user.id));
        ok(await admin.auth.admin.deleteUser(user.id));
      }
      ok(await admin.from("privacy_erasure_receipts").delete().eq("user_id", user.id));
    } catch {
      report.cleanupFailures++;
    }
  }
  if (report.cleanupFailures) {
    report.completed = false;
    process.exitCode = 1;
  }
  keys.secret = keys.openai = keys.gemini = keys.publishable = "";
  await save();
  console.log(JSON.stringify({ project, completed: report.completed }));
}
