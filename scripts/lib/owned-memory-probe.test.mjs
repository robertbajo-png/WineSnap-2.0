import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import {
  boundedMemoryProbe,
  createOwnedMemoryProbe,
  ownedMemoryLabels as labels,
  withOwnedMemoryProbe,
} from "./owned-memory-probe.mjs";

function manifest() {
  const run = randomUUID();
  return {
    project: "winesnap-owned-local",
    run,
    email: `owned-browser-${run}@example.test`,
    ...Object.fromEntries(
      ["userId", "wineId", "noteId", "shareId", "versionId", "sessionId"].map((key) => [
        key,
        randomUUID(),
      ]),
    ),
  };
}
const response = (data, status = 200) => ({
  status: () => status,
  json: vi.fn().mockResolvedValue(data),
  dispose: vi.fn().mockResolvedValue(),
});
const entry = (value) => ({ attribute: "ingredient", value, direction: 1 });
const add = (value = labels.saved, id = randomUUID()) => ({
  _action: "add",
  _id: id,
  _revision: 0,
  _entry: entry(value),
});
function route(path, body, options = {}) {
  return {
    request: () => ({
      url: () => (options.origin ?? ownedApi) + path,
      method: () => options.method ?? "POST",
      headers: () =>
        options.headers ?? {
          authorization: "Bearer synthetic-not-a-real-token",
          apikey: "synthetic-public-only",
        },
      postDataJSON: () => body,
      frame: () => ({ page: () => options.page }),
      failure: () => (options.cancelled ? { errorText: "net::ERR_ABORTED" } : null),
    }),
    fetch: vi.fn().mockResolvedValue(response(null, 204)),
    fulfill: vi.fn().mockResolvedValue(),
    abort: vi.fn().mockResolvedValue(),
    fallback: vi.fn().mockResolvedValue(),
  };
}
const rpc = "/rest/v1/rpc/food_memory_change";
let fixture, user, context, probe;
beforeEach(() => {
  fixture = manifest();
  user = {
    id: fixture.userId,
    email: fixture.email,
    app_metadata: { owned_browser_run: fixture.run },
  };
  context = {
    request: { get: vi.fn(async () => response(user)) },
    route: vi.fn(),
    unroute: vi.fn(),
  };
  probe = createOwnedMemoryProbe(context, fixture);
});
async function saved() {
  probe.arm("add-read-error");
  const body = add(),
    r = route(rpc, body);
  await probe.handler(r);
  expect(r.fetch).toHaveBeenCalledOnce();
  return body._id;
}
async function corrected() {
  const id = await saved();
  probe.arm("correct-conflict");
  const r = route(rpc, { _action: "correct", _id: id, _revision: 1, _entry: entry(labels.draft) });
  r.fetch
    .mockResolvedValueOnce(response(null, 204))
    .mockResolvedValueOnce(response({ code: "PT409" }, 409));
  await probe.handler(r);
  const server = randomUUID();
  context.request.get.mockImplementation(async (url) => {
    if (new URL(url).pathname === "/auth/v1/user") return response(user);
    return response([
      {
        id: server,
        user_id: fixture.userId,
        value: labels.server,
        revision: 1,
        status: "confirmed",
        source_kind: "correction",
        source_key: "statement:" + id,
      },
    ]);
  });
  await probe.inspectServerCorrection();
  return { id, server, r };
}
async function hold() {
  probe.arm("add-late");
  const r = route(rpc, add(labels.late));
  const pending = probe.handler(r);
  await probe.waitHeld();
  return { r, pending };
}
async function peerRead(peer, page, table = "food_signals") {
  user = { id: peer.userId, email: peer.email, app_metadata: { owned_browser_run: peer.run } };
  const r = route(`/rest/v1/${table}?user_id=eq.${peer.userId}`, null, { method: "GET", page });
  await probe.handler(r);
  return r;
}

