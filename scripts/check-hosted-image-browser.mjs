import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  imageBrowserRequestAllowed,
  imageBrowserPwaCacheEntryAllowed,
  imageBrowserSessionUrls,
  imageTestOrigin,
} from "./lib/image-browser-session.mjs";
import { mobileBrowserSteps, runMobileBrowserChecks } from "./lib/mobile-browser-checks.mjs";

assert.equal(process.argv.length, 2, "This check accepts no connection arguments");
assert.ok(!process.env.WINESNAP_TEST_SECRET_KEY, "Browser checks must not inherit admin keys");
const root = fileURLToPath(new URL("../", import.meta.url));
const lifecycleFile = new URL("../dist/hosted-image-browser-session.json", import.meta.url);
let reportFile = new URL("../dist/hosted-image-playwright-report.json", import.meta.url);
let pwaMode = false;
let mobileOffset;
const steps = [
  "anonymous private share is unavailable",
  "owner signs in and sees decoded private cellar thumbnail",
  "owner detail and gallery show decoded private images",
  "desktop and mobile layouts have no horizontal overflow",
  "lightbox and real gallery upload display the extra image",
  "native photo-delete confirmation removes only the extra image",
  "another signed-in user cannot view the private wine",
  "anonymous public share uses the non-cacheable image proxy",
  "unsharing removes an already displayed image on focus and reload",
  "owner can still view the now-private image",
  "erasure request removes the owner's already displayed images",
  "no direct Storage image reads, AI calls or unexpected browser errors",
];
const report = {
  project: "pzniyupmgwvlldvztzqh",
  completed: false,
  cleanupConfirmed: false,
  results: steps.map((name) => ({ name, status: "pending" })),
  proxyResponses: [],
  screenshots: [],
  naturalFocusEvents: [],
};
let activeStep;
let testBrowser;
let operator;
let operatorReady = false;
let urls;
const credentials = [];
const unexpectedResponses = [];
let blockedRequests = 0;
let directStorageReads = 0;
let pageErrors = 0;
let scriptConsoleErrors = 0;
const focusSessions = new WeakMap();

async function check(index, run) {
  activeStep = index;
  await run();
  report.results[index].status = "passed";
  console.log(JSON.stringify({ step: index + 1, passed: true }));
}
async function decoded(page, minimum) {
  await page.waitForFunction(
    (count) =>
      Array.from(document.querySelectorAll('img[src^="blob:"]')).filter(
        (image) => image.complete && image.naturalWidth > 0,
      ).length >= count,
    minimum,
    { timeout: 20000 },
  );
}
async function imageCount(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('img[src^="blob:"]').length === expected,
    count,
    { timeout: 20000 },
  );
}
async function screenshot(page, name) {
  const file = `dist/image-browser-${name}.png`;
  await page.screenshot({ path: resolve(root, file), fullPage: false });
  report.screenshots.push(file);
}
async function layout(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
    false,
  );
}
async function login(page, email, password) {
  await page.goto(`${urls.appUrl}/login`);
  // Wait for client hydration/localization before filling the normal auth form.
  await page.getByRole("button", { name: "Logga in", exact: true }).waitFor();
  await page.getByLabel("E-post", { exact: true }).fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await page.waitForURL(urls.appUrl + "/");
  if (pwaMode) await controlled(page);
}
async function controlled(page) {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker.controller &&
      new URL(navigator.serviceWorker.controller.scriptURL).pathname === "/sw.js",
  );
}
async function auditCache(page, actor, stage) {
  if (!pwaMode) return;
  const entries = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith("winesnap-")) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const readable = /javascript|text|json/.test(response.headers.get("content-type") ?? "");
        const body = readable ? await response.text() : "";
        result.push({
          url: request.url,
          privateBody:
            /sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|winesnap-browser-[^\s"<>]+@example\.test|pwa-unsaved@example\.test|Synthetic image access test/.test(
              body,
            ),
        });
      }
    }
    return result;
  });
  const unexpected = entries.filter(
    ({ url }) => !imageBrowserPwaCacheEntryAllowed(url, urls.appUrl),
  );
  const privateBodies = entries.filter((entry) => entry.privateBody).length;
  report.pwa.cacheAudits.push({
    actor,
    stage,
    entries: entries.length,
    unexpected: unexpected.length,
    privateBodies,
  });
  assert.equal(unexpected.length, 0);
  assert.equal(privateBodies, 0);
  assert.ok(entries.some(({ url }) => new URL(url).pathname === "/offline.html"));
  assert.ok(entries.some(({ url }) => new URL(url).pathname.startsWith("/assets/")));
}
async function control(name, phase) {
  await operator.getByRole("button", { name, exact: true }).click();
  await operator
    .getByText(`Project: pzniyupmgwvlldvztzqh. Local test only. Phase: ${phase}`, {
      exact: true,
    })
    .waitFor();
}
async function focusAndWaitForImage(page, otherPage) {
  for (const target of [page, otherPage]) {
    await focusSessions.get(target).send("Emulation.setFocusEmulationEnabled", { enabled: false });
  }
  await page.evaluate(() => {
    window.__wineSnapTestFocusEvents = 0;
    window.addEventListener("focus", () => window.__wineSnapTestFocusEvents++, { once: true });
  });
  const [response] = await Promise.all([
    page.waitForResponse(
      (value) =>
        value.url() === `${imageTestOrigin}/functions/v1/wine-image` &&
        value.request().method() === "POST",
      { timeout: 30000 },
    ),
    (async () => {
      await otherPage.bringToFront();
      await otherPage.waitForFunction(() => document.hasFocus());
      await page.waitForFunction(() => !document.hasFocus());
      await page.bringToFront();
      await page.waitForFunction(() => window.__wineSnapTestFocusEvents > 0);
    })(),
  ]);
  report.naturalFocusEvents.push(await page.evaluate(() => window.__wineSnapTestFocusEvents));
  return response;
}

