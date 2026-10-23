import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

// No connection/key arguments and no production fallback. Only synthetic users.
assert.equal(process.argv.length, 2);
const project = "pzniyupmgwvlldvztzqh";
const origin = `https://${project}.supabase.co`;
const app = "http://127.0.0.1:5210";
const report = { project, model: "gpt-6.1-sol", completed: false, checks: [], cleanupFailures: 0 };
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  assert.ok(input.length <= 16_384);
}
const keys = JSON.parse(input);
input = "";
assert.equal(keys.project, project);
const guardedFetch = (url, init) => {
  assert.equal(new URL(url instanceof Request ? url.url : url).origin, origin);
  return fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: guardedFetch },
};
const admin = createClient(origin, keys.secret, options);
let userId;
let browser;
const ok = ({ data, error }) => {
  if (error) throw new Error("test_backend_failure");
  return data;
};
const check = async (name, run) => {
  try {
    await run();
    report.checks.push({ name, passed: true });
  } catch (error) {
    report.checks.push({ name, passed: false });
    throw error;
  }
};
try {
  await check("anonymous request denied", async () => {
    const result = await fetch(`${app}/api/ai/analyze-wine`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(result.status, 401);
    assert.equal(result.headers.get("cache-control"), "no-store");
  });
  await check("invalid user JWT denied", async () => {
    const result = await fetch(`${app}/api/ai/analyze-wine`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer synthetic-invalid-jwt",
      },
      body: JSON.stringify({ text: "Wine 2023" }),
    });
    assert.equal(result.status, 401);
  });
  await check("existing OpenAI key can access the configured model", async () => {
    const result = await fetch("https://api.openai.com/v1/models/gpt-6.1-sol", {
      headers: { Authorization: `Bearer ${keys.openai}` },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    report.providerAccessStatus = result.status;
    assert.equal(result.status, 200, "provider_model_access_unavailable");
    assert.equal((await result.json()).id, "gpt-6.1-sol");
  });
  const email = `winesnap-local-ai-${randomUUID()}@example.test`;
  const password = randomUUID() + randomUUID();
  userId = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  const client = createClient(origin, keys.publishable, options);
  const { session } = ok(await client.auth.signInWithPassword({ email, password }));
  const { chromium } = await import(
    pathToFileURL(
      `${process.env.HOME || process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
    ).href
  );
  browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["camera"],
    serviceWorkers: "block",
  });
  // An isolated browser session; never replace the owner's ordinary login.
  await context.addInitScript(
    ({ session, project }) => {
      localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session));
    },
    { session, project },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", () => errors.push("browser_error"));
  const hostedAiCalls = [];
  page.on("request", (request) => {
    if (request.url().includes("/functions/v1/analyze-wine")) hostedAiCalls.push(true);
  });
  await page.goto(`${app}/scan`);
  await check("mobile text scan through actual local server and OpenAI", async () => {
    await page.getByRole("button", { name: /^(Skriv|Type)$/i }).click();
    await page
      .locator("#scan-description")
      .fill("ZEHN MORGEN 2023 CHARDONNAY & WEISSER BURGUNDER NAHE");
    const response = page.waitForResponse(
      (response) => response.url() === `${app}/api/ai/analyze-wine`,
      { timeout: 90_000 },
    );
    await page.getByRole("button", { name: /identifiera|identify/i }).click();
    const result = await response;
    report.textStatus = result.status();
    assert.equal(result.status(), 200, "text_inference_failed");
    const data = await result.json();
    assert.ok(data.wine);
    assert.match(JSON.stringify(data.wine.identity), /Zehn Morgen/i);
    await page
      .getByText(/Zehn Morgen/i)
      .first()
      .waitFor();
    await page.screenshot({
      path: fileURLToPath(new URL("../dist/local-ai-text-mobile.png", import.meta.url)),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  });
  const original = `${process.env.USERPROFILE}/OneDrive/Desktop/Winesnap/54456874_400.webp`;
  await check("original bottle image scan through the app and OpenAI", async () => {
    await readFile(original); // Fail explicitly if the approved original is missing.
    await page.goto(`${app}/scan`);
    await page.locator("input[type=file]").setInputFiles(original);
    const response = page.waitForResponse(
      (response) => response.url() === `${app}/api/ai/analyze-wine`,
      { timeout: 90_000 },
    );
    await page.getByRole("button", { name: /hela bilden|original|full photo/i }).click();
    const result = await response;
    report.imageStatus = result.status();
    assert.equal(result.status(), 200, "image_inference_failed");
    const data = await result.json();
    report.imageVintage = data.wine?.identity?.vintage?.value ?? null;
    assert.match(data.wine.label_text, /ZEHN MORGEN/i);
    assert.match(data.wine.label_text, /CHARDONNAY/i);
    // The identity contract keeps the year exactly as printed (e.g. "20 23").
    assert.equal(Number(String(data.wine.identity.vintage.value).replace(/\D/g, "")), 2023);
    await page
      .getByText(/Zehn Morgen/i)
      .first()
      .waitFor();
    await page.screenshot({
      path: fileURLToPath(new URL("../dist/local-ai-image-mobile.png", import.meta.url)),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: fileURLToPath(new URL("../dist/local-ai-image-desktop.png", import.meta.url)),
      fullPage: true,
    });
  });
  await check("no wine saved, no hosted AI call and no browser errors", async () => {
    assert.deepEqual(ok(await client.from("wines").select("id").eq("user_id", userId)), []);
    assert.equal(hostedAiCalls.length, 0);
    assert.equal(errors.length, 0);
  });
  report.completed = true;
} catch {
  report.failure = "local_ai_acceptance_failed";
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (userId) {
    try {
      ok(await admin.auth.admin.deleteUser(userId));
    } catch {
      report.cleanupFailures++;
      report.completed = false;
      process.exitCode = 1;
    }
  }
  keys.openai = keys.secret = keys.publishable = "";
  await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../dist/local-windows-ai-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
  console.log(JSON.stringify({ completed: report.completed, project }));
}