describe("owned memory fixture boundary", () => {
  it.each(["realEmail", "extraField", "missingTagId", "foreignProject"])(
    "rejects %s before activity",
    (kind) => {
      const bad = { ...fixture };
      if (kind === "realEmail") bad.email = "real@example.com";
      if (kind === "extraField") bad.anything = true;
      if (kind === "missingTagId") delete bad.run;
      if (kind === "foreignProject") bad.project = "production";
      expect(() => createOwnedMemoryProbe(context, bad)).toThrow();
      expect(context.request.get).not.toHaveBeenCalled();
    },
  );
  it.each(["wrongOwner", "wrongEmail", "missingTag", "wrongTag", "mutableOnly", "unauthenticated"])(
    "never forwards with %s",
    async (kind) => {
      if (kind === "wrongOwner") user.id = randomUUID();
      if (kind === "wrongEmail") user.email = "real@example.com";
      if (kind === "missingTag") user.app_metadata = {};
      if (kind === "wrongTag") user.app_metadata.owned_browser_run = randomUUID();
      if (kind === "mutableOnly") {
        user.user_metadata = user.app_metadata;
        user.app_metadata = {};
      }
      if (kind === "unauthenticated") context.request.get.mockResolvedValue(response({}, 401));
      probe.arm("add-read-error");
      const r = route(rpc, add());
      await probe.handler(r);
      expect(r.fetch).not.toHaveBeenCalled();
      expect(r.abort).toHaveBeenCalledOnce();
      expect(probe.snapshot().fixtureErrors).toBe(1);
    },
  );
  it.each([
    "badOrigin",
    "wrongTable",
    "directWrite",
    "extraQuery",
    "noToken",
    "unarmed",
    "medicalValue",
    "wrongDirection",
    "extraEntry",
    "badId",
    "fixtureId",
    "wrongRevision",
  ])("rejects %s before forwarding", async (kind) => {
    const body = add(),
      options = {};
    let path = rpc;
    if (kind !== "unarmed") probe.arm("add-read-error");
    if (kind === "badOrigin") options.origin = "https://unapproved.example.invalid";
    if (kind === "wrongTable") path = "/rest/v1/rpc/another_rpc";
    if (kind === "directWrite") path = "/rest/v1/food_signals";
    if (kind === "extraQuery") path += "?anything=1";
    if (kind === "noToken") options.headers = { apikey: "synthetic-public-only" };
    if (kind === "medicalValue") body._entry.value = "medical condition";
    if (kind === "wrongDirection") body._entry.direction = -1;
    if (kind === "extraEntry") body._entry.user_id = fixture.userId;
    if (kind === "badId") body._id = "not-a-uuid";
    if (kind === "fixtureId") body._id = fixture.userId;
    if (kind === "wrongRevision") body._revision = 2;
    const r = route(path, body, options);
    await probe.handler(r);
    expect(r.fetch).not.toHaveBeenCalled();
    expect(r.abort).toHaveBeenCalledOnce();
  });
  it("blocks AI instead of invoking a local or hosted provider", async () => {
    const r = route("/api/chef", { action: "extract" }, { origin: ownedApp });
    await probe.handler(r);
    expect(r.fetch).not.toHaveBeenCalled();
    expect(context.request.get).not.toHaveBeenCalled();
    expect(probe.snapshot()).toMatchObject({ unexpectedAi: 1, fixtureErrors: 1 });
  });
  it("requires exact owner filters for every normal read", async () => {
    const r = route("/rest/v1/food_signals", null, { method: "GET" });
    await probe.handler(r);
    expect(r.fallback).not.toHaveBeenCalled();
    expect(r.abort).toHaveBeenCalledOnce();
  });
  it("does not count preflight as authentication or a write", async () => {
    const r = route(rpc, null, { method: "OPTIONS" });
    await probe.handler(r);
    expect(r.fallback).toHaveBeenCalledOnce();
    expect(context.request.get).not.toHaveBeenCalled();
    expect(probe.snapshot().clientWrites).toBe(0);
  });
  it("cannot arm unsupported, repeated or unprepared destructive operations", async () => {
    expect(() => probe.arm("anything")).toThrow();
    expect(() => probe.arm("correct-conflict")).toThrow();
    expect(() => probe.arm("forget-lost")).toThrow();
    await saved();
    expect(() => probe.arm("add-read-error")).toThrow();
  });
});

