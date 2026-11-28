import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { ownedApi, ownedApp } from "./owned-backend.mjs";

export const localViewHeartbeatMs = 5000;
export const localViewFreshnessMs = 30000;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function localViewPhase({ windowOpen, ownerPresent, backendAvailable, serverVerified }) {
  if (!windowOpen) return "closed";
  if (!ownerPresent) return "signed_out";
  return backendAvailable && serverVerified ? "ready" : "backend_unavailable";
}

export function validateLocalFocus(value, runId, now = Date.now()) {
  assert.match(runId, uuid);
  assert.deepEqual(Object.keys(value).sort(), [
    "action",
    "issuedAt",
    "project",
    "requestId",
    "runId",
    "version",
  ]);
  assert.equal(value.project, "winesnap-owned-local");
  assert.equal(value.version, 1);
  assert.equal(value.action, "focus");
  assert.equal(value.runId, runId);
  assert.match(value.requestId, uuid);
  const age = now - Date.parse(value.issuedAt);
  assert.ok(Number.isFinite(age) && age >= -5000 && age <= localViewFreshnessMs);
  return value;
}

export async function probeOwnedLocalPage(page, ownerId) {
  if (page.isClosed())
    return {
      windowOpen: false,
      ownerPresent: false,
      backendAvailable: false,
      serverVerified: false,
    };
  if (new URL(page.url()).origin !== ownedApp)
    return {
      windowOpen: true,
      ownerPresent: false,
      backendAvailable: false,
      serverVerified: false,
    };
  return page.evaluate(
    async ({ ownerId, api }) => {
      let session;
      try {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith("sb-") || !key.endsWith("auth-token")) continue;
          const saved = JSON.parse(localStorage.getItem(key));
          if (saved?.user?.id === ownerId && saved.user.role === "authenticated") {
            session = saved;
            break;
          }
        }
      } catch {
        /* Treat inaccessible or malformed storage as signed out. */
      }
      if (!session?.access_token)
        return {
          windowOpen: true,
          ownerPresent: false,
          backendAvailable: true,
          serverVerified: false,
        };
      try {
        const response = await fetch(api + "/auth/v1/user", {
          headers: { Authorization: "Bearer " + session.access_token },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        const valid = response.ok && (await response.json()).id === ownerId;
        return {
          windowOpen: true,
          ownerPresent: response.ok ? valid : response.status !== 401 && response.status !== 403,
          backendAvailable: response.status < 500,
          serverVerified: valid,
        };
      } catch {
        return {
          windowOpen: true,
          ownerPresent: true,
          backendAvailable: false,
          serverVerified: false,
        };
      }
    },
    { ownerId, api: ownedApi },
  );
}

export async function focusOwnedLocalPage(page) {
  assert.ok(!page.isClosed() && new URL(page.url()).origin === ownedApp);
  const session = await page.context().newCDPSession(page);
  try {
    const { windowId } = await session.send("Browser.getWindowForTarget");
    assert.ok(Number.isInteger(windowId));
    await session.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await page.bringToFront();
    const { bounds } = await session.send("Browser.getWindowBounds", { windowId });
    assert.equal(bounds.windowState, "normal");
  } finally {
    await session.detach();
  }
}

export function startOwnedLocalLifecycle({
  page,
  ownerId,
  runId,
  controlFile,
  publish,
  probe = () => probeOwnedLocalPage(page, ownerId),
  focus = () => focusOwnedLocalPage(page),
  now = Date.now,
  intervalMs = 1000,
  operationTimeoutMs = 8000,
}) {
  assert.match(runId, uuid);
  assert.equal(typeof publish, "function");
  assert.ok(intervalMs === 0 || intervalMs >= 100);
  assert.ok(
    Number.isInteger(operationTimeoutMs) && operationTimeoutMs > 0 && operationTimeoutMs <= 10000,
  );
  const pending = new Map();
  async function bounded(kind, operation) {
    assert.ok(!pending.has(kind), "Previous browser operation is still pending.");
    const work = Promise.resolve().then(operation);
    pending.set(kind, work);
    void work.finally(() => pending.delete(kind)).catch(() => undefined);
    let deadline;
    try {
      return await Promise.race([
        work,
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Local browser operation timed out.")),
            operationTimeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
  }
  let stopped = false,
    timer,
    inFlight,
    lastProbe = -Infinity,
    lastFocusId,
    lastControlTime;
  let current = {
    windowOpen: true,
    ownerPresent: true,
    backendAvailable: true,
    serverVerified: true,
  };
  let verifiedAt = new Date(now()).toISOString();
  async function publishState(changed, checking = false) {
    const phase = checking ? "checking_session" : localViewPhase(current);
    await publish({
      ...changed,
      phase,
      viewerRunning: current.windowOpen,
      authenticated: phase === "ready",
      ready: phase === "ready",
      lastVerifiedAt: verifiedAt,
    });
  }
  async function update() {
    const changed = {};
    if (page.isClosed())
      current = {
        windowOpen: false,
        ownerPresent: false,
        backendAvailable: false,
        serverVerified: false,
      };
    else {
      try {
        const file = await lstat(controlFile);
        assert.ok(file.isFile() && !file.isSymbolicLink() && file.size <= 2048);
        if (file.mtimeMs !== lastControlTime) {
          const request = validateLocalFocus(
            JSON.parse(await readFile(controlFile, "utf8")),
            runId,
            now(),
          );
          lastControlTime = file.mtimeMs;
          if (request.requestId !== lastFocusId) {
            try {
              await bounded("focus", focus);
              changed.focusResult = "focused";
            } catch {
              changed.focusResult = "focus_failed";
            }
            lastFocusId = request.requestId;
            changed.lastFocusRequestId = lastFocusId;
            // A slow session check must not withhold an already completed window action.
            await publishState(changed, true);
          }
        }
      } catch {
        /* Malformed, stale, foreign and incomplete requests cannot control the viewer. */
      }
      if (now() - lastProbe >= localViewHeartbeatMs) {
        try {
          current = await bounded("probe", probe);
        } catch {
          current = {
            windowOpen: !page.isClosed(),
            ownerPresent: true,
            backendAvailable: false,
            serverVerified: false,
          };
        }
        lastProbe = now();
        if (current.serverVerified) verifiedAt = new Date(now()).toISOString();
      }
    }
    await publishState(changed);
  }
  function tick() {
    if (stopped) return Promise.resolve();
    if (!inFlight)
      inFlight = update().finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }
  if (intervalMs)
    timer = setInterval(() => {
      void tick().catch(() => undefined);
    }, intervalMs);
  return {
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight?.catch(() => undefined);
    },
  };
}
