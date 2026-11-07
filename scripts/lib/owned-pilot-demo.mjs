import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ownedApp, validateOwnedKeys } from "./owned-backend.mjs";
import { ownedBrowserFixture } from "./owned-browser-fixture.mjs";
import { offlineRequestPolicy } from "./owned-offline.mjs";
import { ownedDemoRecipe } from "./owned-demo-data.mjs";

export const demoLifetimeMs = 15 * 60 * 1000;

// Manual visible demo, normal synthetic-account Auth; no provider requests.
export async function showOwnedPilotDemo(keys, { fixture: previous, remember, artifactDirectory }) {
  validateOwnedKeys(keys);
  assert.equal(typeof remember, "function");
  if (previous) await ownedBrowserFixture(keys, "absent", previous);
  await mkdir(artifactDirectory, { recursive: true });
  const directory = await lstat(artifactDirectory);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  const readyFile = join(artifactDirectory, "ready.json");
  try {
    assert.ok(!(await lstat(readyFile)).isSymbolicLink());
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(readyFile, JSON.stringify({ ready: false }));
  let fixture, browser, timer;
  const report = {
    completed: false,
    cleanupCompleted: false,
    productionTouched: false,
    liveProvider: false,
  };
  try {
    const created = await ownedBrowserFixture(
      keys,
      "prepare",
      undefined,
      async (value) => {
        fixture = value;
        await remember(value);
      },
      { demo: true },
    );
    fixture = created.fixture;
    const { chromium } = await import(
      pathToFileURL(
        join(
          process.env.USERPROFILE,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
        ),
      ).href
    );
    browser = await chromium.launch({ headless: false, args: ["--window-size=1280,900"] });
    const context = await browser.newContext({
      viewport: null,
      locale: "sv-SE",
      serviceWorkers: "block",
    });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    await context.route("**/*", async (route) => {
      const policy = offlineRequestPolicy(route.request().url());
      if (policy !== "local") return route.abort();
      const url = new URL(route.request().url());
      if (url.pathname.includes("/storage/v1/object/") && route.request().method() !== "GET")
        return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    // Clearly attributed local examples, not an AI gateway or a saved user conversation.
    await page.route("**/api/chef", (route) => {
      const body = route.request().postDataJSON();
      if (!["chat", "generate", "adapt"].includes(body.action)) return route.abort();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...(body.action === "chat"
            ? {
                answer:
                  "Exempelsvar (demo): citron, rostade gr\u00f6nsaker och ett friskt vitt vin kan fungera fint tillsammans.",
              }
            : { draft: ownedDemoRecipe() }),
          model: "Demo \u2013 lokalt exempel, ingen AI",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
        }),
      });
    });
    page.setDefaultTimeout(30000);
    await page.goto(ownedApp + "/login");
    await page.waitForFunction(() =>
      Object.keys(document.querySelector("#email") ?? {}).some((k) => k.startsWith("__reactProps")),
    );
    await page.locator("#email").fill(fixture.email);
    await page
      .locator("#password")
      .fill(
        createHmac("sha256", keys.jwtSecret)
          .update(`owned-browser-fixture-password-v1:${fixture.run}`)
          .digest("hex"),
      );
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(ownedApp + "/");
    await page.locator(".pilot-recent-wine").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(artifactDirectory, "home.png"), animations: "disabled" });
    const expiresAt = new Date(Date.now() + demoLifetimeMs).toISOString();
    await writeFile(
      readyFile,
      JSON.stringify({
        ready: true,
        project: "winesnap-owned-local",
        app: ownedApp,
        expiresAt,
        exampleData: true,
        liveProvider: false,
      }),
    );
    await new Promise((resolve) => {
      browser.once("disconnected", resolve);
      timer = setTimeout(() => void browser.close().finally(resolve), demoLifetimeMs);
    });
    report.completed = true;
  } finally {
    clearTimeout(timer);
    await browser?.close().catch(() => undefined);
    if (fixture) {
      const cleaned = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, {
        demo: true,
        cleanupImages: true,
      });
      report.cleanupCompleted = Boolean(cleaned.cleanupCompleted || cleaned.alreadyClean);
    }
    await writeFile(
      readyFile,
      JSON.stringify({ ready: false, cleanupCompleted: report.cleanupCompleted }),
    );
  }
  return report;
}
