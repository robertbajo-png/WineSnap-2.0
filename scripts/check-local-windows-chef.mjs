import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.argv.length, 2);
const project = "pzniyupmgwvlldvztzqh",
  origin = `https://${project}.supabase.co`,
  app = "http://127.0.0.1:5210";
let raw = "";
for await (const part of process.stdin) {
  raw += part;
  assert.ok(raw.length <= 16384);
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
  providerCalls: [],
};
const output = new URL("../dist/chef-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const save = () =>
  writeFile(
    new URL("../dist/local-windows-chef-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
async function check(name, action) {
  report.stage = name;
  try {
    await action();
    report.checks.push({ name, passed: true });
  } catch (error) {
    report.checks.push({ name, passed: false });
    report.failure = error.code ?? error.name;
    let message = String(error.message);
    for (const secret of [
      ...Object.values(keys),
      ...users.flatMap((u) => [u.email, u.password, u.auth.access_token, u.auth.refresh_token]),
    ])
      if (typeof secret === "string" && secret.length > 5)
        message = message.replaceAll(secret, "[redacted]");
    report.failureMessage = message.slice(0, 900);
    throw error;
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
const admin = createClient(origin, keys.secret, options),
  users = [];
let browser, page, draft, version, session, feedback;
const tables = [
  "food_memory_state",
  "food_signals",
  "food_memory_tombstones",
  "chef_conversations",
  "chef_messages",
  "chef_requests",
];
const seenRequests = new Set();
async function powershell(script, args = []) {
  return new Promise((resolve, reject) =>
    execFile(
      `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe`,
      ["-NoProfile", "-File", fileURLToPath(new URL(script, import.meta.url)), ...args],
      { windowsHide: true, timeout: 180000 },
      (error, stdout) =>
        error ? reject(new Error("snapshot_rehearsal_failed")) : resolve(JSON.parse(stdout)),
    ),
  );
}
const ok = (r) => {
  if (r.error) {
    report.backendCode = r.error.code ?? r.error.status;
    throw new Error("backend_check_failed");
  }
  return r.data;
};
const emptyContext = { recipeVersionId: null, sessionId: null, sessionRevision: null };
async function chef(user, data, status = 200) {
  const response = await fetch(app + "/api/chef", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.auth.access_token}`,
    },
    body: JSON.stringify(data),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(65000),
  });
  const result = await response.json();
  if (response.status !== status)
    report.apiFailure = { status: response.status, code: result.error };
  assert.equal(response.status, status);
  if (status === 200 && result.model && !seenRequests.has(data.requestId))
    report.providerCalls.push({
      action: data.action,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
    });
  if (status === 200) seenRequests.add(data.requestId);
  return result;
}
try {
  ok(await admin.from("kitchen_config").select("chef_enabled").single());
  ok(
    await admin.from("kitchen_config").update({ enabled: true, chef_enabled: true }).eq("id", true),
  );
  for (let i = 0; i < 2; i++) {
    const email = `chef-qa-${randomUUID()}@example.test`,
      password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const client = createClient(origin, keys.publishable, options);
    users.push({
      id: user.id,
      email,
      password,
      client,
      auth: ok(await client.auth.signInWithPassword({ email, password })).session,
    });
    ok(
      await admin
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", user.id),
    );
  }
  const [owner, peer] = users;
  await check("explicit preference, own RLS and direct-write denial", async () => {
    ok(
      await owner.client.rpc("food_memory_change", {
        _action: "add",
        _id: randomUUID(),
        _entry: { attribute: "ingredient", value: "basilika", direction: 1 },
      }),
    );
    assert.equal(ok(await peer.client.from("food_signals").select("*")).length, 0);
    assert.ok((await owner.client.from("food_signals").delete().eq("user_id", owner.id)).error);
    assert.ok((await owner.client.from("food_memory_tombstones").select("*")).error);
  });
  await check("live contextual memory chat, atomic exchange and cached retry", async () => {
    const input = {
      action: "chat",
      requestId: randomUUID(),
      context: emptyContext,
      conversationId: randomUUID(),
      conversationRevision: 0,
      message:
        "Vilken ingrediens har jag uttryckligen sagt att jag gillar? Svara kort utan att gissa.",
    };
    const result = await chef(owner, input);
    assert.match(result.answer.toLowerCase(), /basilika/);
    const cached = await chef(owner, input);
    assert.deepEqual(cached, result);
    assert.equal(ok(await owner.client.from("chef_messages").select("id")).length, 2);
    assert.equal(ok(await peer.client.from("chef_messages").select("id")).length, 0);
    await chef(peer, input, 409);
    await chef(owner, { ...input, requestId: randomUUID() }, 409);
  });
  await check("live structured recipe is draft only until manual saving", async () => {
    const result = await chef(owner, {
      action: "generate",
      requestId: randomUUID(),
      context: emptyContext,
      prompt:
        "En enkel vegetarisk tomatsoppa med vita bönor och basilika. Exakt två portioner, högst 30 minuter. Inga säkerhets- eller näringspåståenden.",
      servings: 2,
      maxMinutes: 30,
    });
    draft = result.draft;
    assert.ok(draft.ingredients.length > 1 && draft.steps.length > 0);
    assert.equal(draft.servings, 2);
    assert.equal(draft.image, "none");
    assert.equal(ok(await owner.client.from("kitchen_recipes").select("id")).length, 0);
    version = ok(
      await owner.client.rpc("kitchen_save_recipe", {
        _recipe_id: randomUUID(),
        _version_id: randomUUID(),
        _expected_revision: 0,
        _document: draft,
      }),
    );
    assert.equal(version.revision, 1);
  });
  await check("live adaptation keeps pinned cooking state unchanged", async () => {
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
    const context = {
      recipeVersionId: version.id,
      sessionId: session.id,
      sessionRevision: session.revision,
    };
    const result = await chef(owner, {
      action: "adapt",
      requestId: randomUUID(),
      context,
      prompt:
        "Gör en enkel variant med morot, behåll tomat och bönor. Exakt två portioner och högst 30 minuter.",
      servings: 2,
      maxMinutes: 30,
    });
    assert.ok(result.draft);
    assert.equal(ok(await owner.client.from("kitchen_recipe_versions").select("id")).length, 1);
    assert.deepEqual(ok(await owner.client.from("cooking_sessions").select("*").single()), session);
    await chef(
      peer,
      {
        action: "adapt",
        requestId: randomUUID(),
        context,
        prompt: "Ändra",
        servings: 2,
        maxMinutes: 30,
      },
      404,
    );
    await chef(
      owner,
      {
        action: "chat",
        requestId: randomUUID(),
        context: { ...context, sessionRevision: 999 },
        message: "Vilket steg?",
        conversationId: randomUUID(),
        conversationRevision: 0,
      },
      409,
    );
  });
  await check("safety interception uses no provider and stores no medical prompt", async () => {
    const result = await chef(owner, {
      action: "chat",
      requestId: randomUUID(),
      context: emptyContext,
      conversationId: randomUUID(),
      conversationRevision: 0,
      message: "Jag har diabetes. Är rå kyckling säkert att äta?",
    });
    assert.equal(result.safety, true);
    assert.equal(result.model, null);
    assert.equal(result.inputTokens, 0);
    assert.doesNotMatch(
      JSON.stringify(ok(await owner.client.from("chef_messages").select("content"))),
      /diabetes|rå kyckling/,
    );
  });
  await check("live feedback extraction creates exact-source pending evidence only", async () => {
    ok(
      await owner.client.rpc("kitchen_save_session", {
        _id: session.id,
        _version_id: version.id,
        _expected_revision: session.revision,
        _request_id: randomUUID(),
        _state: { ...session.state, status: "completed" },
        _feedback: { rating: 4, note: "Jag gillar tomat och krämig konsistens. Jag ogillar lök." },
      }),
    );
    feedback = ok(await owner.client.from("cooking_feedback").select("*").single());
    const result = await chef(owner, {
      action: "extract",
      requestId: randomUUID(),
      context: emptyContext,
      feedbackId: feedback.id,
    });
    assert.ok(result.candidateCount > 0);
    const rows = ok(
      await owner.client.from("food_signals").select("*").eq("source_kind", "feedback"),
    );
    assert.ok(
      rows.every((r) => r.status === "pending" && feedback.note.includes(r.source_excerpt)),
    );
    await chef(
      peer,
      {
        action: "extract",
        requestId: randomUUID(),
        context: emptyContext,
        feedbackId: feedback.id,
      },
      404,
    );
  });
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
  const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await browserContext.newPage();
  page.on("pageerror", (error) => report.browserErrors.push(error.name));
  await check("real app login, confirmed memory and exact evidence review", async () => {
    await page.goto(app + "/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.getByRole("button", { name: /^(Sign In|Logga in)$/ }).click();
    await page.waitForURL(app + "/");
    await page.goto(app + "/kitchen#memory");
    await page.getByRole("heading", { name: "Matminne", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Gillar basilika", exact: true }).waitFor();
    await page.getByRole("button", { name: "Bekräfta", exact: true }).first().click();
    await page.getByText("Förslaget är bekräftat.", { exact: true }).waitFor();
    await page.getByLabel("Matpreferens", { exact: true }).fill("citron");
    await page.getByRole("button", { name: "Lägg till", exact: true }).click();
    await page.getByRole("heading", { name: "Gillar citron", exact: true }).waitFor();
  });
  await check("memory and Chef mobile, tablet and desktop accessibility", async () => {
    for (const width of [360, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
      for (const view of ["memory", "chef"]) {
        await page.goto(app + "/kitchen#" + view);
        await page
          .getByRole("heading", { name: view === "memory" ? "Matminne" : "AI-kocken", exact: true })
          .waitFor();
        if (view === "memory")
          await page.getByRole("heading", { name: "Gillar citron", exact: true }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          true,
        );
        const audit = await new AxeBuilder({ page }).include(".kitchen").analyze();
        if (audit.violations.length)
          report.axeFailures = audit.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          }));
        assert.equal(audit.violations.length, 0);
        await page.screenshot({
          path: fileURLToPath(new URL(`${view}-${width}.png`, output)),
          fullPage: true,
        });
      }
    }
  });
  await check(
    "per-memory correction UI preserves source history and replaces preference",
    async () => {
      await page.goto(app + "/kitchen#memory");
      await page.getByRole("button", { name: "Korrigera citron", exact: true }).click();
      await page.getByLabel("Inställning", { exact: true }).selectOption("-1");
      await page.getByRole("button", { name: "Spara rättning", exact: true }).click();
      await page.getByRole("heading", { name: "Undviker citron", exact: true }).waitFor();
      assert.equal(ok(await owner.client.from("chef_messages").select("id")).length, 0);
      assert.ok(
        ok(await owner.client.from("food_signals").select("status").eq("value", "citron")).some(
          (row) => row.status === "corrected",
        ),
      );
      await page.goto(app + "/kitchen#chef");
    },
  );
  await check("real Chef UI calls Gemini and renders Markdown without mutation", async () => {
    await page
      .getByLabel("Din fråga", { exact: true })
      .fill(
        "Ge ett kort förslag på en vardagsrätt med min bekräftade favoritingrediens basilika. Använd en rubrik på nivå tre (###) följt av en kort punktlista.",
      );
    const request = page.waitForResponse(
      (r) => r.url() === app + "/api/chef" && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Skicka", exact: true }).click();
    const response = await request;
    assert.equal(response.status(), 200);
    const result = await response.json();
    assert.ok(result.model);
    await page.locator(".chef-message.assistant").waitFor();
    assert.ok(await page.locator(".chef-message.assistant .chat-answer").innerText());
    const answerAudit = await new AxeBuilder({ page }).include(".kitchen").analyze();
    report.answerAudit = answerAudit.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
      details: v.nodes.map((n) => n.failureSummary),
    }));
    if (answerAudit.violations.length)
      await page.screenshot({
        path: fileURLToPath(new URL("answer-audit-failure.png", output)),
        fullPage: true,
      });
    assert.equal(answerAudit.violations.length, 0);
    await page.screenshot({
      path: fileURLToPath(new URL("chef-answer-1440.png", output)),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      (await new AxeBuilder({ page }).include(".kitchen").analyze()).violations.length,
      0,
    );
    await page.screenshot({
      path: fileURLToPath(new URL("chef-answer-390.png", output)),
      fullPage: true,
    });
  });
  await check("real recipe generation UI requires review and explicit save", async () => {
    await page.getByRole("button", { name: "Skapa recept", exact: true }).click();
    await page
      .getByLabel("Vad ska receptet innehålla eller ändra?", { exact: true })
      .fill(
        "En enkel vegetarisk risrätt med vita bönor och basilika, utan citron. Två portioner och högst 30 minuter.",
      );
    const request = page.waitForResponse(
      (r) => r.url() === app + "/api/chef" && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Ta fram förslag", exact: true }).click();
    assert.equal((await request).status(), 200);
    await page.getByRole("button", { name: "Granska recept", exact: true }).waitFor();
    assert.equal(ok(await owner.client.from("kitchen_recipes").select("id")).length, 1);
    await page.getByRole("button", { name: "Granska recept", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Receptnamn", { exact: true }).fill("Synthetic Chef UI recipe");
    await dialog.getByRole("button", { name: "Spara recept", exact: true }).click();
    await page.getByRole("heading", { name: "Synthetic Chef UI recipe", exact: true }).waitFor();
    assert.equal(ok(await owner.client.from("kitchen_recipes").select("id")).length, 2);
    await page.screenshot({
      path: fileURLToPath(new URL("reviewed-recipe-390.png", output)),
      fullPage: true,
    });
  });
  await check("forget UI clears chats and prevents re-extraction", async () => {
    await page.goto(app + "/kitchen#memory");
    await page.getByRole("button", { name: "Glöm basilika", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Glöm", exact: true }).click();
    await page.getByText("Matminnet är uppdaterat.", { exact: true }).waitFor();
    assert.equal(ok(await owner.client.from("chef_messages").select("id")).length, 0);
    const tombstones = ok(
      await admin.from("food_memory_tombstones").select("*").eq("user_id", owner.id),
    );
    assert.ok(tombstones.length > 0);
    assert.ok(tombstones.every((t) => /^[a-f0-9]{64}$/.test(t.value_hash)));
  });
  await check(
    "encrypted v3 backup restores all 30 sections including synthetic Chef rows",
    async () => {
      const id = randomUUID();
      ok(
        await admin.rpc("chef_claim_request", {
          u: owner.id,
          r: id,
          a: "chat",
          h: "b".repeat(64),
          c: randomUUID(),
          cr: 0,
        }),
      );
      ok(
        await admin.rpc("chef_finish_request", {
          u: owner.id,
          r: id,
          result: {
            answer: "Synthetic snapshot fixture",
            model: "synthetic",
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 0,
          },
          prompt: "Synthetic snapshot fixture",
        }),
      );
      const backup = await powershell("./run-local-windows-operations.ps1", ["-Action", "Backup"]);
      assert.equal(backup.completed, true);
      assert.equal(backup.verifiedTables, 30);
      const restored = await powershell("./rehearse-local-windows-snapshot.ps1");
      assert.equal(restored.completed, true);
      assert.equal(restored.tables, 30);
      assert.equal(restored.accounts, 2);
      assert.equal(restored.fullDatabaseBackup, false);
      assert.equal(restored.cleanupCompleted, true);
      report.snapshot = {
        file: backup.backupFile,
        tables: restored.tables,
        rows: restored.rows,
        accounts: restored.accounts,
      };
    },
  );
  await check("private export includes all Chef data and retention is callable", async () => {
    const response = await fetch(app + "/api/privacy/privacy-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.auth.access_token}`,
      },
      body: "{}",
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    for (const table of tables) assert.ok(Array.isArray(result.tables[table]));
    const retention = ok(await admin.rpc("run_chef_retention", { _execute: true }));
    assert.equal(typeof retention.moreWork, "boolean");
  });
  await check(
    "reset preserves recipes, excludes old feedback and invalidates stale responses",
    async () => {
      await page.getByRole("button", { name: "Nollställ matminne", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Nollställ", exact: true })
        .click();
      await page.getByText("Inga bekräftade matpreferenser ännu.", { exact: true }).waitFor();
      assert.equal(ok(await owner.client.from("food_signals").select("id")).length, 0);
      assert.equal(ok(await owner.client.from("kitchen_recipes").select("id")).length, 2);
      assert.equal(ok(await owner.client.from("cooking_feedback").select("id")).length, 1);
      const claimId = randomUUID();
      ok(
        await admin.rpc("chef_claim_request", {
          u: owner.id,
          r: claimId,
          a: "extract",
          h: "a".repeat(64),
        }),
      );
      assert.ok(
        (
          await admin.rpc("chef_finish_request", {
            u: owner.id,
            r: claimId,
            result: {},
            prompt: "",
            feedback: feedback.id,
            candidates: [],
          })
        ).error,
      );
      await chef(
        owner,
        {
          action: "extract",
          requestId: randomUUID(),
          context: emptyContext,
          feedbackId: feedback.id,
        },
        409,
      );
    },
  );
  await check(
    "atomic Chef quota admits only remaining requests under concurrency without provider calls",
    async () => {
      const window = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
      const counter = ok(
        await admin
          .from("ai_rate_limits")
          .select("request_count")
          .eq("user_id", owner.id)
          .eq("function_name", "chef:generate")
          .eq("window_started_at", window)
          .maybeSingle(),
      );
      const expected = Math.max(0, 5 - (counter?.request_count ?? 0));
      const results = await Promise.all(
        Array.from({ length: 16 }, () =>
          admin.rpc("chef_claim_request", {
            u: owner.id,
            r: randomUUID(),
            a: "generate",
            h: "c".repeat(64),
          }),
        ),
      );
      assert.equal(results.filter((r) => !r.error).length, expected);
      assert.ok(results.filter((r) => r.error).every((r) => r.error.message === "chef_quota"));
      report.quota = { concurrent: 16, admitted: expected, providerCalls: 0 };
    },
  );
  await check("old JWT blocked immediately on requested erasure", async () => {
    ok(await admin.rpc("request_account_erasure", { _user_id: owner.id }));
    assert.equal(ok(await owner.client.from("food_signals").select("id")).length, 0);
    await chef(
      owner,
      {
        action: "chat",
        requestId: randomUUID(),
        context: emptyContext,
        conversationId: randomUUID(),
        conversationRevision: 0,
        message: "Hjälp",
      },
      403,
    );
  });
  assert.equal(report.browserErrors.length, 0);
  report.completed = true;
} catch {
  report.completed = false;
} finally {
  if (browser) await browser.close();
  for (const user of users) {
    try {
      ok(await admin.auth.admin.deleteUser(user.id));
      for (const table of tables)
        assert.equal(ok(await admin.from(table).select("id").eq("user_id", user.id)).length, 0);
    } catch {
      report.cleanupFailures++;
    }
  }
  if (report.cleanupFailures) report.completed = false;
  await save();
  console.log(
    JSON.stringify({
      completed: report.completed,
      checks: report.checks.length,
      cleanupFailures: report.cleanupFailures,
    }),
  );
  if (!report.completed) process.exitCode = 1;
}
