import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.argv.length, 2, "No connection arguments are accepted");
const project = "pzniyupmgwvlldvztzqh";
const origin = `https://${project}.supabase.co`;
const app = "http://127.0.0.1:5210";
const report = {
  project,
  model: "gemini-3.8-flash",
  completed: false,
  checks: [],
  cleanupFailures: 0,
};
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  assert.ok(input.length <= 16384);
}
const keys = JSON.parse(input);
input = "";
assert.equal(keys.project, project);
assert.ok(keys.gemini);
const testFetch = (url, init) => {
  assert.equal(new URL(url instanceof Request ? url.url : String(url)).origin, origin);
  return fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: testFetch },
};
const admin = createClient(origin, keys.secret, options);
const users = [];
let browser;
const ok = ({ data, error }) => {
  if (error) throw new Error("test_backend_failure");
  return data;
};
const saveReport = async () => {
  await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../dist/local-windows-gemini-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
};
const check = async (name, run) => {
  try {
    await run();
    report.checks.push({ name, passed: true });
    await saveReport();
  } catch {
    report.checks.push({ name, passed: false });
    throw new Error("acceptance_failed");
  }
};
const call = (name, body, token) =>
  fetch(`${app}/api/ai/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(75000),
  });
const screenshot = (name) =>
  fileURLToPath(new URL(`../dist/local-gemini-${name}.png`, import.meta.url));
try {
  for (const [name, body] of [
    ["ask-winesnap", { message: "Wine" }],
    ["taste-suggestions", {}],
    ["wine-suggestions", { wineId: randomUUID() }],
  ]) {
    await check(`${name}: anonymous and invalid JWT rejected`, async () => {
      for (const token of [null, "synthetic-invalid-jwt"]) {
        const response = await call(name, body, token);
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("access-control-allow-origin"), null);
      }
    });
  }
  for (let index = 0; index < 2; index++) {
    const email = `winesnap-gemini-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const fixture = { id: user.id };
    users.push(fixture);
    fixture.client = createClient(origin, keys.publishable, options);
    fixture.session = ok(await fixture.client.auth.signInWithPassword({ email, password })).session;
  }
  const [owner, peer] = users;
  const wine = ok(
    await owner.client
      .from("wines")
      .insert({
        user_id: owner.id,
        producer: "Zehn Morgen",
        wine_name: "Chardonnay & Weisser Burgunder",
        vintage: 2023,
        region: "Nahe",
        country: "Germany",
        wine_type: "white",
        grape_varieties: ["Chardonnay", "Weisser Burgunder"],
        body: 5,
        acidity: 8,
        tannin: 1,
        sweetness: 1,
        oak: 1,
        fruit: 6,
        is_public: false,
      })
      .select("id")
      .single(),
  );
  const { chromium } = await import(
    pathToFileURL(
      `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
    ).href
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addInitScript(
    ({ session, project }) =>
      localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session)),
    { session: owner.session, project },
  );
  const page = await context.newPage();
  const browserErrors = [];
  const hostedCalls = [];
  page.on("pageerror", () => browserErrors.push(true));
  page.on("request", (request) => {
    if (/\/functions\/v1\/(ask-winesnap|taste-suggestions|wine-suggestions)/.test(request.url()))
      hostedCalls.push(true);
  });
  let conversationId;
  await check(
    "mobile chat returns a real Gemini answer and stores the selected model",
    async () => {
      await page.goto(`${app}/ask`);
      const text = "Vilken mat passar till ett friskt vin med Chardonnay? Svara kort på svenska.";
      await page.getByRole("textbox").fill(text);
      const pending = page.waitForResponse(
        (response) => response.url() === `${app}/api/ai/ask-winesnap`,
        { timeout: 90000 },
      );
      await page.getByRole("button", { name: /^(Skicka|Send)$/ }).click();
      const response = await pending;
      report.chatStatus = response.status();
      assert.equal(response.status(), 200);
      assert.equal(response.headers()["cache-control"], "no-store");
      const answer = await response.json();
      assert.ok(answer.message.content.length > 20);
      conversationId = answer.conversationId;
      await page.locator("article").nth(1).waitFor({ state: "visible" });
      assert.ok((await page.locator("article").nth(1).innerText()).length > 20);
      await page.screenshot({ path: screenshot("chat-mobile"), fullPage: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      const messages = ok(
        await owner.client
          .from("ai_messages")
          .select("role,model")
          .eq("conversation_id", conversationId),
      );
      assert.equal(messages.length, 2);
      assert.equal(
        messages.find((message) => message.role === "assistant").model,
        "gemini-3.8-flash",
      );
    },
  );
  await check("another user cannot read or continue the private conversation", async () => {
    assert.deepEqual(
      ok(await peer.client.from("ai_messages").select("id").eq("conversation_id", conversationId)),
      [],
    );
    assert.equal(
      (
        await call(
          "ask-winesnap",
          { message: "Read this conversation", conversationId },
          peer.session.access_token,
        )
      ).status,
      404,
    );
  });
  await check("conversation can continue with Gemini using its saved history", async () => {
    const response = await call(
      "ask-winesnap",
      {
        message: "Ge ett alkoholfritt alternativ till samma mat. Svara med en mening.",
        conversationId,
        language: "sv",
      },
      owner.session.access_token,
    );
    report.continuationStatus = response.status;
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.equal(next.conversationId, conversationId);
    assert.ok(next.message.content);
    assert.equal(
      ok(await owner.client.from("ai_messages").select("id").eq("conversation_id", conversationId))
        .length,
      4,
    );
  });
  await check(
    "personal recommendations render verified identities on mobile and desktop",
    async () => {
      await page.goto(`${app}/for-you`);
      const pending = page.waitForResponse(
        (response) => response.url() === `${app}/api/ai/taste-suggestions`,
        { timeout: 90000 },
      );
      await page.getByRole("button", { name: /Generera förslag|Generate suggestions/ }).click();
      const response = await pending;
      report.personalStatus = response.status();
      assert.equal(response.status(), 200);
      const payload = await response.json();
      assert.ok(payload.suggestions.length > 0);
      assert.ok(
        payload.suggestions.every(
          (wine) => wine.identity_verified && wine.source_url.startsWith("https://"),
        ),
      );
      await page.getByText(payload.suggestions[0].producer, { exact: false }).first().waitFor();
      await page.screenshot({ path: screenshot("recommendations-mobile"), fullPage: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: screenshot("recommendations-desktop"), fullPage: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    },
  );
  await check("similar-wine recommendations use the local server", async () => {
    await page.goto(`${app}/wine/${wine.id}`);
    const pending = page.waitForResponse(
      (response) => response.url() === `${app}/api/ai/wine-suggestions`,
      { timeout: 90000 },
    );
    await page.getByRole("button", { name: /AI Picks|AI-tips/i }).click();
    const response = await pending;
    report.similarStatus = response.status();
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.ok(payload.suggestions.length > 0);
    assert.ok(payload.suggestions.every((wine) => wine.identity_verified && wine.source_url));
  });
  await check("private reference wine is not available to another user", async () => {
    assert.equal(
      (await call("wine-suggestions", { wineId: wine.id }, peer.session.access_token)).status,
      404,
    );
  });
  await check("no unexpected browser errors, hosted AI calls or extra saved wines", async () => {
    assert.equal(hostedCalls.length, 0);
    assert.equal(browserErrors.length, 0);
    assert.equal(ok(await owner.client.from("wines").select("id")).length, 1);
    const markup = await page.content();
    assert.ok(
      !markup.includes(keys.gemini) &&
        !markup.includes(keys.openai) &&
        !markup.includes(keys.secret),
    );
  });
  report.completed = true;
} catch {
  report.failure = "local_gemini_acceptance_failed";
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const user of users) {
    try {
      ok(await admin.from("wines").delete().eq("user_id", user.id));
      ok(await admin.auth.admin.deleteUser(user.id));
    } catch {
      report.cleanupFailures++;
      report.completed = false;
      process.exitCode = 1;
    }
  }
  keys.gemini = keys.openai = keys.secret = keys.publishable = "";
  await saveReport();
  console.log(JSON.stringify({ completed: report.completed, project }));
}
