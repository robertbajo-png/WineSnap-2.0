import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { lstat, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ownedApp, validateOwnedKeys } from "./owned-backend.mjs";
import { ownedBrowserFixture, validateBrowserFixture } from "./owned-browser-fixture.mjs";
import { offlineRequestPolicy } from "./owned-offline.mjs";

export const pilotViewports = [360, 390, 430, 1024, 1440];

// Manual, disposable-fixture acceptance only. Never load a real user's browser session.
export async function acceptOwnedPilotUi(
  keys,
  { fixture: previous, remember, artifactDirectory, progress = () => {} },
) {
  validateOwnedKeys(keys);
  assert.equal(typeof remember, "function");
  if (previous) await ownedBrowserFixture(keys, "absent", previous);
  await mkdir(artifactDirectory, { recursive: true });
  const info = await lstat(artifactDirectory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  const report = {
    completed: false,
    cleanupCompleted: false,
    productionTouched: false,
    realAccountsChanged: false,
    externalRequests: 0,
    blockedAiRequests: 0,
    pageErrors: 0,
    passed: [],
    phase: "prepare",
  };
  let fixture, browser, context, page;
  const phase = (name) => {
    report.phase = name;
    writeFileSync(
      join(artifactDirectory, "progress.json"),
      JSON.stringify({ phase: name, passed: report.passed }),
    );
    progress(name);
  };
  try {
    const created = await ownedBrowserFixture(keys, "prepare", undefined, async (value) => {
      fixture = validateBrowserFixture(value);
      await remember(fixture);
    });
    fixture = created.fixture;
    const playwright = await import(
      pathToFileURL(
        join(
          process.env.USERPROFILE,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
        ),
      ).href
    );
    browser = await playwright.chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "sv-SE" });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    await context.route("**/*", async (route) => {
      const policy = offlineRequestPolicy(route.request().url());
      if (policy === "local") return route.continue();
      if (policy === "ai") report.blockedAiRequests++;
      else report.externalRequests++;
      return route.abort();
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", () => report.pageErrors++);
    phase("login");
    await page.goto(ownedApp + "/login", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      Object.keys(document.querySelector("#email") ?? {}).some((key) =>
        key.startsWith("__reactProps"),
      ),
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

    async function capture(screen, width) {
      await page.locator("html.pilot-ui").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
      await page.waitForFunction(() => window.scrollY === 0);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        true,
      );
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
        "rgb(17, 22, 20)",
      );
      const destructiveContrast = await page.evaluate(() => {
        const control = document.querySelector(".k-abandon");
        if (!control) return null;
        const luminance = (color) => {
          const channels = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
          return channels
            .map((channel) => {
              const value = channel / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        };
        const text = luminance(getComputedStyle(control).color);
        const background = luminance(getComputedStyle(document.body).backgroundColor);
        return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
      });
      if (destructiveContrast !== null) assert.ok(destructiveContrast >= 4.5);
      await page.screenshot({
        path: join(artifactDirectory, `${screen}-${width}.png`),
        fullPage: false,
      });
      report.passed.push(`${screen}_${width}`);
    }

    for (const width of pilotViewports) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      phase("home");
      await page.goto(ownedApp + "/", { waitUntil: "domcontentloaded" });
      await page.locator(".pilot-home").waitFor();
      // The resumable session proves the authenticated client has hydrated.
      await page.locator(".pilot-resume").waitFor();
      await page.locator('.pilot-entry[href="/kitchen"]').waitFor();
      await page.locator('.pilot-entry[href="/cellar"]').waitFor();
      assert.equal(await page.locator('.pilot-entry[href="/cellar"]').count(), 1);
      assert.equal(await page.locator('nav[aria-label="WineSnap"] li').count(), 5);
      assert.equal(await page.locator(".pilot-camera").getAttribute("href"), "/scan");
      assert.equal(
        await page.locator(".pilot-nav a").evaluateAll((links) =>
          links.every((link) => {
            const rect = link.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44;
          }),
        ),
        true,
      );
      await page.waitForFunction(() => document.querySelector(".pilot-hero")?.naturalWidth > 0);
      await capture("home", width);

      phase("recipe");
      await page.locator('.pilot-entry[href="/kitchen"]').press("Enter");
      await page.locator("button.k-recipe").first().waitFor();
      await page.locator("button.k-recipe").first().press("Enter");
      await page.getByRole("button", { name: "B\u00f6rja laga", exact: true }).waitFor();
      await capture("recipe", width);

      phase("cook");
      await page.goto(ownedApp + "/kitchen#cook", { waitUntil: "domcontentloaded" });
      await page.getByText("Steg 1 av 3", { exact: true }).waitFor();
      assert.equal(await page.locator(".pilot-nav").count(), 0);
      await capture("cook", width);

      phase("cellar");
      await page.goto(ownedApp + "/cellar", { waitUntil: "domcontentloaded" });
      await page.locator(".pilot-cellar-row").first().waitFor();
      assert.equal(
        await page.locator('.pilot-nav a[href="/cellar"]').getAttribute("aria-current"),
        "page",
      );
      await capture("cellar", width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [screen, selector] of [
      ["chef", ".chef-panel"],
      ["memory", ".chef-panel"],
      ["pairings", ".meal-panel"],
      ["nutrition", ".nutrition-panel"],
    ]) {
      phase(screen);
      await page.goto(ownedApp + "/kitchen#" + screen, { waitUntil: "domcontentloaded" });
      await page.locator(selector).waitFor();
      await page
        .locator(selector)
        .getByText(/^H\u00e4mtar/)
        .waitFor({ state: "hidden" });
      assert.equal(await page.locator(selector).locator(".k-error").count(), 0);
      await capture(screen, 390);
    }
    phase("logout");
    await page.goto(ownedApp + "/me", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Logga ut", exact: true }).click();
    await page.goto(ownedApp + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Logga in", exact: true }).waitFor();
    assert.equal(await page.locator(".pilot-resume").count(), 0);
    assert.equal(await page.locator(".pilot-recent-wine").count(), 0);
    report.passed.push("logout_hides_private_home");
    assert.equal(report.externalRequests, 0);
    assert.equal(report.blockedAiRequests, 0);
    assert.equal(report.pageErrors, 0);
    report.completed = true;
  } catch (error) {
    report.failure = "owned_pilot_ui_acceptance_failed";
    if (/^[A-Za-z]*Error$/.test(error?.name ?? "")) report.errorKind = error.name;
    if (error?.code === "ERR_ASSERTION") {
      if (["boolean", "number"].includes(typeof error.actual))
        report.assertionActual = error.actual;
      if (["boolean", "number"].includes(typeof error.expected))
        report.assertionExpected = error.expected;
    }
    if (page && new URL(page.url()).origin === ownedApp && report.phase !== "login")
      await page
        .screenshot({ path: join(artifactDirectory, "failure.png"), fullPage: true })
        .catch(() => undefined);
  } finally {
    await browser?.close().catch(() => undefined);
    if (fixture) {
      try {
        const cleaned = await ownedBrowserFixture(keys, "cleanup", fixture);
        report.cleanupCompleted = Boolean(cleaned.cleanupCompleted || cleaned.alreadyClean);
      } catch {
        report.completed = false;
        report.failure = "owned_pilot_ui_cleanup_failed";
      }
    }
  }
  return report;
}