describe("owned memory committed faults", () => {
  it("forwards one add and fails subsequent reads, never the committed response", async () => {
    await saved();
    const r = route(`/rest/v1/food_signals?user_id=eq.${fixture.userId}`, null, { method: "GET" });
    await probe.handler(r);
    await probe.waitReadFault();
    expect(r.fulfill.mock.calls[0][0].status).toBe(400);
    expect(r.fetch).not.toHaveBeenCalled();
    probe.fault("food_signals", false);
    const retry = route(`/rest/v1/food_signals?user_id=eq.${fixture.userId}`, null, {
      method: "GET",
    });
    await probe.handler(retry);
    expect(retry.fallback).toHaveBeenCalledOnce();
    expect(probe.snapshot()).toMatchObject({
      clientWrites: 1,
      commits: 1,
      rpcRequests: 1,
      readFaults: 1,
      fixtureErrors: 0,
    });
  });
  it("commits one server correction then forwards the unchanged stale client revision", async () => {
    const { id, r } = await corrected();
    expect(r.fetch.mock.calls[0][0]).toMatchObject({
      postData: { _action: "correct", _id: id, _revision: 1, _entry: entry(labels.server) },
      maxRetries: 0,
      maxRedirects: 0,
    });
    expect(r.fetch.mock.calls[1][0].postData).toBeUndefined();
    expect(r.fulfill.mock.calls[0][0].response.status()).toBe(409);
    expect(probe.snapshot()).toMatchObject({
      clientWrites: 2,
      rpcRequests: 3,
      commits: 2,
      injectedEdits: 1,
      inspectionReads: 1,
      fixtureErrors: 0,
    });
    const inspection = context.request.get.mock.calls.find(([url]) =>
      url.includes("/rest/v1/food_signals"),
    );
    const url = new URL(inspection[0]);
    expect(url.searchParams.get("source_key")).toBe("eq.statement:" + id);
    expect(url.searchParams.get("user_id")).toBe("eq." + fixture.userId);
    expect(url.searchParams.get("limit")).toBe("2");
  });
  it("aborts only after the exact server-generated correction was forgotten", async () => {
    const { server } = await corrected();
    probe.arm("forget-lost");
    const r = route(rpc, { _action: "forget", _id: server, _revision: 1, _entry: null });
    await probe.handler(r);
    expect(r.fetch).toHaveBeenCalledOnce();
    expect(r.abort).toHaveBeenCalledExactlyOnceWith("failed");
    expect(probe.snapshot()).toMatchObject({
      clientWrites: 3,
      rpcRequests: 4,
      commits: 3,
      fixtureErrors: 0,
    });
  });
  it("does not accept an unrelated signal for forgetting", async () => {
    await corrected();
    probe.arm("forget-lost");
    const r = route(rpc, { _action: "forget", _id: randomUUID(), _revision: 1, _entry: null });
    await probe.handler(r);
    expect(r.fetch).not.toHaveBeenCalled();
    expect(probe.snapshot().fixtureErrors).toBe(1);
  });
  it("resets only with an exact fixture request, then loses the committed reply", async () => {
    probe.arm("reset-lost");
    const r = route(rpc, { _action: "reset", _id: randomUUID(), _revision: 0, _entry: null });
    await probe.handler(r);
    expect(r.abort).toHaveBeenCalledExactlyOnceWith("failed");
    expect(probe.snapshot()).toMatchObject({
      clientWrites: 1,
      rpcRequests: 1,
      commits: 1,
      fixtureErrors: 0,
    });
    expect(() => probe.arm("reset-lost")).toThrow();
  });
  it("does not classify an unsuccessful RPC as committed", async () => {
    probe.arm("reset-lost");
    const r = route(rpc, { _action: "reset", _id: randomUUID(), _revision: 0, _entry: null });
    r.fetch.mockResolvedValue(response({}, 500));
    await probe.handler(r);
    expect(probe.snapshot()).toMatchObject({ commits: 0, fixtureErrors: 1 });
    expect(r.fulfill).not.toHaveBeenCalled();
  });
  it("cannot inspect or forget before an exact normal server correction", async () => {
    await expect(probe.inspectServerCorrection()).rejects.toThrow();
    expect(context.request.get).not.toHaveBeenCalled();
  });
});

