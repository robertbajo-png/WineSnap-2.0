import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { startOwnedLocalLifecycle, focusOwnedLocalPage } from "./lib/owned-local-lifecycle.mjs";

assert.ok(
  process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--headed"),
);
const headed = process.argv[2] === "--headed";
const report = {
  synthetic: true,
  realOwnerUsed: false,
  authenticationSimulated: true,
  productionTouched: false,
  completed: false,
  cleanupCompleted: false,
  checks: 0,
  headedWindowRestore: false,
};
let browser, lifecycle, directory, controlFile;
try {
  const { chromium } = await import(
    pathToFileURL(
      join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
    ).href
  );
  directory = await mkdtemp(join(tmpdir(), "winesnap-viewer-lifecycle-"));
  controlFile = join(directory, "local-view-control.json");
  const runId = randomUUID();
  let time = Date.now(),
    focused = 0,
    latest;
  let state = {
    windowOpen: true,
    ownerPresent: true,
    backendAvailable: true,
    serverVerified: true,
  };
  browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>WineSnap - synthetic lifecycle check</title><h1>Local window control test</h1><p>Synthetic fixture. No account or backend connection.</p>",
    }),
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5212/");
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  if (headed)
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  lifecycle = startOwnedLocalLifecycle({
    page,
    runId,
    controlFile,
    probe: async () => state,
    now: () => time,
    intervalMs: 0,
    publish: async (value) => {
      latest = value;
    },
    focus: async () => {
      await focusOwnedLocalPage(page);
      focused++;
    },
  });
  const requestId = randomUUID();
  await writeFile(
    controlFile,
    JSON.stringify({
      project: "winesnap-owned-local",
      version: 1,
      action: "focus",
      runId,
      requestId,
      issuedAt: new Date(time).toISOString(),
    }),
  );
  await lifecycle.tick();
  assert.equal(latest.phase, "ready");
  assert.equal(latest.lastFocusRequestId, requestId);
  assert.equal(latest.focusResult, "focused");
  assert.equal(
    (await cdp.send("Browser.getWindowBounds", { windowId })).bounds.windowState,
    "normal",
  );
  report.headedWindowRestore = headed;
  report.checks++;
  await lifecycle.tick();
  assert.equal(focused, 1);
  assert.equal(context.pages().length, 1);
  report.checks++;
  time += 5000;
  state = { ...state, ownerPresent: false, serverVerified: false };
  await lifecycle.tick();
  assert.equal(latest.phase, "signed_out");
  assert.equal(latest.ready, false);
  report.checks++;
  time += 5000;
  state = { ...state, ownerPresent: true, backendAvailable: false };
  await lifecycle.tick();
  assert.equal(latest.phase, "backend_unavailable");
  report.checks++;
  time += 5000;
  state = { ...state, backendAvailable: true, serverVerified: true };
  await lifecycle.tick();
  assert.equal(latest.phase, "ready");
  report.checks++;
  await writeFile(
    controlFile,
    JSON.stringify({
      project: "winesnap-owned-local",
      version: 1,
      action: "focus",
      runId: randomUUID(),
      requestId: randomUUID(),
      issuedAt: new Date(time).toISOString(),
    }),
  );
  await lifecycle.tick();
  assert.equal(focused, 1);
  report.checks++;
  await cdp.detach();
  const { waitForOwnedViewerClose } = await import("./lib/owned-viewer-close.mjs");
  const closed = waitForOwnedViewerClose(browser);
  await page.close();
  await closed;
  assert.equal(browser.isConnected(), true);
  report.checks++;
  await lifecycle.tick();
  assert.equal(latest.phase, "closed");
  assert.equal(latest.ready, false);
  report.checks++;
  report.completed = true;
} catch (error) {
  report.failure = "synthetic_local_lifecycle_not_accepted";
  report.errorType = error.name === "AssertionError" ? "AssertionError" : "Error";
} finally {
  await lifecycle?.stop();
  await browser?.close().catch(() => undefined);
  try {
    if (controlFile) await rm(controlFile, { force: true });
    if (directory) await rmdir(directory);
    report.cleanupCompleted = true;
  } catch {
    report.completed = false;
  }
}
console.log(JSON.stringify(report));
if (!report.completed) process.exitCode = 1;
