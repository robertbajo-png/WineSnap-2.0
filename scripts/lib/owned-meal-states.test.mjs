import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { ownedMealSessionId } from "./owned-browser-fixture.mjs";
import {
  acceptOwnedMealStates,
  acceptOwnedMealPeerIsolation,
  createOwnedMealProbe,
  withOwnedMealProbe,
} from "./owned-meal-states.mjs";

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
let fixture, context, user, probe;
const bodyHousehold = (id) => ({
  _action: "create_household",
  _id: id,
  _revision: 0,
  _data: { name: "Local QA household", displayName: "Local QA owner", adultConfirmed: true },
});
const bodyMeal = (id, revision = 0, note = "Local QA meal") => ({
  _id: id,
  _revision: revision,
  _input: {
    sessionId: ownedMealSessionId(fixture),
    wineId: fixture.wineId,
    wineRating: 4,
    pairingRating: 3,
    note,
  },
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
      failure: () => (options.cancelled ? { errorText: "net::ERR_ABORTED" } : null),
      frame: () => ({ page: () => options.page }),
    }),
    fetch: vi.fn().mockResolvedValue(response(null, 204)),
    fulfill: vi.fn().mockResolvedValue(),
    abort: vi.fn().mockResolvedValue(),
    fallback: vi.fn().mockResolvedValue(),
  };
}
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
  probe = createOwnedMealProbe(context, fixture);
});

