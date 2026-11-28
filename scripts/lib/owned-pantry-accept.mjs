import assert from "node:assert/strict";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ownedApi, ownedApp, validateOwnedKeys } from "./owned-backend.mjs";
import {
  ownedBrowserFixture,
  ownedBrowserPassword,
  assertFixtureOwner,
} from "./owned-browser-fixture.mjs";
import { runPantryJourney } from "./pantry-database-browser.mjs";

export function pantryAcceptanceFixtures(
  keys,
  { previous, previousPeer, remember, rememberPeer, relay },
) {
  validateOwnedKeys(keys);
  assert.equal(typeof remember, "function");
  assert.equal(typeof rememberPeer, "function");
  const options = { pantryOnly: true, relay };
  let own, other;
  return {
    async prepare() {
      if (previous) await ownedBrowserFixture(keys, "absent", previous, undefined, options);
      if (previousPeer) await ownedBrowserFixture(keys, "absent", previousPeer, undefined, options);
      const owner = await ownedBrowserFixture(
        keys,
        "prepare",
        undefined,
        async (fixture) => {
          own = fixture;
          await remember(fixture);
        },
        options,
      );
      const peer = await ownedBrowserFixture(
        keys,
        "prepare",
        undefined,
        async (fixture) => {
          other = fixture;
          await rememberPeer(fixture);
        },
        { ...options, pantryPeer: true },
      );
      const browserAccount = (fixture) => ({
        id: fixture.userId,
        email: fixture.email,
        password: ownedBrowserPassword(keys, fixture.run),
      });
      assert.notEqual(owner.fixture.userId, peer.fixture.userId);
      assert.notEqual(owner.dinerId, peer.dinerId);
      return { owner, accounts: [browserAccount(own), browserAccount(other)] };
    },
    async cleanup() {
      let cleaned = true;
      for (const fixture of [other, own].filter(Boolean)) {
        try {
          const result = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, options);
          assert.ok(result.cleanupCompleted || result.alreadyClean);
        } catch {
          cleaned = false;
        }
      }
      return cleaned;
    },
  };
}

const readTables = new Set([
  "profiles",
  "user_roles",
  "wines",
  "kitchen_recipes",
  "kitchen_recipe_versions",
  "cooking_sessions",
  "kitchen_pantry",
  "kitchen_week_plans",
  "kitchen_diners",
  "kitchen_pantry_consumption",
]);
const writeRpcs = new Set([
  "kitchen_access",
  "privacy_me_active",
  "meals_access",
  "kitchen_save_week_plan",
  "kitchen_save_session",
  "kitchen_save_pantry_item",
  "kitchen_confirm_pantry_consumption",
]);

export function pantryBrowserRequest(value, method) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "blocked";
  }
  if (url.username || url.password) return "blocked";
  if (
    url.origin === ownedApp &&
    ["GET", "HEAD"].includes(method) &&
    !/^\/api(?:\/|$)/.test(url.pathname)
  )
    return "web";
  if (url.origin !== ownedApi) return "blocked";
  if (
    url.pathname === "/auth/v1/token" &&
    url.search === "?grant_type=password" &&
    method === "POST"
  )
    return "login";
  if (url.pathname === "/auth/v1/user" && method === "GET") return "api";
  if (
    method === "GET" &&
    url.pathname.startsWith("/rest/v1/") &&
    readTables.has(url.pathname.slice(9))
  )
    return "api";
  if (
    method === "POST" &&
    url.pathname.startsWith("/rest/v1/rpc/") &&
    writeRpcs.has(url.pathname.slice(13))
  )
    return "api";
  if (
    method === "OPTIONS" &&
    ["GET", "POST"].some(
      (verb) =>
        pantryBrowserRequest(value, verb) === "api" ||
        pantryBrowserRequest(value, verb) === "login",
    )
  )
    return "preflight";
  return "blocked";
}

export async function runPreparedPantryAcceptance({
  page,
  base,
  prepared,
  report,
  capture,
  progress = () => {},
}) {
  const {
    owner,
    accounts: [account],
  } = prepared;
  report.phase = "pantry_browser_login";
  progress(report.phase);
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  const login = page.waitForResponse(
    (response) => pantryBrowserRequest(response.url(), response.request().method()) === "login",
  );
  const [loggedIn] = await Promise.all([
    login,
    page.getByRole("button", { name: "Logga in", exact: true }).click(),
  ]);
  assert.equal(loggedIn.status(), 200);
  assertFixtureOwner((await loggedIn.json()).user, owner.fixture);
  await page.waitForURL(base + "/");
  report.fixtureBrowserLoginVerified = true;
  await runPantryJourney({
    page,
    base,
    version: { id: owner.fixture.versionId },
    dinerId: owner.dinerId,
    read: owner.read,
    report,
    capture,
    phase: progress,
  });
}

export async function acceptInstalledPantry(
  keys,
  { artifactDirectory, progress = () => {}, ...fixtures },
) {
  assert.ok(!Object.hasOwn(fixtures, "relay"));
  const lease = pantryAcceptanceFixtures(keys, fixtures);
  await mkdir(artifactDirectory, { recursive: true });
  const directory = await lstat(artifactDirectory);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  const report = {
    completed: false,
    cleanupCompleted: false,
    realAccountsChanged: false,
    productionTouched: false,
    hostedTestTouched: false,
    phase: "pantry_prepare",
    passed: [],
    blockedRequests: 0,
    pageErrors: 0,
  };
  let browser, page;
  try {
    const prepared = await lease.prepare();
    const { chromium } = await import(
      pathToFileURL(
        join(
          process.env.USERPROFILE,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
        ),
      ).href
    );
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    await context.route("**/*", async (route) => {
      const request = route.request();
      const decision = pantryBrowserRequest(request.url(), request.method());
      if (decision === "login") {
        const input = request.postDataJSON();
        if (
          input?.email === prepared.accounts[0].email &&
          input?.password === prepared.accounts[0].password
        )
          return route.continue();
      } else if (decision !== "blocked") return route.continue();
      report.blockedRequests++;
      return route.abort();
    });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on("pageerror", () => report.pageErrors++);
    await runPreparedPantryAcceptance({
      page,
      base: ownedApp,
      prepared,
      report,
      progress,
      async capture(name, width) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({
          path: join(artifactDirectory, `${name}-${width}.png`),
          animations: "disabled",
        });
      },
    });
    assert.equal(report.blockedRequests, 0);
    assert.equal(report.pageErrors, 0);
    report.completed = true;
  } catch (error) {
    report.failure = "owned_pantry_acceptance_failed";
    report.errorType = ["AssertionError", "TimeoutError"].includes(error.name)
      ? error.name
      : "Error";
    if (page && report.fixtureBrowserLoginVerified && new URL(page.url()).origin === ownedApp)
      await page
        .screenshot({ path: join(artifactDirectory, "failure.png"), timeout: 10000 })
        .catch(() => undefined);
  } finally {
    await browser?.close().catch(() => undefined);
    report.cleanupCompleted = await lease.cleanup();
    if (!report.cleanupCompleted) report.completed = false;
    await writeFile(join(artifactDirectory, "status.json"), JSON.stringify(report));
  }
  return report;
}
