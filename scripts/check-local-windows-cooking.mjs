import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
assert.equal(process.argv.length, 2);
const project = "pzniyupmgwvlldvztzqh";
const origin = `https://${project}.supabase.co`;
const app = "http://127.0.0.1:5210";
let input = "";
for await (const part of process.stdin) {
  input += part;
  assert.ok(input.length <= 16384);
}
const keys = JSON.parse(input);
input = "";
assert.equal(keys.project, project);
const report = {
  project,
  completed: false,
  productionTouched: false,
  checks: [],
  cleanupFailures: 0,
};
const output = new URL("../dist/cooking-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const save = () =>
  writeFile(
    new URL("../dist/local-windows-cooking-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
async function check(name, action) {
  report.stage = name;
  try {
    await action();
    report.checks.push({ name, passed: true });
  } catch {
    report.checks.push({ name, passed: false });
    throw new Error("cooking_acceptance_failed");
  } finally {
    await save();
  }
}
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
const admin = createClient(origin, keys.secret, options);
function ok(result) {
  if (result.error) {
    report.backendCode = result.error.code ?? result.error.status ?? "unknown";
    throw new Error("cooking_backend_failure");
  }
  return result.data;
}
const users = [];
let browser, page;
const browserErrors = [];
let version, recipe, session;
const anonymous = createClient(origin, keys.publishable, options);
const wait = async (read, predicate, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error("cooking_condition_not_met");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
};
try {
  const config = ok(await admin.from("kitchen_config").select("enabled").eq("id", true).single());
  assert.equal(typeof config.enabled, "boolean");
  ok(await admin.from("kitchen_config").update({ enabled: true }).eq("id", true));
  for (let i = 0; i < 2; i++) {
    const email = `cooking-qa-${randomUUID()}@example.test`,
      password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const client = createClient(origin, keys.publishable, options);
    const auth = ok(await client.auth.signInWithPassword({ email, password })).session;
    users.push({ id: user.id, email, password, client, auth });
    ok(
      await admin
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", user.id),
    );
  }
  const [owner, peer] = users;
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow",
  });
  page = await context.newPage();
  const pageErrors = browserErrors;
  page.on("pageerror", (error) => {
    let message = error.message;
    for (const secret of [
      ...Object.values(keys),
      ...users.flatMap((user) => [
        user.email,
        user.password,
        user.auth.access_token,
        user.auth.refresh_token,
      ]),
    ])
      if (typeof secret === "string" && secret.length > 5)
        message = message.replaceAll(secret, "[redacted]");
    pageErrors.push({ name: error.name, stage: report.stage, message: message.slice(0, 500) });
  });
  const readSession = async () =>
    ok(
      await owner.client
        .from("cooking_sessions")
        .select("*")
        .eq("user_id", owner.id)
        .order("updated_at", { ascending: false })
        .limit(1),
    )[0];
  const saved = () =>
    page.getByRole("status").filter({ hasText: "Sparat" }).waitFor({ timeout: 20000 });
  await check("ordinary login and private empty cookbook", async () => {
    await page.goto(app + "/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.getByRole("button", { name: /^(Sign In|Logga in)$/ }).click();
    await page.waitForURL(app + "/", { timeout: 20000 });
    await page.goto(app + "/kitchen");
    await page.getByRole("heading", { name: "Vad lagar vi idag?" }).waitFor();
    await page.getByRole("heading", { name: "Din första sida i kokboken" }).waitFor();
  });
  await check("save a structured recipe through the real editor", async () => {
    await page.getByRole("button", { name: /Rostad blomkål & krämiga vita bönor/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Receptnamn").fill("Synthetic cooking acceptance");
    await dialog.getByRole("button", { name: "Spara recept", exact: true }).click();
    await page
      .getByRole("heading", { name: "Synthetic cooking acceptance", exact: true })
      .waitFor();
    recipe = ok(
      await owner.client.from("kitchen_recipes").select("*").eq("user_id", owner.id).single(),
    );
    version = ok(
      await owner.client
        .from("kitchen_recipe_versions")
        .select("*")
        .eq("id", recipe.current_version_id)
        .single(),
    );
    assert.equal(version.revision, 1);
    assert.equal(version.document.ingredients[0].amount, 600);
  });
  await check(
    "real JWT RLS isolates owners and denies direct writes and anonymous RPC",
    async () => {
      assert.deepEqual(
        ok(await peer.client.from("kitchen_recipe_versions").select("id").eq("user_id", owner.id)),
        [],
      );
      assert.ok(
        (
          await owner.client
            .from("kitchen_recipe_versions")
            .update({ document: {} })
            .eq("id", version.id)
        ).error,
      );
      assert.ok(
        (
          await peer.client.rpc("kitchen_save_session", {
            _id: randomUUID(),
            _version_id: version.id,
            _expected_revision: 0,
            _request_id: randomUUID(),
            _state: {},
          })
        ).error,
      );
      assert.ok((await anonymous.rpc("kitchen_access")).error);
    },
  );
  await check("portion arithmetic keeps the original version intact", async () => {
    await page.getByRole("button", { name: "Fler portioner" }).click();
    await page.getByText("900 g", { exact: true }).waitFor();
    assert.equal(
      ok(
        await owner.client
          .from("kitchen_recipe_versions")
          .select("document")
          .eq("id", version.id)
          .single(),
      ).document.ingredients[0].amount,
      600,
    );
  });
  await check("start, advance and persist a pinned cooking session", async () => {
    await page.getByRole("button", { name: "Börja laga", exact: true }).click();
    await page.getByRole("heading", { name: "Börja med blomkålen", exact: true }).waitFor();
    session = await wait(readSession, (value) => value?.state.servings === 3);
    assert.equal(session.recipe_version_id, version.id);
    await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
    await saved();
    await wait(readSession, (value) => value?.state.activeStep === 1);
  });
  await check("named timers persist, pause and survive reload", async () => {
    await page.getByRole("button", { name: "Starta 20:00", exact: true }).click();
    await saved();
    await wait(readSession, (value) => value?.state.timers.length === 1);
    await page.getByRole("button", { name: "Pausa Ge den gyllene kanter", exact: true }).click();
    await saved();
    const paused = (await readSession()).state.timers[0];
    assert.equal(paused.deadlineMs, null);
    await page.reload();
    await page.getByRole("button", { name: "Starta Ge den gyllene kanter", exact: true }).waitFor();
    assert.equal((await readSession()).state.timers[0].pausedMs, paused.pausedMs);
  });
  await check("session pause resumes only the timers that were running", async () => {
    await page.getByLabel("Namn", { exact: true }).fill("Synthetic second timer");
    await page.getByLabel("Minuter", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Lägg till timer", exact: true }).click();
    await saved();
    await page.getByRole("button", { name: "Pausa matlagningen", exact: true }).click();
    await saved();
    assert.ok((await readSession()).state.timers.every((timer) => timer.deadlineMs === null));
    await page.reload();
    await page.getByRole("button", { name: "Återuppta matlagningen", exact: true }).click();
    await saved();
    const timers = (await readSession()).state.timers;
    assert.equal(timers[0].deadlineMs, null);
    assert.equal(typeof timers[1].deadlineMs, "number");
  });
  await check("new recipe versions do not rewrite an active cooking session", async () => {
    await page.getByRole("button", { name: "Recept", exact: true }).click();
    await page.getByRole("button", { name: /Synthetic cooking acceptance.*30 min/ }).click();
    await page.getByRole("button", { name: "Redigera recept", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Egna anteckningar").fill("Synthetic revision two");
    await page.getByRole("dialog").getByLabel("Enhet 1", { exact: true }).selectOption("kg");
    assert.equal(
      await page.getByRole("dialog").getByLabel("Mängd 1", { exact: true }).inputValue(),
      "0.6",
    );
    await page.getByRole("button", { name: "Spara ny version", exact: true }).click();
    await page.getByText("Version 2 · 30 min", { exact: true }).waitFor();
    assert.equal((await readSession()).recipe_version_id, version.id);
    await page.getByRole("button", { name: "Matlagning", exact: false }).first().click();
    await page.getByText("Receptversion 1", { exact: true }).waitFor();
  });
  await check("desktop tablet and mobile layout, actual images and timer controls", async () => {
    for (const width of [360, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const violations = result.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
        targets: item.nodes.map((node) => node.target),
      }));
      report.accessibility ??= [];
      report.accessibility.push({ viewport: width, violations });
      assert.equal(violations.length, 0);
      await page.screenshot({
        path: fileURLToPath(new URL(`cook-${width}.png`, output)),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await check("generic offline shell contains no private account or recipe data", async () => {
    const response = await fetch(app + "/kitchen", {
      headers: { cookie: "synthetic-untrusted-cookie" },
    });
    const html = await response.text();
    assert.ok(html.includes("winesnap-kitchen-shell"));
    assert.ok(!html.includes(owner.email));
    assert.ok(!html.includes("Synthetic cooking acceptance"));
    await page.waitForFunction(async () => Boolean(await caches.match("/kitchen")), {
      timeout: 30000,
    });
  });
  await check("offline edits and full offline reload preserve recipe step and timers", async () => {
    await context.setOffline(true);
    await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
    await page.getByRole("heading", { name: "Mixa en len bönkräm", exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Mixa en len bönkräm", exact: true })
      .waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Starta Ge den gyllene kanter", exact: true }).waitFor();
    await page.screenshot({
      path: fileURLToPath(new URL("cook-offline-mobile.png", output)),
      fullPage: true,
    });
    await context.setOffline(false);
    await saved();
    await wait(readSession, (value) => value?.state.activeStep === 2);
  });
  await check("conflicting remote changes require an explicit choice", async () => {
    await context.setOffline(true);
    await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
    await page.getByRole("heading", { name: "Smaka av", exact: true }).waitFor();
    const current = await readSession();
    ok(
      await owner.client.rpc("kitchen_save_session", {
        _id: current.id,
        _version_id: version.id,
        _expected_revision: current.revision,
        _request_id: randomUUID(),
        _state: { ...current.state, activeStep: 0 },
        _feedback: null,
      }),
    );
    await context.setOffline(false);
    await page.getByRole("heading", { name: "Välj vilken matlagning du vill behålla" }).waitFor();
    await page.getByRole("button", { name: "Använd serverns version", exact: true }).click();
    await page.getByRole("heading", { name: "Börja med blomkålen", exact: true }).waitFor();
    assert.equal((await readSession()).state.activeStep, 0);
  });
  await check("another tab cannot silently overwrite the local offline record", async () => {
    const second = await context.newPage();
    await second.goto(app + "/kitchen#cook");
    await second.getByRole("heading", { name: "Börja med blomkålen", exact: true }).waitFor();
    await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
    await page.getByText("Köket ändrades i en annan flik.", { exact: false }).waitFor();
    assert.equal((await readSession()).state.activeStep, 0);
    await second.close();
    await page.getByRole("button", { name: "Hämta uppdateringen", exact: true }).click();
    await page.getByRole("heading", { name: "Börja med blomkålen", exact: true }).waitFor();
  });
  await check("finish stops timers and saves feedback atomically", async () => {
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
      await saved();
    }
    await page.getByRole("button", { name: "Avsluta", exact: true }).click();
    await page.getByRole("button", { name: "4 av 5", exact: true }).click();
    await page.getByLabel("Vad vill du minnas?").fill("Synthetic successful cooking feedback");
    await page.getByRole("button", { name: "Avsluta matlagningen", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 20000 });
    await saved();
    await page.getByRole("heading", { name: "Matlagningen är avslutad", exact: true }).waitFor();
    const finished = await readSession();
    assert.equal(finished.state.status, "completed");
    assert.ok(finished.state.timers.every((timer) => timer.deadlineMs === null));
    assert.equal(
      ok(
        await owner.client
          .from("cooking_feedback")
          .select("rating")
          .eq("session_id", finished.id)
          .single(),
      ).rating,
      4,
    );
  });
  await check(
    "private cooking history survives reload with its original recipe and feedback",
    async () => {
      await page.getByRole("button", { name: "Till kokboken", exact: true }).click();
      await page.reload();
      await page.getByRole("heading", { name: "Senast lagat", exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Synthetic cooking acceptance 4/5", exact: true })
        .click();
      await page.getByText("Synthetic successful cooking feedback", { exact: true }).waitFor();
      await page.getByText("Receptversion 1", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Till kokboken", exact: true }).click();
      await page.waitForFunction(() =>
        [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      );
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 920 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({
          path: fileURLToPath(new URL(`recipes-${width}.png`, output)),
          fullPage: true,
        });
      }
    },
  );
  await check(
    "encrypted backup includes cooking and restores all versioned table sections",
    async () => {
      const pwsh = `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe`;
      const raw = await new Promise((resolve, reject) =>
        execFile(
          pwsh,
          [
            "-NoProfile",
            "-File",
            fileURLToPath(new URL("./run-local-windows-operations.ps1", import.meta.url)),
            "-Action",
            "Backup",
          ],
          { windowsHide: true, timeout: 180000 },
          (error, output) =>
            error ? reject(new Error("backup_acceptance_failed")) : resolve(output),
        ),
      );
      const backup = JSON.parse(raw);
      assert.equal(backup.completed, true);
      assert.ok([24, 30, 35].includes(backup.verifiedTables));
      const restored = await wait(
        async () =>
          JSON.parse(
            await readFile(
              `${process.env.LOCALAPPDATA}/WineSnapHosting/restore-status.json`,
              "utf8",
            ),
          ),
        (value) =>
          value.snapshotFile === backup.backupFile && value.completed && value.cleanupCompleted,
        150000,
      );
      assert.equal(restored.tables, backup.verifiedTables);
      assert.equal(restored.fullDatabaseBackup, false);
    },
  );
  await check("owner export includes all four cooking tables and no peer records", async () => {
    const response = await fetch(app + "/api/privacy/privacy-export", {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.auth.access_token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 200);
    const exported = await response.json();
    for (const table of [
      "kitchen_recipes",
      "kitchen_recipe_versions",
      "cooking_sessions",
      "cooking_feedback",
    ]) {
      assert.ok(exported.tables[table].length > 0);
      assert.ok(exported.tables[table].every((row) => row.user_id === owner.id));
    }
  });
  await check("sign-out clears all private IndexedDB cooking copies", async () => {
    await page.goto(app + "/me");
    await page.getByRole("button", { name: /Sign out|Logga ut/i }).click();
    await wait(
      () =>
        page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open("winesnap-kitchen-v1", 1);
              request.onsuccess = () => {
                const count = request.result
                  .transaction("accounts")
                  .objectStore("accounts")
                  .count();
                count.onsuccess = () => resolve(count.result);
                count.onerror = reject;
              };
              request.onerror = reject;
            }),
        ),
      (count) => count === 0,
    );
  });
  await check(
    "erasure blocks old-session writes and cascades recipes versions sessions feedback",
    async () => {
      ok(await admin.rpc("request_account_erasure", { _user_id: owner.id }));
      assert.deepEqual(ok(await owner.client.from("kitchen_recipe_versions").select("id")), []);
      assert.ok(
        (
          await owner.client.rpc("kitchen_save_recipe", {
            _recipe_id: recipe.id,
            _version_id: randomUUID(),
            _expected_revision: 2,
            _document: version.document,
          })
        ).error,
      );
      ok(await admin.auth.admin.deleteUser(owner.id));
      owner.deleted = true;
      for (const table of [
        "kitchen_recipes",
        "kitchen_recipe_versions",
        "cooking_sessions",
        "cooking_feedback",
      ])
        assert.deepEqual(ok(await admin.from(table).select("id").eq("user_id", owner.id)), []);
    },
  );
  await check("no browser runtime errors or provider/admin credentials in markup", async () => {
    report.browserErrors = pageErrors;
    assert.equal(pageErrors.length, 0);
    const html = await page.content();
    for (const key of [keys.openai, keys.gemini, keys.secret])
      if (key) assert.ok(!html.includes(key));
  });
  report.completed = true;
} catch {
  report.failure = "local_cooking_acceptance_failed";
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: fileURLToPath(new URL("failure.png", output)), fullPage: true })
      .catch(() => undefined);
} finally {
  report.browserErrors = browserErrors;
  await browser?.close();
  for (const user of users) {
    try {
      if (!user.deleted) ok(await admin.auth.admin.deleteUser(user.id));
      ok(await admin.from("privacy_erasure_receipts").delete().eq("user_id", user.id));
    } catch {
      report.cleanupFailures++;
    }
  }
  if (report.cleanupFailures) {
    report.completed = false;
    process.exitCode = 1;
  }
  keys.secret = keys.publishable = keys.openai = keys.gemini = "";
  await save();
  console.log(JSON.stringify({ project, completed: report.completed }));
}