describe("owned memory late account replies", () => {
  it("requires a committed hold and a verified distinct fixture before switching", async () => {
    expect(() => probe.beginAccountSwitch(manifest(), {})).toThrow();
    const held = await hold();
    try {
      expect(() => probe.beginAccountSwitch(fixture, {})).toThrow();
      expect(() =>
        probe.beginAccountSwitch({ ...manifest(), email: "real@example.com" }, {}),
      ).toThrow();
      expect(() => probe.beginAccountSwitch(manifest(), null)).toThrow();
    } finally {
      await probe.close();
      await held.pending;
    }
  });
  it("releases only after the original memory document reads as the server-verified peer", async () => {
    const held = await hold(),
      peer = manifest(),
      page = {};
    try {
      probe.beginAccountSwitch(peer, page);
      expect(() => probe.completeAccountSwitch()).toThrow();
      expect(() => probe.release()).toThrow();
      await peerRead(peer, {});
      expect(() => probe.completeAccountSwitch()).toThrow();
      await peerRead(peer, page);
      probe.completeAccountSwitch();
      expect(held.r.fulfill).not.toHaveBeenCalled();
      probe.release();
      await probe.waitReleased();
      await held.pending;
      expect(probe.snapshot()).toMatchObject({
        clientWrites: 1,
        commits: 1,
        accountSwitches: 1,
        peerReadRequests: 1,
        peerMemoryReads: 1,
        releasedReplies: 1,
        fixtureErrors: 0,
      });
    } finally {
      await probe.close();
    }
  });
  it("distinguishes a verified kitchen read from successful memory-panel loading", async () => {
    const held = await hold(),
      peer = manifest(),
      page = {};
    try {
      probe.beginAccountSwitch(peer, page);
      await peerRead(peer, page, "kitchen_recipes");
      probe.completeAccountSwitch();
      probe.release();
      await held.pending;
      expect(probe.snapshot()).toMatchObject({ peerReadRequests: 1, peerMemoryReads: 0 });
    } finally {
      await probe.close();
    }
  });
  it("blocks any further mutation as soon as account switching begins", async () => {
    const held = await hold();
    try {
      probe.beginAccountSwitch(manifest(), {});
      const r = route(rpc, add(labels.late));
      await probe.handler(r);
      expect(r.fetch).not.toHaveBeenCalled();
      expect(probe.snapshot()).toMatchObject({ blockedSwitchWrites: 1, clientWrites: 1 });
    } finally {
      await probe.close();
      await held.pending;
    }
  });
  it("blocks stale old-owner reads after the verified switch", async () => {
    const held = await hold(),
      peer = manifest(),
      page = {};
    try {
      probe.beginAccountSwitch(peer, page);
      await peerRead(peer, page);
      probe.completeAccountSwitch();
      const r = route(`/rest/v1/food_signals?user_id=eq.${fixture.userId}`, null, {
        method: "GET",
        page,
      });
      await probe.handler(r);
      expect(r.fallback).not.toHaveBeenCalled();
      expect(probe.snapshot().blockedStaleReads).toBe(1);
    } finally {
      await probe.close();
      await held.pending;
    }
  });
  it("accepts canceled old-page delivery only with an actual request failure", async () => {
    probe.arm("add-late");
    const r = route(rpc, add(labels.late), { cancelled: true });
    r.fulfill.mockRejectedValue(Error("synthetic_delivery_cancelled"));
    const pending = probe.handler(r);
    await probe.waitHeld();
    probe.release();
    await pending;
    expect(probe.snapshot().fixtureErrors).toBe(0);
    await probe.close();
  });
  it("never hides an unexplained fulfillment error", async () => {
    probe.arm("add-late");
    const r = route(rpc, add(labels.late));
    r.fulfill.mockRejectedValue(Error("synthetic_delivery_failure"));
    const pending = probe.handler(r);
    await probe.waitHeld();
    probe.release();
    await pending;
    expect(probe.snapshot().fixtureErrors).toBe(1);
    await probe.close();
  });
  it("tests three foreign tables with the verified peer JWT rather than admin access", async () => {
    const held = await hold(),
      peer = manifest(),
      page = {};
    try {
      probe.beginAccountSwitch(peer, page);
      await peerRead(peer, page);
      probe.completeAccountSwitch();
      context.request.get.mockImplementation(async (url) =>
        response(new URL(url).pathname === "/auth/v1/user" ? user : []),
      );
      await probe.assertForeignReads();
      const reads = context.request.get.mock.calls.filter(([url]) => url.includes("/rest/v1/"));
      expect(reads).toHaveLength(3);
      expect(
        reads.every(
          ([url, options]) =>
            new URL(url).searchParams.get("user_id") === "eq." + fixture.userId &&
            options.maxRetries === 0,
        ),
      ).toBe(true);
    } finally {
      await probe.close();
      await held.pending;
    }
  });
});

