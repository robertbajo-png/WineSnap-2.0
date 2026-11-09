import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ownedApp, validateOwnedKeys } from "./owned-backend.mjs";
import { ownedBrowserFixture } from "./owned-browser-fixture.mjs";
import { createOwnedDemoPolicy } from "./owned-demo-policy.mjs";
import { approvedDemoImageSha256 } from "./owned-demo-data.mjs";

export const demoLifetimeMs = 15 * 60 * 1000;

// Manual visible demo, normal synthetic-account Auth; no provider requests.
export async function showOwnedPilotDemo(
  keys,
  { fixture: previous, remember, artifactDirectory, acceptance = false },
) {
  validateOwnedKeys(keys);
  assert.equal(typeof remember, "function");
  assert.equal(typeof acceptance, "boolean");
  const imagePath = join(process.env.USERPROFILE, "OneDrive/Desktop/Winesnap/54456874_400.webp");
  const file = await lstat(imagePath);
  assert.ok(file.isFile() && !file.isSymbolicLink() && file.size <= 5 * 1024 * 1024);
  const original = await readFile(imagePath);
  assert.equal(createHash("sha256").update(original).digest("hex"), approvedDemoImageSha256);
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
  let fixture, browser, page, timer;
  const report = {
    completed: false,
    cleanupCompleted: false,
    productionTouched: false,
    liveProvider: false,
    humanSessions: 0,
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
    browser = await chromium.launch({ headless: acceptance, args: ["--window-size=1280,900"] });
    const context = await browser.newContext({
      viewport: null,
      locale: "sv-SE",
      serviceWorkers: "block",
    });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    const policy = createOwnedDemoPolicy(
      fixture,
      original,
      acceptance
        ? (evidence) => {
            report.uploadEvidence = evidence;
          }
        : undefined,
    );
    await context.route("**/*", async (route) => {
      const request = route.request();
      const decision = await policy({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        body: request.postDataBuffer(),
      });
      if (decision.kind === "abort") return route.abort();
      if (decision.kind === "reply")
        return route.fulfill({
          status: decision.status,
          contentType: "application/json",
          body: JSON.stringify(decision.body),
        });
      if (decision.kind === "upload") {
        const headers = { ...request.headers(), "content-type": decision.contentType };
        delete headers["content-length"];
        const response = await route.fetch({
          headers,
          postData: decision.body,
          maxRedirects: 0,
          timeout: 30000,
        });
        if (response.status() >= 300 && response.status() < 400) return route.abort();
        return route.fulfill({ response });
      }
      return route.continue();
    });
    page = await context.newPage();
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
    await page.waitForFunction(() => {
      const image = document.querySelector(".pilot-hero");
      return image?.complete && image.naturalWidth > 0;
    });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.screenshot({ path: join(artifactDirectory, "home.png"), animations: "disabled" });
    const mobile = await context.newPage();
    try {
      await mobile.setViewportSize({ width: 390, height: 844 });
      await mobile.goto(ownedApp + "/");
      await mobile.locator(".pilot-resume").waitFor();
      await mobile.waitForFunction(() => document.querySelector(".pilot-hero")?.naturalWidth > 0);
      await mobile.evaluate(() => document.fonts.ready);
      assert.equal(
        await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        true,
      );
      await mobile.screenshot({
        path: join(artifactDirectory, "home-mobile.png"),
        animations: "disabled",
      });
    } finally {
      await mobile.close();
      await page.bringToFront();
    }
    if (acceptance) {
      const { acceptOwnedDemo } = await import("./owned-demo-acceptance.mjs");
      report.acceptance = { completed: false, humanSessions: 0, liveProvider: false, passed: [] };
      await acceptOwnedDemo({
        page,
        fixture,
        imagePath,
        original,
        report: report.acceptance,
        progress: async (phase) => {
          report.phase = phase;
          await writeFile(
            join(artifactDirectory, "progress.json"),
            JSON.stringify({ phase, passed: report.acceptance.passed }),
          );
        },
      });
      report.completed = true;
      return report;
    }
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
      page.once("close", resolve);
      timer = setTimeout(() => void browser.close().finally(resolve), demoLifetimeMs);
    });
    report.completed = true;
  } catch (error) {
    report.failure = "owned_demo_not_ready";
    if (["AssertionError", "TimeoutError", "TypeError"].includes(error?.name))
      report.errorKind = error.name;
    if (acceptance && report.phase && page && new URL(page.url()).origin === ownedApp)
      await page
        .screenshot({ path: join(artifactDirectory, "failure.png"), fullPage: true })
        .catch(() => undefined);
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
