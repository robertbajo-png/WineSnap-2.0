import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  localViewPhase,
  validateLocalFocus,
  startOwnedLocalLifecycle,
  probeOwnedLocalPage,
} from "./owned-local-lifecycle.mjs";

const runId = "01234567-89ab-4cde-8123-456789abcdef";
const requestId = "abcdef01-2345-4678-9123-456789abcdef";
const now = Date.parse("2026-11-13T12:00:00Z");
const request = () => ({
  project: "winesnap-owned-local",
  version: 1,
  action: "focus",
  runId,
  requestId,
  issuedAt: new Date(now).toISOString(),
});
afterEach(() => vi.unstubAllGlobals());

describe("current loopback owner session probe", () => {
  function fixture({ status = 200, id = runId, saved = true, unavailable = false } = {}) {
    const storage = saved
      ? {
          "sb-synthetic-auth-token": JSON.stringify({
            user: { id: runId, role: "authenticated" },
            access_token: "synthetic-only",
          }),
        }
      : {};
    vi.stubGlobal("localStorage", { ...storage, getItem: (key) => storage[key] ?? null });
    vi.stubGlobal("location", { origin: "http://127.0.0.1:5212" });
    const fetch = vi.fn(async () => {
      if (unavailable) throw new Error("synthetic network failure");
      return { ok: status >= 200 && status < 300, status, json: async () => ({ id }) };
    });
    vi.stubGlobal("fetch", fetch);
    return {
      fetch,
      page: {
        isClosed: () => false,
        url: () => "http://127.0.0.1:5212/",
        evaluate: (callback, argument) => callback(argument),
      },
    };
  }
  it("returns only booleans from a verified existing owner's ordinary session", async () => {
    const { page, fetch } = fixture();
    const result = await probeOwnedLocalPage(page, runId);
    expect(result).toEqual({
      windowOpen: true,
      ownerPresent: true,
      backendAvailable: true,
      serverVerified: true,
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:54323/auth/v1/user",
      expect.objectContaining({ redirect: "error", cache: "no-store" }),
    );
    expect(Object.values(result).every((value) => typeof value === "boolean")).toBe(true);
  });
  it.each([{ status: 401 }, { status: 403 }, { id: requestId }, { saved: false }])(
    "never reports an invalid or missing owner as authenticated",
    async (options) => {
      const { page } = fixture(options);
      expect(localViewPhase(await probeOwnedLocalPage(page, runId))).toBe("signed_out");
    },
  );
  it.each([{ status: 503 }, { unavailable: true }])(
    "keeps a backend outage separate from explicit logout",
    async (options) => {
      const { page } = fixture(options);
      expect(localViewPhase(await probeOwnedLocalPage(page, runId))).toBe("backend_unavailable");
    },
  );
  it("does not read a session on a closed or foreign page", async () => {
    const { page, fetch } = fixture();
    expect((await probeOwnedLocalPage({ ...page, isClosed: () => true }, runId)).windowOpen).toBe(
      false,
    );
    expect(
      (await probeOwnedLocalPage({ ...page, url: () => "https://untrusted.example/" }, runId))
        .ownerPresent,
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("local viewer lifecycle and private focus", () => {
  it.each([
    [{ windowOpen: false }, "closed"],
    [{ windowOpen: true, ownerPresent: false }, "signed_out"],
    [{ windowOpen: true, ownerPresent: true, backendAvailable: false }, "backend_unavailable"],
    [
      { windowOpen: true, ownerPresent: true, backendAvailable: true, serverVerified: false },
      "backend_unavailable",
    ],
    [
      { windowOpen: true, ownerPresent: true, backendAvailable: true, serverVerified: true },
      "ready",
    ],
  ])("reports only verified current readiness", (input, phase) =>
    expect(localViewPhase(input)).toBe(phase),
  );
  it("accepts only a fresh exact-instance focus command with no extra payload", () => {
    expect(validateLocalFocus(request(), runId, now).requestId).toBe(requestId);
    for (const value of [
      { ...request(), action: "login" },
      { ...request(), runId: requestId },
      { ...request(), url: "https://untrusted.example" },
      { ...request(), issuedAt: new Date(now - 30001).toISOString() },
      { ...request(), issuedAt: new Date(now + 5001).toISOString() },
      { ...request(), issuedAt: "invalid" },
    ])
      expect(() => validateLocalFocus(value, runId, now)).toThrow();
  });
  it("focuses once, tracks logout/outage/recovery and stops without late heartbeats", async () => {
    const directory = await mkdtemp(join(tmpdir(), "winesnap-lifecycle-"));
    const controlFile = join(directory, "local-view-control.json");
    const publish = vi.fn(),
      focus = vi.fn();
    let time = now,
      closed = false;
    let state = {
      windowOpen: true,
      ownerPresent: true,
      backendAvailable: true,
      serverVerified: true,
    };
    const probe = vi.fn(async () => state);
    const lifecycle = startOwnedLocalLifecycle({
      page: { isClosed: () => closed },
      runId,
      ownerId: runId,
      controlFile,
      publish,
      focus,
      probe,
      now: () => time,
      intervalMs: 0,
    });
    try {
      await writeFile(controlFile, JSON.stringify(request()));
      await lifecycle.tick();
      await lifecycle.tick();
      expect(focus).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "ready",
          lastFocusRequestId: requestId,
          focusResult: "focused",
          authenticated: true,
        }),
      );
      time += 5000;
      state = { ...state, ownerPresent: false, serverVerified: false };
      await lifecycle.tick();
      expect(publish.mock.lastCall[0]).toMatchObject({
        phase: "signed_out",
        ready: false,
        authenticated: false,
      });
      time += 5000;
      state = { ...state, ownerPresent: true, backendAvailable: false };
      await lifecycle.tick();
      expect(publish.mock.lastCall[0].phase).toBe("backend_unavailable");
      time += 5000;
      state = { ...state, backendAvailable: true, serverVerified: true };
      await lifecycle.tick();
      expect(publish.mock.lastCall[0].phase).toBe("ready");
      closed = true;
      await lifecycle.tick();
      expect(publish.mock.lastCall[0]).toMatchObject({
        phase: "closed",
        viewerRunning: false,
        ready: false,
      });
      await lifecycle.stop();
      const count = publish.mock.calls.length;
      await lifecycle.tick();
      expect(publish).toHaveBeenCalledTimes(count);
    } finally {
      await lifecycle.stop();
      await rm(controlFile, { force: true });
      await rmdir(directory);
    }
  });
  it("ignores malformed/oversized controls and does not invent authentication after a probe error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "winesnap-lifecycle-"));
    const controlFile = join(directory, "local-view-control.json");
    const publish = vi.fn(),
      focus = vi.fn();
    const lifecycle = startOwnedLocalLifecycle({
      page: { isClosed: () => false },
      runId,
      controlFile,
      publish,
      focus,
      probe: async () => {
        throw new Error("synthetic");
      },
      intervalMs: 0,
    });
    try {
      await writeFile(controlFile, "x".repeat(2049));
      await lifecycle.tick();
      expect(focus).not.toHaveBeenCalled();
      expect(publish.mock.lastCall[0]).toMatchObject({
        phase: "backend_unavailable",
        authenticated: false,
        ready: false,
      });
    } finally {
      await lifecycle.stop();
      await rm(controlFile, { force: true });
      await rmdir(directory);
    }
  });
  it("bounds stalled browser operations without stacking more work or freezing status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "winesnap-stalled-lifecycle-"));
    const controlFile = join(directory, "local-view-control.json");
    const never = () => new Promise(() => {});
    const focus = vi.fn(never),
      probe = vi.fn(never),
      publish = vi.fn();
    let time = now;
    const lifecycle = startOwnedLocalLifecycle({
      page: { isClosed: () => false },
      runId,
      controlFile,
      focus,
      probe,
      publish,
      now: () => time,
      intervalMs: 0,
      operationTimeoutMs: 10,
    });
    try {
      await writeFile(controlFile, JSON.stringify(request()));
      await lifecycle.tick();
      expect(publish.mock.lastCall[0]).toMatchObject({
        phase: "backend_unavailable",
        ready: false,
        focusResult: "focus_failed",
        lastFocusRequestId: requestId,
      });
      time += 5000;
      await writeFile(
        controlFile,
        JSON.stringify({
          ...request(),
          requestId: "11111111-2222-4333-8444-555555555555",
          issuedAt: new Date(time).toISOString(),
        }),
      );
      await lifecycle.tick();
      expect(focus).toHaveBeenCalledTimes(1);
      expect(probe).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledTimes(4);
      expect(publish.mock.lastCall[0].ready).toBe(false);
      await lifecycle.stop();
    } finally {
      await lifecycle.stop();
      await rm(controlFile, { force: true });
      await rmdir(directory);
    }
  });
  it("acknowledges completed focus before awaiting a stalled session probe", async () => {
    const directory = await mkdtemp(join(tmpdir(), "winesnap-focus-ack-"));
    const controlFile = join(directory, "local-view-control.json");
    const publish = vi.fn();
    let acknowledgementAtProbe;
    const probe = vi.fn(() => {
      acknowledgementAtProbe = publish.mock.lastCall?.[0];
      return new Promise(() => {});
    });
    const lifecycle = startOwnedLocalLifecycle({
      page: { isClosed: () => false },
      runId,
      controlFile,
      publish,
      probe,
      focus: async () => {},
      now: () => now,
      intervalMs: 0,
      operationTimeoutMs: 10,
    });
    try {
      await writeFile(controlFile, JSON.stringify(request()));
      await lifecycle.tick();
      expect(probe).toHaveBeenCalledTimes(1);
      expect(acknowledgementAtProbe).toMatchObject({
        lastFocusRequestId: requestId,
        focusResult: "focused",
        phase: "checking_session",
        ready: false,
        authenticated: false,
      });
      expect(publish.mock.lastCall[0]).toMatchObject({
        phase: "backend_unavailable",
        ready: false,
      });
    } finally {
      await lifecycle.stop();
      await rm(controlFile, { force: true });
      await rmdir(directory);
    }
  });
});