describe("owned meal late writes across accounts", () => {
  const profileBody = () => ({
    _action: "save_diner",
    _id: randomUUID(),
    _revision: 0,
    _data: {
      document: { name: "Local QA account profile", kind: "adult", preferences: [] },
      householdId: null,
      shared: false,
    },
  });
  async function holdPair() {
    probe.arm("profile-account-late");
    const profile = route("/rest/v1/rpc/kitchen_family_change", profileBody());
    const first = probe.handler(profile);
    await probe.waitHeld();
    probe.arm("meal-account-late");
    const meal = route(
      "/rest/v1/rpc/kitchen_meal_save",
      bodyMeal(randomUUID(), 2, "Local QA account meal"),
    );
    const second = probe.handler(meal);
    await probe.waitHeld();
    return { profile, meal, first, second };
  }
  async function enterPeer(peer, pages) {
    user = { id: peer.userId, email: peer.email, app_metadata: { owned_browser_run: peer.run } };
    for (const page of pages) {
      const read = route("/rest/v1/kitchen_diners", null, { method: "GET", page });
      await probe.handler(read);
      expect(read.fallback).toHaveBeenCalledOnce();
    }
  }
  it("cannot begin a switch before two exact fixture commits", async () => {
    expect(() => probe.beginAccountSwitch(manifest(), [{}, {}])).toThrow();
    expect(context.request.get).not.toHaveBeenCalled();
    expect(probe.snapshot().accountSwitches).toBe(0);
  });
  it("rejects duplicate or unvalidated fixture/page declarations", async () => {
    const held = await holdPair();
    try {
      expect(() => probe.beginAccountSwitch(fixture, [{}, {}])).toThrow();
      expect(() =>
        probe.beginAccountSwitch({ ...manifest(), email: "real@example.com" }, [{}, {}]),
      ).toThrow();
      expect(() => probe.beginAccountSwitch(manifest(), [{}])).toThrow();
      const page = {};
      expect(() => probe.beginAccountSwitch(manifest(), [page, page])).toThrow();
      expect(probe.snapshot().accountSwitches).toBe(0);
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("does not treat the prior view-only holds as an account-switch pair", async () => {
    const pending = [];
    try {
      for (let index = 0; index < 2; index++) {
        probe.arm("profile-late");
        const body = profileBody();
        body._data.document.name = "Local QA late profile";
        pending.push(probe.handler(route("/rest/v1/rpc/kitchen_family_change", body)));
        await probe.waitHeld();
      }
      expect(() => probe.beginAccountSwitch(manifest(), [{}, {}])).toThrow();
    } finally {
      await probe.close();
      for (const result of pending) await result;
    }
  });
  it("holds both committed replies until both mounted pages read as the verified peer", async () => {
    const held = await holdPair();
    const pages = [{}, {}],
      peer = manifest();
    try {
      probe.beginAccountSwitch(peer, pages);
      expect(() => probe.completeAccountSwitch()).toThrow();
      await enterPeer(peer, [pages[0]]);
      expect(() => probe.completeAccountSwitch()).toThrow();
      await enterPeer(peer, [pages[1]]);
      probe.completeAccountSwitch();
      expect(held.profile.fulfill).not.toHaveBeenCalled();
      expect(held.meal.fulfill).not.toHaveBeenCalled();
      expect(() => probe.arm("child")).toThrow();
      expect(() => probe.completeAccountSwitch()).toThrow();
      probe.release();
      await probe.waitReleased();
      expect(held.profile.fulfill).toHaveBeenCalledOnce();
      expect(held.meal.fulfill).toHaveBeenCalledOnce();
      expect(probe.snapshot()).toMatchObject({
        clientWriteRequests: 2,
        forwardedRpcRequests: 2,
        committedWrites: 2,
        peerReadRequests: 2,
        accountSwitches: 1,
        releasedReplies: 2,
        fixtureErrors: 0,
      });
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("does not accept a peer read from the control tab as proof for both original pages", async () => {
    const held = await holdPair();
    try {
      const pages = [{}, {}],
        peer = manifest();
      probe.beginAccountSwitch(peer, pages);
      await enterPeer(peer, [{}]);
      expect(() => probe.completeAccountSwitch()).toThrow();
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("rejects a third account and never forwards its read", async () => {
    const held = await holdPair();
    try {
      probe.beginAccountSwitch(manifest(), [{}, {}]);
      user = { ...user, id: randomUUID() };
      const read = route("/rest/v1/kitchen_diners", null, { method: "GET", page: {} });
      await probe.handler(read);
      expect(read.fallback).not.toHaveBeenCalled();
      expect(probe.snapshot().fixtureErrors).toBe(1);
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("rejects all additional writes during the account transition", async () => {
    const held = await holdPair();
    try {
      const peer = manifest();
      probe.beginAccountSwitch(peer, [{}, {}]);
      user = { id: peer.userId, email: peer.email, app_metadata: { owned_browser_run: peer.run } };
      const checks = context.request.get.mock.calls.length;
      const write = route("/rest/v1/rpc/kitchen_family_change", profileBody());
      await probe.handler(write);
      expect(write.fetch).not.toHaveBeenCalled();
      expect(context.request.get).toHaveBeenCalledTimes(checks);
      expect(probe.snapshot().blockedSwitchWrites).toBe(1);
      expect(probe.snapshot().committedWrites).toBe(2);
      expect(probe.snapshot().fixtureErrors).toBe(1);
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("rejects an old-owner read after the peer switch instead of forwarding stale reconciliation", async () => {
    const held = await holdPair();
    try {
      const peer = manifest(),
        pages = [{}, {}],
        previous = user;
      probe.beginAccountSwitch(peer, pages);
      await enterPeer(peer, pages);
      probe.completeAccountSwitch();
      user = previous;
      const read = route("/rest/v1/kitchen_diners", null, { method: "GET", page: pages[0] });
      await probe.handler(read);
      expect(read.fallback).not.toHaveBeenCalled();
      expect(probe.snapshot().fixtureErrors).toBe(1);
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("binds post-switch foreign reads to the peer JWT, not the original fixture", async () => {
    const held = await holdPair();
    try {
      const peer = manifest(),
        pages = [{}, {}];
      probe.beginAccountSwitch(peer, pages);
      await enterPeer(peer, pages);
      probe.completeAccountSwitch();
      context.request.get.mockImplementation(async (url) =>
        response(url.endsWith("/auth/v1/user") ? user : []),
      );
      await expect(probe.assertForeignReads(fixture)).resolves.toBeUndefined();
      const reads = context.request.get.mock.calls.filter(
        ([url]) => !url.endsWith("/auth/v1/user"),
      );
      expect(reads).toHaveLength(3);
      for (const [url] of reads)
        expect(new URL(url).searchParams.get("user_id")).toBe("eq." + fixture.userId);
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it("counts and blocks an old-owner reconciliation before asynchronous Auth can hide the attempt", async () => {
    const held = await holdPair();
    try {
      const peer = manifest(),
        pages = [{}, {}];
      probe.beginAccountSwitch(peer, pages);
      await enterPeer(peer, pages);
      probe.completeAccountSwitch();
      const checks = context.request.get.mock.calls.length;
      const read = route("/rest/v1/meal_wine_links?user_id=eq." + fixture.userId, null, {
        method: "GET",
        page: pages[1],
      });
      await probe.handler(read);
      expect(context.request.get).toHaveBeenCalledTimes(checks);
      expect(read.fallback).not.toHaveBeenCalled();
      expect(probe.snapshot()).toMatchObject({ blockedStaleReads: 1, fixtureErrors: 1 });
    } finally {
      await probe.close();
      await held.first;
      await held.second;
    }
  });
  it.each([1, 3])("rejects an unexpected meal revision %i before committing", async (revision) => {
    probe.arm("meal-account-late");
    const request = route(
      "/rest/v1/rpc/kitchen_meal_save",
      bodyMeal(randomUUID(), revision, "Local QA account meal"),
    );
    await probe.handler(request);
    expect(request.fetch).not.toHaveBeenCalled();
    expect(probe.snapshot().committedWrites).toBe(0);
    await probe.close();
  });
  it("releases both held replies on failure cleanup without another write", async () => {
    const held = await holdPair();
    await probe.close();
    await held.first;
    await held.second;
    expect(held.profile.fulfill).toHaveBeenCalledOnce();
    expect(held.meal.fulfill).toHaveBeenCalledOnce();
    expect(probe.snapshot()).toMatchObject({ forwardedRpcRequests: 2, committedWrites: 2 });
    await expect(probe.assertForeignReads(manifest())).rejects.toThrow();
  });
});
describe("owned meal probe identity and forwarding", () => {
  it("rejects a real or foreign manifest before page, file or network activity", async () => {
    expect(() => createOwnedMealProbe(context, { userId: "real-owner" })).toThrow();
    const prepare = vi.fn();
    await expect(
      acceptOwnedMealStates({ fixture: { userId: "real-owner" }, prepare }),
    ).rejects.toThrow();
    await expect(
      acceptOwnedMealStates({
        fixture,
        page: { url: () => "https://unapproved.example.invalid" },
        prepare,
      }),
    ).rejects.toThrow();
    expect(prepare).not.toHaveBeenCalled();
    expect(context.request.get).not.toHaveBeenCalled();
  });
  it.each(["id", "email", "app_metadata"])(
    "refuses a wrong server-verified %s before forwarding",
    async (key) => {
      user = {
        ...user,
        [key]: key === "app_metadata" ? {} : "foreign",
        user_metadata: { owned_browser_run: fixture.run },
      };
      probe.arm("household-lost");
      const request = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(randomUUID()));
      await probe.handler(request);
      expect(request.fetch).not.toHaveBeenCalled();
      expect(request.abort).toHaveBeenCalledOnce();
      expect(probe.snapshot().fixtureErrors).toBe(1);
    },
  );
  it("binds verification to the fixed local Auth URL and disables redirects/retries", async () => {
    const request = route("/rest/v1/kitchen_diners", undefined, { method: "GET" });
    await probe.handler(request);
    expect(context.request.get).toHaveBeenCalledWith(
      ownedApi + "/auth/v1/user",
      expect.objectContaining({
        timeout: 15000,
        maxRedirects: 0,
        maxRetries: 0,
      }),
    );
    expect(request.fallback).toHaveBeenCalledOnce();
    expect(probe.snapshot()).not.toHaveProperty("headers");
    expect(JSON.stringify(probe.snapshot())).not.toMatch(/Bearer|synthetic-public/);
  });
  it.each([302, 401, 403, 500])("does not forward when Auth returns %i", async (status) => {
    context.request.get.mockResolvedValue(response(user, status));
    probe.arm("household-lost");
    const request = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(randomUUID()));
    await probe.handler(request);
    expect(request.fetch).not.toHaveBeenCalled();
    expect(request.abort).toHaveBeenCalledOnce();
    expect(probe.snapshot()).toMatchObject({
      authChecks: 0,
      clientWriteRequests: 0,
      fixtureErrors: 1,
    });
  });
  it("does not retain or report an Auth transport error", async () => {
    context.request.get.mockRejectedValue(Error("synthetic-private-canary"));
    const request = route("/rest/v1/kitchen_diners", null, { method: "GET" });
    await probe.handler(request);
    expect(request.fallback).not.toHaveBeenCalled();
    expect(JSON.stringify(probe.snapshot())).not.toContain("synthetic-private-canary");
  });
  it.each([undefined, {}, { authorization: "not-bearer", apikey: "dummy" }])(
    "fails closed with incomplete request credentials: %j",
    async (headers) => {
      const request = route("/rest/v1/kitchen_diners", undefined, {
        method: "GET",
        headers: headers ?? {},
      });
      await probe.handler(request);
      expect(context.request.get).not.toHaveBeenCalled();
      expect(request.fallback).not.toHaveBeenCalled();
    },
  );
  it("rejects a nonlocal route before reading credentials", async () => {
    const request = route("/rest/v1/kitchen_diners", undefined, {
      method: "GET",
      origin: "https://unapproved.example.invalid",
    });
    await probe.handler(request);
    expect(context.request.get).not.toHaveBeenCalled();
    expect(request.fetch).not.toHaveBeenCalled();
  });
  it.each(["PATCH", "DELETE", "PUT"])(
    "blocks direct %s even for the fixture account",
    async (method) => {
      const request = route("/rest/v1/wines?user_id=eq." + fixture.userId, {}, { method });
      await probe.handler(request);
      expect(request.fetch).not.toHaveBeenCalled();
      expect(request.fallback).not.toHaveBeenCalled();
    },
  );
  it("blocks unarmed and unexpected kitchen RPCs", async () => {
    const request = route("/rest/v1/rpc/kitchen_save_session", { _id: fixture.sessionId });
    await probe.handler(request);
    expect(request.fetch).not.toHaveBeenCalled();
    expect(request.fallback).not.toHaveBeenCalled();
    expect(probe.snapshot().clientWriteRequests).toBe(0);
  });
  it("does not forward another owner's read filter", async () => {
    const request = route("/rest/v1/meal_wine_links?user_id=eq." + randomUUID(), null, {
      method: "GET",
    });
    await probe.handler(request);
    expect(request.fallback).not.toHaveBeenCalled();
    expect(request.abort).toHaveBeenCalledOnce();
  });
  it("never forwards arbitrary family data and stops after the first guard failure", async () => {
    probe.arm("household-lost");
    const bad = route("/rest/v1/rpc/kitchen_family_change", {
      ...bodyHousehold(randomUUID()),
      _action: "delete_household",
    });
    await probe.handler(bad);
    const good = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(randomUUID()));
    await probe.handler(good);
    expect(bad.fetch).not.toHaveBeenCalled();
    expect(good.fetch).not.toHaveBeenCalled();
  });
});
describe("owned meal controlled faults", () => {
  it("loses a committed household reply and only fails its exact-owner inspection", async () => {
    const id = randomUUID();
    probe.arm("household-lost");
    probe.fault("household-inspect", true);
    const write = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(id));
    await probe.handler(write);
    expect(write.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
    });
    expect(write.abort).toHaveBeenCalledExactlyOnceWith("failed");
    const read = route(
      `/rest/v1/kitchen_households?id=eq.${id}&user_id=eq.${fixture.userId}`,
      null,
      { method: "GET" },
    );
    await probe.handler(read);
    expect(read.fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    probe.fault("household-inspect", false);
    await probe.handler(read);
    expect(read.fallback).toHaveBeenCalledOnce();
    expect(probe.snapshot()).toMatchObject({
      clientWriteRequests: 1,
      committedWrites: 1,
      injectedReadErrors: 1,
      fixtureErrors: 0,
    });
  });
  it("refuses a second copy of a consumed scenario before another forward", async () => {
    probe.arm("household-lost");
    const request = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(randomUUID()));
    await probe.handler(request);
    await probe.handler(request);
    expect(request.fetch).toHaveBeenCalledOnce();
    expect(probe.snapshot().fixtureErrors).toBe(1);
  });
  it("holds a verified committed rename until explicitly released", async () => {
    const id = randomUUID();
    probe.arm("household-lost");
    await probe.handler(route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(id)));
    probe.arm("rename-late");
    const request = route("/rest/v1/rpc/kitchen_family_change", {
      _action: "rename_household",
      _id: id,
      _revision: 1,
      _data: { name: "Local QA renamed household" },
    });
    const pending = probe.handler(request);
    await probe.waitHeld();
    expect(request.fulfill).not.toHaveBeenCalled();
    probe.release();
    await probe.waitReleased();
    await pending;
    expect(request.fulfill).toHaveBeenCalledOnce();
    expect(probe.snapshot().fixtureErrors).toBe(0);
  });
  it("uses a real revision-guarded server edit before forwarding the stale meal request", async () => {
    const id = randomUUID();
    probe.arm("meal-lost");
    await probe.handler(route("/rest/v1/rpc/kitchen_meal_save", bodyMeal(id)));
    probe.arm("meal-conflict");
    const request = route("/rest/v1/rpc/kitchen_meal_save", bodyMeal(id, 1, "Local QA draft meal"));
    request.fetch
      .mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response({ code: "PT409" }, 409));
    await probe.handler(request);
    expect(request.fetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        postData: bodyMeal(id, 1, "Local QA server meal"),
        maxRedirects: 0,
      }),
    );
    expect(request.fetch).toHaveBeenNthCalledWith(2, {
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
    });
    expect(probe.snapshot()).toMatchObject({
      clientWriteRequests: 2,
      forwardedRpcRequests: 3,
      committedWrites: 2,
      injectedServerEdits: 1,
      fixtureErrors: 0,
    });
  });
  it("refuses a meal pointing to the live session or a foreign bottle", async () => {
    for (const changed of [{ sessionId: fixture.sessionId }, { wineId: randomUUID() }]) {
      const current = createOwnedMealProbe(context, fixture);
      current.arm("meal-lost");
      const body = bodyMeal(randomUUID());
      const request = route("/rest/v1/rpc/kitchen_meal_save", {
        ...body,
        _input: { ...body._input, ...changed },
      });
      await current.handler(request);
      expect(request.fetch).not.toHaveBeenCalled();
    }
  });
  it("rejects unknown scenario and fault names", () => {
    expect(() => probe.arm("unapproved")).toThrow();
    expect(() => probe.fault("foreign-table", true)).toThrow();
  });
  it("never counts an unsuccessful RPC response as a commit or a lost successful reply", async () => {
    probe.arm("household-lost");
    const request = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(randomUUID()));
    request.fetch.mockResolvedValue(response({ error: "denied" }, 403));
    await probe.handler(request);
    expect(request.fulfill).not.toHaveBeenCalled();
    expect(probe.snapshot()).toMatchObject({ committedWrites: 0, fixtureErrors: 1 });
  });
});
describe("owned meal route lifetime and peer checks", () => {
  it("does not install browser routes when completed-session preparation is incomplete", async () => {
    const prepare = vi.fn();
    prepare.mockResolvedValue({
      completed: true,
      mealSessionId: ownedMealSessionId(fixture),
      activeSessionUnchanged: false,
    });
    await expect(
      acceptOwnedMealStates({ page: { url: () => ownedApp }, context, fixture, prepare }),
    ).rejects.toThrow();
    expect(context.route).not.toHaveBeenCalled();
    expect(context.request.get).not.toHaveBeenCalled();
  });
  it("unregisters every installed route after a scenario fails", async () => {
    const page = { url: () => ownedApp + "/kitchen" };
    await expect(
      withOwnedMealProbe({ page, context, fixture }, async () => {
        throw Error("synthetic_failure");
      }),
    ).rejects.toThrow("synthetic_failure");
    expect(context.route).toHaveBeenCalledTimes(6);
    expect(context.unroute.mock.calls).toEqual(context.route.mock.calls);
  });
  it("also cleans a partially registered route set", async () => {
    context.route
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(Error("registration_failed"));
    const run = vi.fn();
    await expect(
      withOwnedMealProbe({ page: { url: () => ownedApp }, context, fixture }, run),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(context.unroute).toHaveBeenCalledTimes(2);
  });
  it("attempts all route removals even when one removal fails", async () => {
    context.unroute.mockRejectedValueOnce(Error("cleanup_failed"));
    await expect(
      withOwnedMealProbe({ page: { url: () => ownedApp }, context, fixture }, async () => {}),
    ).rejects.toThrow("owned_meal_route_cleanup_failed");
    expect(context.unroute).toHaveBeenCalledTimes(6);
  });
  it("checks three private tables with the peer's verified JWT, never an administrator", async () => {
    const other = manifest();
    await probe.handler(route("/rest/v1/kitchen_diners", null, { method: "GET" }));
    context.request.get.mockImplementation(async (url) =>
      response(url.endsWith("/auth/v1/user") ? user : []),
    );
    await probe.assertForeignReads(other);
    const reads = context.request.get.mock.calls.filter(([url]) => !url.endsWith("/auth/v1/user"));
    expect(reads).toHaveLength(3);
    for (const [url, options] of reads) {
      const target = new URL(url);
      expect(target.origin).toBe(ownedApi);
      expect(target.searchParams.get("user_id")).toBe("eq." + other.userId);
      expect(options).toMatchObject({ maxRedirects: 0, maxRetries: 0, timeout: 15000 });
    }
    await probe.close();
    await expect(probe.assertForeignReads(other)).rejects.toThrow();
  });
  it("does not accept leaked peer rows as successful isolation", async () => {
    await probe.handler(route("/rest/v1/kitchen_diners", null, { method: "GET" }));
    context.request.get.mockImplementation(async (url) =>
      response(url.endsWith("/auth/v1/user") ? user : [{ id: randomUUID() }]),
    );
    await expect(probe.assertForeignReads(manifest())).rejects.toThrow();
  });
  it("does not accept a non-array peer reply as successful isolation", async () => {
    await probe.handler(route("/rest/v1/kitchen_diners", null, { method: "GET" }));
    context.request.get.mockImplementation(async (url) =>
      response(url.endsWith("/auth/v1/user") ? user : { length: 0 }),
    );
    await expect(probe.assertForeignReads(manifest())).rejects.toThrow();
  });
  it("does not forward a write after closure during the identity check", async () => {
    let resolve;
    context.request.get.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    probe.arm("household-lost");
    const request = route("/rest/v1/rpc/kitchen_family_change", bodyHousehold(randomUUID()));
    const pending = probe.handler(request);
    await probe.close();
    resolve(response(user));
    await pending;
    expect(request.fetch).not.toHaveBeenCalled();
    expect(request.abort).toHaveBeenCalledOnce();
    expect(() => probe.arm("child")).toThrow();
  });
  it("retains all previous acceptance stages and enables cascade verification for both fixtures", () => {
    const source = readFileSync(new URL("./owned-pilot-browser.mjs", import.meta.url), "utf8");
    expect(source.indexOf("report.mealStates =")).toBeGreaterThan(
      source.indexOf("report.collectorStates ="),
    );
    expect(source.indexOf("report.mealStates =")).toBeLessThan(source.indexOf('phase("logout")'));
    expect(source).toContain('ownedBrowserFixture(keys, "meals", fixture)');
    expect(source).toContain("report.mealIsolation =");
    expect(source.match(/cleanupMeals: true/g)).toHaveLength(2);
    const helper = readFileSync(new URL("./owned-meal-states.mjs", import.meta.url), "utf8");
    expect(helper).not.toMatch(
      /storageState\(|launchPersistentContext|localStorage|cookies\(|console\.|createClient\(|service_role/,
    );
  });
});