try {
  const session = JSON.parse(await readFile(lifecycleFile, "utf8"));
  urls = imageBrowserSessionUrls(session);
  pwaMode = session.runtime === "built";
  if (pwaMode) {
    reportFile = new URL("../dist/hosted-image-mobile-report.json", import.meta.url);
    report.pwa = { cacheAudits: [] };
    report.results.push(
      ...[
        "built app naturally activates the real service worker for all app users",
        "activation deletes obsolete WineSnap caches but preserves unrelated caches",
        "update waits for explicit confirmation and reloads only after approval",
        "offline navigation shows only the offline shell with a decoded icon",
        "no account HTML, private images, credentials or API responses enter PWA caches",
      ].map((name) => ({ name, status: "pending" })),
    );
    mobileOffset = report.results.length;
    report.results.push(...mobileBrowserSteps.map((name) => ({ name, status: "pending" })));
  }
  const moduleFile = process.env.WINESNAP_PLAYWRIGHT_MODULE;
  const { chromium } = await import(
    moduleFile ? pathToFileURL(resolve(moduleFile)).href : "playwright"
  );
  testBrowser = await chromium.launch({
    headless: false,
    args: ["--use-fake-device-for-media-stream"],
  });
  const pages = {};
  for (const name of ["operator", "owner", "peer", "anonymous"]) {
    const context = await testBrowser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "sv-SE",
      serviceWorkers: pwaMode && name !== "operator" ? "allow" : "block",
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (!imageBrowserRequestAllowed(request.url(), urls.appUrl, urls.controlUrl)) {
        blockedRequests++;
        await route.abort("blockedbyclient");
        return;
      }
      const url = new URL(request.url());
      if (
        url.origin === imageTestOrigin &&
        request.method() === "GET" &&
        url.pathname.startsWith("/storage/v1/object/")
      ) {
        directStorageReads++;
      }
      await route.continue();
    });
    const page = await context.newPage();
    // Playwright otherwise makes every page appear permanently focused.
    const cdp = await context.newCDPSession(page);
    focusSessions.set(page, cdp);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(90000);
    page.on("pageerror", () => pageErrors++);
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
        scriptConsoleErrors++;
      }
    });
    context.on("response", (response) => {
      const url = new URL(response.url());
      const proxy = url.origin === imageTestOrigin && url.pathname === "/functions/v1/wine-image";
      if (proxy) {
        report.proxyResponses.push({
          actor: name,
          method: response.request().method(),
          status: response.status(),
          type: response.headers()["content-type"],
          cache: response.headers()["cache-control"],
        });
      }
      const expectedPeerDenial =
        name === "peer" && url.pathname === "/rest/v1/wines" && response.status() === 406;
      const expectedImageDenial = proxy && [403, 404, 410].includes(response.status());
      if (response.status() >= 400 && !expectedPeerDenial && !expectedImageDenial) {
        unexpectedResponses.push({
          actor: name,
          status: response.status(),
          endpoint: url.pathname,
        });
      }
    });
    pages[name] = page;
  }
  operator = pages.operator;
  const { owner, peer, anonymous } = pages;
  await operator.goto(urls.controlUrl);
  await operator
    .getByRole("heading", { name: "WineSnap-test image session", exact: true })
    .waitFor();
  operatorReady = true;
  await operator.getByText("Show temporary test sign-ins", { exact: true }).click();
  for (const label of ["Owner email", "Owner password", "Peer email", "Peer password"]) {
    credentials.push(await operator.getByLabel(label, { exact: true }).inputValue());
  }
  await operator.getByText("Show temporary test sign-ins", { exact: true }).click();

  await check(0, async () => {
    await anonymous.goto(urls.shareUrl);
    await anonymous.getByRole("heading", { name: "Not available", exact: true }).waitFor();
    await imageCount(anonymous, 0);
  });
  await check(1, async () => {
    if (pwaMode) {
      await owner.goto(`${urls.appUrl}/offline.html`);
      await owner.evaluate(async () => {
        for (const name of [
          "winesnap-assets-2026-10-13-privacy-controls",
          "winesnap-pages-2026-10-13-privacy-controls",
          "image-browser-unrelated",
        ])
          await caches.open(name);
      });
    }
    await login(owner, credentials[0], credentials[1]);
    await owner.goto(`${urls.appUrl}/cellar`);
    await owner.getByRole("heading", { name: "Min källare", exact: true }).waitFor();
    await decoded(owner, 1);
    await screenshot(owner, "cellar-desktop");
  });
  await check(2, async () => {
    await owner.getByRole("link", { name: /Synthetic image access test/ }).click();
    await owner.getByRole("heading", { name: /Synthetic image access test/ }).waitFor();
    await owner.getByRole("button", { name: "Översikt", exact: true }).click();
    await decoded(owner, 2);
    await auditCache(owner, "owner", "private-images-visible");
  });
  await check(3, async () => {
    await layout(owner);
    await screenshot(owner, "owner-desktop");
    await owner.setViewportSize({ width: 390, height: 844 });
    await decoded(owner, 2);
    await layout(owner);
    await screenshot(owner, "owner-mobile-e2e");
  });
  await check(4, async () => {
    await owner.locator('button:has(img[src^="blob:"])').first().click();
    await decoded(owner, 3);
    await owner.locator('button[aria-label="Close"]').click();
    await imageCount(owner, 2);
    await owner
      .locator('input[type="file"]')
      .setInputFiles(resolve(root, "src/assets/hero-bottle.jpg"));
    await owner.getByRole("button", { name: "Använd hela bilden", exact: true }).click();
    await owner
      .getByRole("button", { name: "Laddar upp…", exact: true })
      .waitFor({ state: "hidden" });
    await decoded(owner, 3);
  });
  await check(5, async () => {
    await Promise.all([
      owner.waitForEvent("dialog").then(async (confirmation) => {
        assert.equal(confirmation.type(), "confirm");
        await confirmation.accept();
      }),
      owner.getByRole("button", { name: "Radera bild", exact: true }).last().click(),
    ]);
    await imageCount(owner, 2);
    await decoded(owner, 2);
  });
  await check(6, async () => {
    await login(peer, credentials[2], credentials[3]);
    await peer.goto(urls.wineUrl);
    await peer.getByText("Vinet hittades inte.", { exact: true }).waitFor();
    await imageCount(peer, 0);
    await screenshot(peer, "peer-denied");
  });
  await check(7, async () => {
    await control("Make synthetic wine public", "shared");
    await anonymous.reload();
    await anonymous.getByRole("heading", { name: /Synthetic image access test/ }).waitFor();
    await decoded(anonymous, 1);
    if (pwaMode) await controlled(anonymous);
    await auditCache(anonymous, "anonymous", "shared-image-visible");
    assert.ok(
      report.proxyResponses.some(
        (response) =>
          response.actor === "anonymous" &&
          response.method === "POST" &&
          response.status === 200 &&
          response.type.startsWith("image/") &&
          response.cache.includes("no-store"),
      ),
    );
    await anonymous.setViewportSize({ width: 390, height: 844 });
    await layout(anonymous);
    await screenshot(anonymous, "shared-mobile");
  });
  await check(8, async () => {
    await control("Make synthetic wine private", "private");
    const denial = await focusAndWaitForImage(anonymous, owner);
    assert.ok([403, 404, 410].includes(denial.status()));
    await imageCount(anonymous, 0);
    await screenshot(anonymous, "unshared-image-cleared");
    await anonymous.reload();
    await anonymous.getByRole("heading", { name: "Not available", exact: true }).waitFor();
    await imageCount(anonymous, 0);
  });
  await check(9, async () => {
    await owner.bringToFront();
    await decoded(owner, 2);
  });
  await check(10, async () => {
    await control("Make synthetic wine public", "shared");
    await anonymous.reload();
    await decoded(anonymous, 1);
    await control("Request synthetic owner erasure", "erasure_requested");
    const denial = await focusAndWaitForImage(owner, anonymous);
    assert.ok([403, 404, 410].includes(denial.status()));
    await imageCount(owner, 0);
    await screenshot(owner, "erasure-images-cleared");
    const publicDenial = await focusAndWaitForImage(anonymous, owner);
    assert.ok([403, 404, 410].includes(publicDenial.status()));
    await imageCount(anonymous, 0);
    await anonymous.reload();
    await anonymous.getByRole("heading", { name: "Not available", exact: true }).waitFor();
  });
  await check(11, async () => {
    assert.equal(blockedRequests, 0);
    assert.equal(directStorageReads, 0);
    assert.equal(pageErrors, 0);
    assert.equal(scriptConsoleErrors, 0);
    assert.equal(unexpectedResponses.length, 0);
  });
  if (pwaMode) {
    await check(12, async () => {
      for (const page of [owner, peer, anonymous]) await controlled(page);
      report.pwa.controlledContexts = 3;
    });
    await check(13, async () => {
      const names = await owner.evaluate(() => caches.keys());
      assert.ok(names.includes("image-browser-unrelated"));
      assert.ok(!names.includes("winesnap-assets-2026-10-13-privacy-controls"));
      assert.ok(!names.includes("winesnap-pages-2026-10-13-privacy-controls"));
    });
    await check(14, async () => {
      await anonymous.goto(`${urls.appUrl}/login`);
      await anonymous.getByRole("button", { name: "Logga in", exact: true }).waitFor();
      await controlled(anonymous);
      await anonymous.getByLabel("E-post", { exact: true }).fill("pwa-unsaved@example.test");
      // Same real worker, new script URL: exercise the browser's waiting/update lifecycle.
      await anonymous.evaluate(() =>
        navigator.serviceWorker.register("/sw.js?image-browser-update=1"),
      );
      const offer = anonymous.getByRole("button", { name: "Uppdatering tillgänglig", exact: true });
      await offer.waitFor();
      assert.ok(
        await anonymous.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration()).waiting),
        ),
      );
      await offer.click();
      let dialog = anonymous.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Avbryt", exact: true }).click();
      assert.equal(
        await anonymous.getByLabel("E-post", { exact: true }).inputValue(),
        "pwa-unsaved@example.test",
      );
      assert.ok(
        await anonymous.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration()).waiting),
        ),
      );
      await offer.click();
      dialog = anonymous.getByRole("alertdialog");
      await screenshot(anonymous, "pwa-update-confirmation");
      await Promise.all([
        anonymous.waitForEvent("load"),
        dialog.getByRole("button", { name: "Ladda om", exact: true }).click(),
      ]);
      await anonymous.getByRole("button", { name: "Logga in", exact: true }).waitFor();
      assert.equal(await anonymous.getByLabel("E-post", { exact: true }).inputValue(), "");
      await controlled(anonymous);
    });
    await check(15, async () => {
      await anonymous.context().setOffline(true);
      try {
        await anonymous.goto(`${urls.appUrl}/cellar`);
        await anonymous.getByRole("heading", { name: "Du är offline", exact: true }).waitFor();
        report.pwa.offlineLayout = await anonymous.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          height: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
          bodyHeight: document.body.getBoundingClientRect().height,
          boxSizing: getComputedStyle(document.body).boxSizing,
          retryHeight: document.querySelector("a")?.getBoundingClientRect().height,
        }));
        await screenshot(anonymous, "pwa-offline-mobile");
        await layout(anonymous);
        assert.equal(
          await anonymous.evaluate(
            () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
          ),
          false,
        );
        assert.ok(
          (await anonymous.getByRole("link", { name: "Försök igen", exact: true }).boundingBox())
            .height >= 44,
        );
        await imageCount(anonymous, 0);
        assert.equal(await anonymous.locator("img").count(), 1);
        await anonymous.waitForFunction(() => {
          const icon = document.querySelector("img");
          return icon?.complete && icon.naturalWidth > 0;
        });
      } finally {
        await anonymous.context().setOffline(false);
      }
    });
    await check(16, async () => {
      await auditCache(owner, "owner", "erasure-complete");
      await auditCache(anonymous, "anonymous", "offline-complete");
      await auditCache(peer, "peer", "private-access-denied");
      assert.equal(blockedRequests, 0);
      assert.equal(directStorageReads, 0);
      assert.equal(pageErrors, 0);
      assert.equal(scriptConsoleErrors, 0);
      assert.equal(unexpectedResponses.length, 0);
    });
    await runMobileBrowserChecks({
      page: peer,
      appUrl: urls.appUrl,
      assetPath: resolve(root, "src/assets/hero-bottle.jpg"),
      check: (index, run) => check(mobileOffset + index, run),
      report,
      screenshot,
      layout,
      finalAudit: async () => {
        await auditCache(peer, "peer", "camera-and-drafts-cancelled");
        assert.equal(blockedRequests, 0);
        assert.equal(directStorageReads, 0);
        assert.equal(pageErrors, 0);
        assert.equal(scriptConsoleErrors, 0);
        assert.equal(unexpectedResponses.length, 0);
      },
    });
  }
  report.completed = true;
} catch (error) {
  if (activeStep !== undefined) report.results[activeStep].status = "failed";
  // Raw Playwright errors can contain filled synthetic passwords; never persist them.
  report.failureClass = error?.constructor?.name ?? "UnknownError";
  report.failureReason = error?.message?.includes("strict mode violation")
    ? "ambiguous_locator"
    : error?.message?.includes("Timeout")
      ? "timeout"
      : "assertion_or_runtime_error";
  process.exitCode = 1;
} finally {
  credentials.fill("");
  if (operatorReady) {
    try {
      await operator.goto(urls.controlUrl);
      await operator
        .getByRole("button", { name: "Finish test and clean fixtures", exact: true })
        .click();
      for (let attempt = 0; attempt < 80; attempt++) {
        const state = JSON.parse(await readFile(lifecycleFile, "utf8"));
        if (
          state.controlUrl === urls.controlUrl &&
          state.phase === "cleaned" &&
          state.cleanupFailures === 0
        ) {
          report.cleanupConfirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch {
      report.cleanupConfirmed = false;
    }
  }
  await testBrowser?.close().catch(() => {});
  report.checkedAt = new Date().toISOString();
  report.blockedRequests = blockedRequests;
  report.directStorageReads = directStorageReads;
  report.pageErrors = pageErrors;
  report.scriptConsoleErrors = scriptConsoleErrors;
  report.unexpectedResponses = unexpectedResponses;
  report.passed = report.results.filter((result) => result.status === "passed").length;
  report.failed = report.results.filter((result) => result.status === "failed").length;
  if (!report.cleanupConfirmed) process.exitCode = 1;
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      completed: report.completed,
      passed: report.passed,
      failed: report.failed,
      cleanupConfirmed: report.cleanupConfirmed,
    }),
  );
}