describe("owned memory route lifetime", () => {
  it("does not accept a response that fails the guard during teardown", async () => {
    let resolve;
    context.request.get.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const read = route(`/rest/v1/food_signals?user_id=eq.${fixture.userId}`, null, {
      method: "GET",
    });
    const result = withOwnedMemoryProbe({ context, fixture }, async (current) => {
      void current.handler(read);
      return { completed: true };
    });
    const failure = expect(result).rejects.toThrow("owned_memory_fixture_failed");
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    expect(resolve).toBeTypeOf("function");
    await Promise.resolve();
    resolve(response(user));
    await failure;
    expect(read.fallback).not.toHaveBeenCalled();
    expect(context.unroute).toHaveBeenCalledTimes(8);
  });
  it("unregisters every installed route even after one unregister fails", async () => {
    context.unroute.mockRejectedValueOnce(Error("synthetic_cleanup_failure"));
    await expect(withOwnedMemoryProbe({ context, fixture }, async () => true)).rejects.toThrow(
      "owned_memory_route_cleanup_failed",
    );
    expect(context.route).toHaveBeenCalledTimes(8);
    expect(context.unroute).toHaveBeenCalledTimes(8);
  });
  it("removes only successfully registered patterns when setup is partial", async () => {
    context.route.mockResolvedValueOnce().mockRejectedValueOnce(Error("synthetic_setup_failure"));
    const run = vi.fn();
    await expect(withOwnedMemoryProbe({ context, fixture }, run)).rejects.toThrow(
      "synthetic_setup_failure",
    );
    expect(run).not.toHaveBeenCalled();
    expect(context.unroute).toHaveBeenCalledTimes(1);
  });
  it("releases its held reply during cleanup without forwarding new operations", async () => {
    const held = await hold();
    await probe.close();
    await held.pending;
    expect(held.r.fulfill).toHaveBeenCalledOnce();
    expect(() => probe.arm("reset-lost")).toThrow();
    const r = route(rpc, add());
    await probe.handler(r);
    expect(r.fetch).not.toHaveBeenCalled();
  });
  it("bounds arrival waits and clears their timers", async () => {
    vi.useFakeTimers();
    try {
      const wait = expect(boundedMemoryProbe(new Promise(() => {}), 50)).rejects.toThrow(
        "owned_memory_probe_timeout",
      );
      await vi.advanceTimersByTimeAsync(50);
      await wait;
      await expect(boundedMemoryProbe(Promise.resolve(true), 50)).resolves.toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
