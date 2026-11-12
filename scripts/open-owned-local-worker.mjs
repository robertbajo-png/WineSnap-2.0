// Private stdin operator. Run only through open-owned-local.ps1.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  checkOwnedContainer,
  ownedApi,
  ownedApp,
  ownedToken,
  validateOwnedKeys,
} from "./lib/owned-backend.mjs";
import { createOwnedLocalLogin, ownedLocalViewRequest } from "./lib/owned-local-view.mjs";
import { checkOwnedTunnelContainer, ownedConnectorName } from "./lib/owned-tunnel.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.WINESNAP_OWNED_LOCAL_VIEW_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.equal(process.argv.length, 3);
assert.ok(["Open", "Check"].includes(process.argv[2]));
const acceptance = process.argv[2] === "Check";
const report = {
  project: "winesnap-owned-local",
  completed: false,
  ready: false,
  productionTouched: false,
  loopbackOnly: true,
  acceptance,
  ownerSessionVerified: false,
  app: ownedApp,
  blockedExternalRequests: 0,
  blockedAiRequests: 0,
};
const statusFile = join(process.env.USERPROFILE, "WineSnapOwned/local-view-status.json");
const chunks = [];
let payload, login, browser;
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
async function status(phase) {
  report.phase = phase;
  report.checkedAt = new Date().toISOString();
  const item = await lstat(statusFile);
  assert.ok(item.isFile() && !item.isSymbolicLink() && item.size <= 16384);
  await writeFile(statusFile, JSON.stringify(report));
}
function inspect(name) {
  return new Promise((resolve, reject) =>
    execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", "inspect", name],
      { windowsHide: true, timeout: 20000, maxBuffer: 262144 },
      (error, output) => {
        if (error) reject(new Error("owned_local_container_check_failed"));
        else {
          try {
            resolve(JSON.parse(output)[0]);
          } catch {
            reject(new Error("owned_local_container_check_failed"));
          }
        }
      },
    ),
  );
}
try {
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 16384);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try {
    payload = JSON.parse(bytes.toString());
  } finally {
    bytes.fill(0);
  }
  assert.deepEqual(Object.keys(payload).sort(), ["binding", "keys", "ownerEmail"]);
  validateOwnedKeys(payload.keys);
  await status("validating_owned_installation");
  for (const name of ["winesnap-owned-web", "winesnap-owned-gateway", "winesnap-owned-auth"]) {
    const container = await inspect(name);
    checkOwnedContainer(container, name, payload.keys.installationId);
    assert.equal(container.State.Running, true);
  }
  const connector = await inspect(ownedConnectorName);
  checkOwnedTunnelContainer(connector, payload.keys.installationId);
  assert.equal(connector.State.Running, false);
  report.internetPaused = true;
  await status("opening_existing_owner");
  let admin = createClient(ownedApi, ownedToken(payload.keys, "service_role"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (url, init) => {
        const target = new URL(String(url));
        assert.equal(target.origin, ownedApi);
        assert.ok(
          target.pathname.startsWith("/auth/v1/") ||
            target.pathname === "/rest/v1/rpc/privacy_account_active",
        );
        return fetch(url, {
          ...init,
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
      },
    },
  });
  login = await createOwnedLocalLogin(
    admin,
    payload.binding,
    payload.keys.installationId,
    payload.ownerEmail,
  );
  admin = undefined;
  payload = undefined;
  for (const chunk of chunks) chunk.fill(0);
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
    ...(acceptance ? { serviceWorkers: "block" } : {}),
  });
  await context.route("**/*", async (route) => {
    const decision = ownedLocalViewRequest(route.request().url(), acceptance);
    if (decision === "block_external") {
      report.blockedExternalRequests++;
      return route.abort();
    }
    if (decision === "block_ai") {
      report.blockedAiRequests++;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"local_login_check_only"}',
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  await status("authenticating_local_browser");
  await page.goto(login.link, { waitUntil: "domcontentloaded", timeout: 60000 });
  login.link = undefined;
  await page.waitForFunction(
    (ownerId) =>
      location.origin === "http://127.0.0.1:5212" &&
      location.pathname === "/" &&
      Object.keys(localStorage).some((key) => {
        if (!key.startsWith("sb-") || !key.endsWith("auth-token")) return false;
        try {
          return JSON.parse(localStorage.getItem(key))?.user?.id === ownerId;
        } catch {
          return false;
        }
      }),
    login.ownerId,
    { timeout: 60000 },
  );
  report.ownerSessionVerified = await page.evaluate(
    async ({ ownerId, api }) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("sb-") || !key.endsWith("auth-token")) continue;
        try {
          const session = JSON.parse(localStorage.getItem(key));
          if (session?.user?.id !== ownerId || session.user.role !== "authenticated") continue;
          const response = await fetch(api + "/auth/v1/user", {
            headers: { Authorization: "Bearer " + session.access_token },
            redirect: "error",
            cache: "no-store",
          });
          return response.ok && (await response.json()).id === ownerId;
        } catch {
          return false;
        }
      }
      return false;
    },
    { ownerId: login.ownerId, api: ownedApi },
  );
  assert.equal(report.ownerSessionVerified, true);
  assert.equal(new URL(page.url()).origin, ownedApp);
  assert.equal(new URL(page.url()).hash, "");
  await page.locator(".pilot-hero").waitFor({ state: "visible", timeout: 30000 });
  report.ready = true;
  if (acceptance) {
    report.probeSessionLoggedOut = await page.evaluate(async (api) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("sb-") || !key.endsWith("auth-token")) continue;
        const session = JSON.parse(localStorage.getItem(key));
        if (!session?.access_token) continue;
        const response = await fetch(api + "/auth/v1/logout?scope=local", {
          method: "POST",
          headers: { Authorization: "Bearer " + session.access_token },
          redirect: "error",
          cache: "no-store",
        });
        return response.ok;
      }
      return false;
    }, ownedApi);
    assert.equal(report.probeSessionLoggedOut, true);
    report.completed = true;
    await status("verified");
  } else {
    await page.bringToFront();
    await status("ready");
    await new Promise((resolve) => browser.once("disconnected", resolve));
    report.completed = true;
  }
} catch (error) {
  report.failure = "owned_local_view_not_ready";
  report.errorType = ["AssertionError", "TimeoutError", "TypeError"].includes(error.name)
    ? error.name
    : "Error";
} finally {
  report.ready = false;
  payload = undefined;
  login = undefined;
  for (const chunk of chunks) chunk.fill(0);
  await browser?.close().catch(() => undefined);
  await status(report.completed ? "complete" : "needs_attention").catch(() => undefined);
  console.log(JSON.stringify(report));
  if (!report.completed) process.exitCode = 1;
}
