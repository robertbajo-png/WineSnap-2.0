import assert from "node:assert/strict";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.argv.length, 2);
const project = "pzniyupmgwvlldvztzqh",
  origin = `https://${project}.supabase.co`,
  app = "http://127.0.0.1:5210";
let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  assert.ok(raw.length < 16384);
}
const keys = JSON.parse(raw);
raw = "";
assert.equal(keys.project, project);
const report = {
  completed: false,
  productionTouched: false,
  project,
  checks: [],
  cleanupFailures: 0,
  browserErrors: [],
};
const output = new URL("../dist/meals-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const save = () =>
  writeFile(
    new URL("../dist/local-windows-meals-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch(url, init) {
      assert.equal(new URL(url instanceof Request ? url.url : String(url)).origin, origin);
      return fetch(url, {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    },
  },
};
const admin = createClient(origin, keys.secret, options),
  users = [];
let browser;
const ok = (r) => {
  if (r.error) {
    report.backendCode = r.error.code;
    throw new Error("backend_check_failed");
  }
  return r.data;
};
async function check(name, fn) {
  report.stage = name;
  try {
    await fn();
    report.checks.push({ name, passed: true });
  } catch (e) {
    report.checks.push({ name, passed: false });
    report.failure = e.code ?? e.name;
    report.message = String(e.message)
      .replace(/sb_secret_\S+|eyJ\S+/g, "[redacted]")
      .slice(0, 700);
    throw e;
  } finally {
    await save();
  }
}
const family = (u, action, id, revision = 0, data = {}) =>
  u.client.rpc("kitchen_family_change", {
    _action: action,
    _id: id,
    _revision: revision,
    _data: data,
  });
const hash = (token) => createHash("sha256").update(token).digest("hex");
async function invite(u, group, revision) {
  const token = randomBytes(32).toString("hex"),
    id = randomUUID();
  ok(
    await u.client.rpc("kitchen_invite_create", {
      _id: id,
      _household_id: group,
      _revision: revision,
      _hash: hash(token),
    }),
  );
  return { id, token };
}
const accept = (u, token) =>
  u.client.rpc("kitchen_invite_accept", {
    _hash: hash(token),
    _display_name: "Testmedlem",
    _adult_confirmed: true,
  });
async function shell(script, args = []) {
  return new Promise((resolve, reject) =>
    execFile(
      `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe`,
      ["-NoProfile", "-File", fileURLToPath(new URL(script, import.meta.url)), ...args],
      { windowsHide: true, timeout: 240000 },
      (e, out) => (e ? reject(new Error("snapshot_rehearsal_failed")) : resolve(JSON.parse(out))),
    ),
  );
}
try {
  await check("exact test target and empty-data preflight", async () => {
    assert.equal(ok(await admin.auth.admin.listUsers()).users.length, 0);
    assert.equal(ok(await admin.from("wines").select("id")).length, 0);
    ok(await admin.from("kitchen_config").update({ meals_enabled: true }).eq("id", true));
  });
  for (let i = 0; i < 3; i++) {
    const email = `meals-${randomUUID()}@example.test`,
      password = randomUUID() + "Aa9!";
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const item = {
      id: user.id,
      email,
      password,
      client: createClient(origin, keys.publishable, options),
    };
    users.push(item);
    item.auth = ok(await item.client.auth.signInWithPassword({ email, password })).session;
    ok(
      await admin
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", item.id),
    );
  }
  const [owner, peer, other] = users,
    group = randomUUID(),
    group2 = randomUUID(),
    privateId = randomUUID(),
    childId = randomUUID(),
    peerId = randomUUID();
  let firstInvite;
  await check("private profiles, explicit sharing and isolated households", async () => {
    ok(
      await family(owner, "create_household", group, 0, {
        name: "Testbordet",
        displayName: "Testägare",
        adultConfirmed: true,
      }),
    );
    ok(
      await family(other, "create_household", group2, 0, {
        name: "Annat testbord",
        displayName: "Annan",
        adultConfirmed: true,
      }),
    );
    ok(
      await family(owner, "save_diner", privateId, 0, {
        document: { name: "Privat vuxen", kind: "adult", preferences: [] },
        householdId: null,
        shared: false,
      }),
    );
    ok(
      await family(owner, "save_diner", childId, 0, {
        document: {
          name: "Testbarn",
          kind: "child",
          preferences: [{ attribute: "ingredient", value: "svamp", direction: -1 }],
        },
        householdId: group,
        shared: true,
      }),
    );
    assert.equal(ok(await peer.client.from("kitchen_diners").select("id")).length, 0);
    firstInvite = await invite(owner, group, 1);
    assert.equal(ok(await accept(peer, firstInvite.token)).status, "joined");
    assert.equal(ok(await accept(peer, firstInvite.token)).status, "joined");
    assert.deepEqual(
      ok(await peer.client.from("kitchen_diners").select("id")).map((r) => r.id),
      [childId],
    );
    assert.equal(ok(await other.client.from("kitchen_diners").select("id")).length, 0);
    assert.ok((await peer.client.from("kitchen_household_invites").select("token_hash")).error);
    assert.ok((await owner.client.from("kitchen_diners").delete().eq("id", privateId)).error);
    assert.ok(
      (
        await family(peer, "save_diner", childId, 1, {
          document: { name: "Hijack", kind: "adult", preferences: [] },
          householdId: null,
          shared: false,
        })
      ).error,
    );
    ok(
      await family(peer, "save_diner", peerId, 0, {
        document: { name: "Testmedlemmens profil", kind: "adult", preferences: [] },
        householdId: group,
        shared: true,
      }),
    );
    assert.equal(ok(await owner.client.from("food_signals").select("id")).length, 0);
    const raceGroup = randomUUID();
    ok(
      await family(owner, "create_household", raceGroup, 0, {
        name: "Samtidigt test",
        displayName: "Ägare",
        adultConfirmed: true,
      }),
    );
    const racing = await invite(owner, raceGroup, 1);
    const results = await Promise.all([accept(peer, racing.token), accept(other, racing.token)]);
    assert.deepEqual(results.map((r) => ok(r).status).sort(), ["invalid", "joined"]);
    assert.equal(
      ok(await admin.from("kitchen_household_members").select("id").eq("household_id", raceGroup))
        .length,
      2,
    );
    ok(await family(owner, "delete_household", raceGroup, 2));
  });
  let version,
    session,
    wineId = randomUUID(),
    foreignWine = randomUUID(),
    mealId = randomUUID();
  const dish = {
    title: "Testets tomatsoppa",
    description: "Syntetiskt testrecept",
    servings: 2,
    totalMinutes: 20,
    image: "none",
    sourceNote: "Test fixture",
    notes: "",
    ingredients: [
      { id: randomUUID(), name: "Tomat", amount: 400, unit: "g" },
      { id: randomUUID(), name: "Grädde", amount: 1, unit: "dl" },
    ],
    steps: [
      {
        id: randomUUID(),
        title: "Tillaga",
        text: "Följ ditt granskade recept.",
        timerSeconds: null,
      },
    ],
  };
  await check(
    "owned completed meal and three distinct ratings, no inventory or memory writes",
    async () => {
      version = ok(
        await owner.client.rpc("kitchen_save_recipe", {
          _recipe_id: randomUUID(),
          _version_id: randomUUID(),
          _expected_revision: 0,
          _document: dish,
        }),
      );
      session = ok(
        await owner.client.rpc("kitchen_save_session", {
          _id: randomUUID(),
          _version_id: version.id,
          _expected_revision: 0,
          _request_id: randomUUID(),
          _state: {
            status: "running",
            activeStep: 0,
            servings: 2,
            checkedIngredientIds: [],
            timers: [],
          },
        }),
      );
      session = ok(
        await owner.client.rpc("kitchen_save_session", {
          _id: session.id,
          _version_id: version.id,
          _expected_revision: session.revision,
          _request_id: randomUUID(),
          _state: { ...session.state, status: "completed" },
          _feedback: { rating: 4, note: "" },
        }),
      );
      ok(
        await admin.from("wines").insert([
          {
            id: wineId,
            user_id: owner.id,
            wine_name: "Testets friska vita",
            wine_type: "white",
            quantity: 2,
            body: 6,
            acidity: 8,
            tannin: 1,
            sweetness: 2,
          },
          { id: foreignWine, user_id: peer.id, wine_name: "Privat testvin", quantity: 1 },
        ]),
      );
      const input = {
        sessionId: session.id,
        wineId,
        wineRating: 5,
        pairingRating: 3,
        note: "Syntetisk bedömning",
      };
      const request = { _id: mealId, _revision: 0, _input: input };
      ok(await owner.client.rpc("kitchen_meal_save", request));
      ok(await owner.client.rpc("kitchen_meal_save", request));
      const m = ok(await owner.client.from("meal_wine_links").select("*").single());
      assert.deepEqual([m.food_rating, m.wine_rating, m.pairing_rating, m.revision], [4, 5, 3, 1]);
      assert.ok(
        (
          await owner.client.rpc("kitchen_meal_save", {
            ...request,
            _input: { ...input, wineRating: 1 },
          })
        ).error,
      );
      assert.ok(
        (
          await owner.client.rpc("kitchen_meal_save", {
            _id: randomUUID(),
            _revision: 0,
            _input: { ...input, wineId: foreignWine },
          })
        ).error,
      );
      assert.equal(ok(await peer.client.from("meal_wine_links").select("id")).length, 0);
      assert.equal(
        ok(await owner.client.from("wines").select("quantity").eq("id", wineId).single()).quantity,
        2,
      );
      assert.equal(ok(await owner.client.from("food_signals").select("id")).length, 0);
    },
  );
  const { chromium } = await import(
    pathToFileURL(
      `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
    ).href
  );
  const { default: AxeBuilder } = await import(
    pathToFileURL(
      `${process.env.LOCALAPPDATA}/WineSnapHosting/qa-runtime/node_modules/@axe-core/playwright/dist/index.mjs`,
    ).href
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage();
  page.on("pageerror", (e) => report.browserErrors.push(e.name));
  await check(
    "real login, pairing both directions, child wine separation and recipe handoff",
    async () => {
      await page.goto(app + "/login");
      await page.locator("#email").fill(owner.email);
      await page.locator("#password").fill(owner.password);
      await page.getByRole("button", { name: /^(Sign In|Logga in)$/ }).click();
      await page.waitForURL(app + "/");
      await page.goto(app + "/kitchen#pairings");
      await page.getByRole("heading", { name: "Mat & vin", exact: true }).waitFor();
      await page.getByLabel("Visa vinförslag till vuxna från min vinkällare").check();
      await page.getByLabel("Rätt", { exact: true }).selectOption(version.id);
      await page.getByRole("heading", { name: "Testets friska vita", exact: true }).waitFor();
      await page.getByText("Bra utgångspunkt", { exact: true }).waitFor();
      await page.getByLabel("Testbarn (barn)", { exact: true }).check();
      assert.equal(
        await page.getByRole("heading", { name: "Testets friska vita", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByLabel("Visa vinförslag till vuxna från min vinkällare").isDisabled(),
        true,
      );
      await page.getByLabel("Testbarn (barn)", { exact: true }).uncheck();
      await page.getByLabel("Från vinet", { exact: true }).check();
      await page.getByRole("heading", { name: dish.title, exact: true }).waitFor();
      await page.getByRole("button", { name: "Öppna recept", exact: true }).first().click();
      await page.getByRole("button", { name: "Börja laga", exact: true }).waitFor();
      await page.getByRole("button", { name: "Vin till maten", exact: true }).click();
      await page.getByRole("heading", { name: "Mat & vin", exact: true }).waitFor();
    },
  );
  await check(
    "family editor, explicit sharing, meal editor and responsive accessibility",
    async () => {
      await page.goto(app + "/kitchen#family");
      await page.getByRole("heading", { name: "Familj & matönskemål", exact: true }).waitFor();
      await page.getByRole("button", { name: "Ny profil", exact: true }).click();
      await page.getByLabel("Namn eller smeknamn").fill("Webbprofil");
      await page.getByRole("button", { name: "Spara profil", exact: true }).click();
      await page.getByText("Webbprofil", { exact: true }).waitFor();
      for (const width of [360, 390, 1024, 1440]) {
        await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
        for (const view of ["family", "pairings", "meals"]) {
          await page.goto(app + "/kitchen#" + view);
          await page.getByRole("heading", { level: 1 }).waitFor();
          await page
            .getByText(
              view === "family"
                ? "Webbprofil"
                : view === "meals"
                  ? "Syntetisk bedömning"
                  : "Testbarn (barn)",
              { exact: true },
            )
            .waitFor();
          if (view === "pairings") {
            await page.getByLabel("Visa vinförslag till vuxna från min vinkällare").check();
            await page.getByRole("heading", { name: "Testets friska vita", exact: true }).waitFor();
          }
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          const audit = await new AxeBuilder({ page }).include(".kitchen").analyze();
          report.lastAxe = audit.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          }));
          assert.deepEqual(report.lastAxe, []);
          await page.screenshot({
            path: fileURLToPath(new URL(`${view}-${width}.png`, output)),
            fullPage: true,
          });
        }
      }
      await page.goto(app + "/kitchen#meals");
      await page.getByRole("button", { name: "Redigera måltid", exact: true }).click();
      await page.getByLabel("Kombinationens betyg").selectOption("4");
      await page.getByRole("button", { name: "Spara måltid", exact: true }).click();
      await page
        .getByText("Måltiden sparades. Inget smakminne eller flaskantal har ändrats.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        ok(await owner.client.from("meal_wine_links").select("pairing_rating").single())
          .pairing_rating,
        4,
      );
    },
  );
  await check(
    "wine pairing page uses saved evidence, honest empty state and owned recipe handoff",
    async () => {
      await page.goto(app + `/wine/${wineId}/pairings`);
      await page
        .getByText(
          /^(Inga matförslag är sparade för detta vin\.|No food suggestions are saved for this wine\.)$/,
        )
        .waitFor();
      assert.equal(await page.locator("main svg.lucide-star").count(), 0);
      ok(
        await admin
          .from("wines")
          .update({
            food_pairings: [
              {
                dish: "Syntetiskt matförslag",
                reason: "Ett sparat analysförslag, inte en provad kombination.",
              },
            ],
          })
          .eq("id", wineId),
      );
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await page.getByRole("heading", { name: "Syntetiskt matförslag", exact: true }).waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({
          path: fileURLToPath(new URL(`wine-pairings-${width}.png`, output)),
          fullPage: true,
        });
      }
      await page
        .getByRole("link", { name: /Hitta recept till vinet|Find recipes for this wine/ })
        .click();
      await page.getByLabel("Visa vinförslag till vuxna från min vinkällare").check();
      assert.equal(await page.getByLabel("Från vinet", { exact: true }).isChecked(), true);
    },
  );
  await check("offline hides shared preferences and online reload verifies access", async () => {
    await page.goto(app + "/kitchen#family");
    await page.getByText("Testmedlemmens profil", { exact: true }).waitFor();
    await context.setOffline(true);
    await page.getByText("Offline. Delade uppgifter är dolda.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Testmedlemmens profil", { exact: true }).count(), 0);
    await context.setOffline(false);
    await page.getByText("Testmedlemmens profil", { exact: true }).waitFor();
  });
  await check("populated encrypted v4 snapshot and isolated 35-table restore", async () => {
    const backup = await shell("./run-local-windows-operations.ps1", ["-Action", "Backup"]);
    assert.equal(backup.verifiedTables, 35);
    const restored = await shell("./rehearse-local-windows-snapshot.ps1");
    assert.equal(restored.tables, 35);
    assert.equal(restored.accounts, 3);
    report.restore = restored;
  });
  await check(
    "immediate RLS revocation, expired codes and removed-member reuse barrier",
    async () => {
      const expired = await invite(owner, group, 2);
      ok(
        await admin
          .from("kitchen_household_invites")
          .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
          .eq("id", expired.id),
      );
      assert.equal(ok(await accept(other, expired.token)).status, "invalid");
      ok(await family(owner, "remove_member", group, 2, { userId: peer.id }));
      assert.deepEqual(
        ok(await peer.client.from("kitchen_diners").select("id")).map((r) => r.id),
        [peerId],
      );
      assert.equal(ok(await accept(peer, firstInvite.token)).status, "invalid");
      const revoked = await invite(owner, group, 3);
      ok(await owner.client.rpc("kitchen_invite_revoke", { _id: revoked.id }));
      assert.equal(ok(await accept(peer, revoked.token)).status, "invalid");
      for (let i = 0; i < 10; i++) await accept(other, randomBytes(32).toString("hex"));
      assert.equal(ok(await accept(other, revoked.token)).status, "rate_limited");
      ok(await family(owner, "delete_household", group, 3));
      assert.equal(
        ok(
          await peer.client.from("kitchen_diners").select("household_id").eq("id", peerId).single(),
        ).household_id,
        null,
      );
    },
  );
  await check(
    "privacy export, global memory reset, account erasure and no browser errors",
    async () => {
      const response = await fetch(app + "/api/privacy/privacy-export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${owner.auth.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 200);
      const exported = await response.json();
      const tables = exported.tables ?? exported.data?.tables;
      assert.ok(tables?.kitchen_diners?.length > 0);
      assert.equal(tables?.meal_wine_links?.length, 1);
      ok(await admin.rpc("reset_privacy_memory", { _user_id: owner.id }));
      assert.equal(ok(await owner.client.from("meal_wine_links").select("id")).length, 1);
      for (const row of ok(await owner.client.from("kitchen_diners").select("document")))
        assert.deepEqual(row.document.preferences, []);
      ok(await admin.rpc("request_account_erasure", { _user_id: owner.id }));
      assert.equal(ok(await owner.client.rpc("meals_access")), false);
      assert.deepEqual(report.browserErrors, []);
    },
  );
  report.completed = true;
} catch {
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const user of users) {
    try {
      const r = await admin.auth.admin.deleteUser(user.id);
      if (r.error) report.cleanupFailures++;
    } catch {
      report.cleanupFailures++;
    }
  }
  try {
    assert.equal(ok(await admin.auth.admin.listUsers()).users.length, 0);
    for (const table of [
      "kitchen_households",
      "kitchen_household_members",
      "kitchen_household_invites",
      "kitchen_diners",
      "meal_wine_links",
      "wines",
      "cooking_sessions",
    ])
      assert.equal(ok(await admin.from(table).select("id")).length, 0);
    report.testRowsRemoved = true;
  } catch {
    report.cleanupFailures++;
  }
  if (report.cleanupFailures) {
    report.completed = false;
    process.exitCode = 1;
  }
  await save();
  console.log(
    JSON.stringify({
      completed: report.completed,
      checks: report.checks.length,
      cleanupFailures: report.cleanupFailures,
      productionTouched: false,
    }),
  );
}
