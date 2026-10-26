import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, lstat } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ownedApi, ownedApp, validateOwnedKeys } from "./owned-backend.mjs";
import { ownedBrowserFixture, validateBrowserFixture } from "./owned-browser-fixture.mjs";

export function offlineRequestPolicy(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "external";
  }
  if (url.username || url.password) return "external";
  if (![ownedApp, ownedApi].includes(url.origin)) return "external";
  if (/^\/api\/(?:ai|chef)(?:\/|$)/.test(url.pathname)) return "ai";
  return "local";
}

// Manual acceptance only: a fresh browser context, the real owned app and an
// administrator-tagged disposable account. Never persist login state or traces.
export async function acceptOwnedOffline(keys, options) {
  validateOwnedKeys(keys);
  const { remember, artifactDirectory, progress = () => {}, fixture: previous } = options;
  assert.equal(typeof remember, "function");
  if (previous) await ownedBrowserFixture(keys, "absent", previous);
  await mkdir(artifactDirectory, { recursive: true });
  const directory = await lstat(artifactDirectory);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  const report = {
    completed: false,
    passed: [],
    phase: "prepare",
    externalRequests: 0,
    blockedAiRequests: 0,
    pageErrors: 0,
    cleanupCompleted: false,
    productionTouched: false,
    realAccountsChanged: false,
  };
  let fixture, browser, context, page;
  let networkBlocked = false;
  const phase = (name) => {
    report.phase = name;
    writeFileSync(
      join(artifactDirectory, "progress.json"),
      JSON.stringify({ phase: name, passed: report.passed }),
    );
    progress(name);
  };
  const pass = (name) => report.passed.push(name);
  try {
    const created = await ownedBrowserFixture(keys, "prepare", undefined, async (value) => {
      fixture = validateBrowserFixture(value);
      await remember(fixture);
    });
    fixture = created.fixture;
    const inspect = () => ownedBrowserFixture(keys, "inspect", fixture);
    const until = async (read) => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const value = await read();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("owned_offline_condition_timeout");
    };
    const initial = await inspect(); // Also checks administrator-written owner metadata.
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
    await context.route("**/*", async (route) => {
      const policy = offlineRequestPolicy(route.request().url());
      if (policy === "local")
        return networkBlocked ? route.abort("internetdisconnected") : route.continue();
      if (policy === "ai") report.blockedAiRequests++;
      else report.externalRequests++;
      return route.abort();
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", () => report.pageErrors++);
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === ownedApi && url.pathname === "/auth/v1/token")
        report.passwordGrantStatus = response.status();
    });
    const status = (text) => page.locator('.k-status[role="status"]').filter({ hasText: text });
    const visible = (locator) => locator.waitFor({ state: "visible" });
    const saved = () => status("Sparat").waitFor({ state: "visible", timeout: 60000 });
    const step = (number) => visible(page.getByText(`Steg ${number} av 3`, { exact: true }));
    const next = () => page.getByRole("button", { name: /^N.sta steg$/ }).click();
    const localState = () =>
      page.evaluate(
        (owner) =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open("winesnap-kitchen-v1");
            open.onerror = () => reject(new Error("cache_unavailable"));
            open.onsuccess = () => {
              const db = open.result;
              const request = db.transaction("accounts").objectStore("accounts").get(owner);
              request.onerror = () => {
                db.close();
                reject(new Error("cache_unavailable"));
              };
              request.onsuccess = () => {
                const session = request.result?.session;
                db.close();
                resolve(session ? { state: session.state, dirty: session.dirty } : null);
              };
            };
          }),
        fixture.userId,
      );
    phase("login");
    await page.goto(ownedApp + "/login", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      Object.keys(document.querySelector("#email") ?? {}).some((key) =>
        key.startsWith("__reactProps"),
      ),
    );
    phase("login_fields");
    await page.locator("#email").fill(fixture.email);
    await page
      .locator("#password")
      .fill(
        createHmac("sha256", keys.jwtSecret)
          .update(`owned-browser-fixture-password-v1:${fixture.run}`)
          .digest("hex"),
      );
    phase("login_submit");
    await page.locator('button[type="submit"]').click();
    phase("login_redirect");
    await page.waitForURL(ownedApp + "/");
    phase("service_worker");
    await until(() =>
      page.evaluate(async () =>
        (await navigator.serviceWorker.getRegistrations()).some(
          (registration) => registration.active?.state === "activated",
        ),
      ),
    );
    phase("kitchen_load");
    await page.goto(ownedApp + "/kitchen#cook", { waitUntil: "domcontentloaded" });
    await step(1);
    await saved();
    phase("public_shell");
    const proof = await until(() =>
      page.evaluate(async (email) => {
        if (!navigator.serviceWorker.controller) return null;
        const response = await caches.match("/kitchen");
        if (!response) return null;
        const html = await response.text();
        return {
          marker: /name="winesnap-kitchen-shell"\s+content="public-v1"/.test(html),
          privateDataAbsent: !html.includes(email) && !html.includes("Lokalt webblasarprov"),
        };
      }, fixture.email),
    );
    report.publicShellMarker = proof.marker;
    report.publicShellPrivateDataAbsent = proof.privateDataAbsent;
    assert.equal(report.publicShellMarker, true);
    assert.equal(report.publicShellPrivateDataAbsent, true);
    pass("online_login_and_public_shell");

    phase("offline_edits");
    networkBlocked = true;
    await context.setOffline(true);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    await visible(status("Offline"));
    await page.getByRole("button", { name: "Starta 01:00", exact: true }).click();
    await page.getByRole("button", { name: "Pausa Forbered tomaten", exact: true }).click();
    await page.getByRole("button", { name: "Fler portioner", exact: true }).click();
    await page.getByRole("checkbox", { name: "Tomat 600 g", exact: true }).check();
    await next();
    await step(2);
    const offlineState = await localState();
    assert.equal(offlineState.dirty, true);
    assert.equal(offlineState.state.activeStep, 1);
    assert.equal(offlineState.state.servings, 3);
    assert.equal(offlineState.state.checkedIngredientIds.length, 1);
    assert.equal(offlineState.state.timers.length, 1);
    assert.equal(offlineState.state.timers[0].deadlineMs, null);
    assert.deepEqual(await inspect(), initial);
    pass("offline_changes_do_not_reach_server");

    phase("offline_reload");
    await page.reload({ waitUntil: "domcontentloaded" });
    await step(2);
    // onLine can remain true after a service-worker navigation. Verify the
    // actual network failure instead of spoofing browser status or events.
    report.navigatorOfflineAfterReload = !(await page.evaluate(() => navigator.onLine));
    report.browserNetworkBlockedAfterReload = await page.evaluate(async () => {
      try {
        await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(report.browserNetworkBlockedAfterReload, true);
    assert.deepEqual(await localState(), offlineState);
    assert.equal(await page.getByRole("checkbox", { name: "Tomat 600 g" }).isChecked(), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: join(artifactDirectory, "mobile-offline.png"), fullPage: true });
    pass("offline_reload_preserves_step_servings_ingredient_timer");

    phase("offline_private_navigation");
    await page.goto(ownedApp + "/cellar", { waitUntil: "domcontentloaded" });
    await visible(page.getByRole("heading", { name: /Du .r offline|You're offline/ }));
    assert.ok(!(await page.locator("body").innerText()).includes("Local browser QA Chardonnay"));
    await page.goto(ownedApp + "/kitchen#cook", { waitUntil: "domcontentloaded" });
    await step(2);
    assert.deepEqual(await localState(), offlineState);
    assert.deepEqual(await inspect(), initial);
    pass("private_cellar_not_cached_kitchen_restored");

    phase("reconnect");
    networkBlocked = false;
    await context.setOffline(false);
    await saved();
    const synced = await inspect();
    assert.equal(synced.revision, initial.revision + 1);
    assert.equal(synced.step, 1);
    assert.equal(synced.servings, 3);
    assert.equal(synced.checkedIngredients, 1);
    assert.equal(synced.timers, 1);
    assert.equal(synced.timerStates[0].running, false);
    assert.equal(synced.timerStates[0].remainingMs, offlineState.state.timers[0].pausedMs);
    pass("reconnect_syncs_once_without_duplicate_revision");

    for (const choice of ["remote", "local"]) {
      phase(`conflict_${choice}`);
      networkBlocked = true;
      await context.setOffline(true);
      await visible(status("Offline"));
      await next();
      await step(choice === "remote" ? 3 : 2);
      const remote = await ownedBrowserFixture(keys, "conflict", fixture);
      networkBlocked = false;
      await context.setOffline(false);
      const conflict = page.getByRole("region", { name: "Synkningskonflikt" });
      await visible(conflict);
      assert.equal((await inspect()).revision, remote.revision);
      await page.screenshot({
        path: join(artifactDirectory, `conflict-${choice}.png`),
        fullPage: true,
      });
      await conflict
        .getByRole("button", {
          name: choice === "remote" ? /^Anv.nd serverns version$/ : /^Spara mina .ndringar$/,
        })
        .click();
      await conflict.waitFor({ state: "hidden" });
      await saved();
      const resolved = await inspect();
      assert.equal(resolved.step, choice === "remote" ? 0 : 1);
      assert.equal(resolved.revision, remote.revision + (choice === "remote" ? 0 : 1));
      await step(choice === "remote" ? 1 : 2);
      pass(`explicit_conflict_choice_${choice}`);
    }

    phase("desktop");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: join(artifactDirectory, "desktop-reconnected.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
    );
    pass("desktop_reconnected");

    phase("logout_cleanup");
    await page.goto(ownedApp + "/me");
    await page.getByRole("button", { name: /Logga ut|Sign out/i }).click();
    await visible(page.getByText(/Logga in f.r att forts.tta/, { exact: false }));
    await page.goto(ownedApp + "/kitchen#cook");
    await visible(page.getByRole("heading", { name: "Ditt k\u00f6k", exact: true }));
    await until(() =>
      page.evaluate(
        (owner) =>
          new Promise((resolve) => {
            const open = indexedDB.open("winesnap-kitchen-v1");
            open.onsuccess = () => {
              const db = open.result;
              const request = db.transaction("accounts").objectStore("accounts").get(owner);
              request.onsuccess = () => {
                db.close();
                resolve(!request.result);
              };
            };
          }),
        fixture.userId,
      ),
    );
    networkBlocked = true;
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await visible(page.getByRole("heading", { name: "Ditt k\u00f6k", exact: true }));
    assert.ok(!(await page.locator("body").innerText()).includes("Lokalt webblasarprov"));
    pass("logout_erases_private_offline_copy");
    assert.equal(report.externalRequests, 0);
    assert.equal(report.pageErrors, 0);
    report.completed = true;
  } catch (error) {
    // Do not leak browser errors, credential fields, JWTs or network response bodies.
    report.failure = "owned_offline_acceptance_failed";
    if (/^[A-Za-z]+Error$/.test(error?.name)) report.errorKind = error.name;
    if (page && new URL(page.url()).origin === ownedApp)
      report.pagePath = new URL(page.url()).pathname;
    if (report.pagePath === "/login") {
      report.loginFieldsRetained = await page
        .locator("#email")
        .inputValue()
        .then((value) => value === fixture.email)
        .catch(() => false);
      report.loginFeedback = await page
        .locator("[data-sonner-toast]")
        .allTextContents()
        .then((values) => {
          const text = values.join(" ").toLowerCase();
          if (text.includes("invalid login credentials")) return "invalid_credentials";
          if (text.includes("email not confirmed")) return "unconfirmed";
          if (text.includes("rate limit")) return "rate_limited";
          return text ? "other" : "none";
        })
        .catch(() => "unavailable");
    }
    if (page?.url().startsWith(ownedApp + "/kitchen"))
      await page
        .screenshot({ path: join(artifactDirectory, "failure-kitchen.png"), fullPage: true })
        .catch(() => undefined);
  } finally {
    networkBlocked = false;
    await context?.setOffline(false).catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (fixture) {
      try {
        const cleaned = await ownedBrowserFixture(keys, "cleanup", fixture);
        report.cleanupCompleted = Boolean(cleaned.cleanupCompleted || cleaned.alreadyClean);
      } catch {
        report.completed = false;
        report.failure = "owned_offline_cleanup_failed";
      }
    }
  }
  return report;
}
