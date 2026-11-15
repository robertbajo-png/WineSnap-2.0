import assert from "node:assert/strict";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { assertFixtureOwner, validateBrowserFixture } from "./owned-browser-fixture.mjs";

export const ownedMemoryLabels = Object.freeze({
  saved: "local qa coriander",
  draft: "local qa memory draft",
  server: "local qa memory server",
  late: "local qa memory late",
});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const memoryTables = new Set(["food_signals", "food_memory_state", "cooking_feedback"]);
const tables = new Set([
  ...memoryTables,
  "kitchen_recipes",
  "kitchen_recipe_versions",
  "cooking_sessions",
]);
const rpc = "rpc/food_memory_change";
const patterns = [
  ...[...tables].map((table) => ownedApi + "/rest/v1/" + table + "*"),
  ownedApi + "/rest/v1/" + rpc + "*",
  ownedApp + "/api/chef*",
];
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
export async function boundedMemoryProbe(promise, ms = 30000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("owned_memory_probe_timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Private fixture wrapper only. Credentials stay in this closure; all writes use normal RLS.
export function createOwnedMemoryProbe(context, fixture) {
  validateBrowserFixture(fixture);
  const result = {
    clientWrites: 0,
    rpcRequests: 0,
    commits: 0,
    injectedEdits: 0,
    readFaults: 0,
    inspectionReads: 0,
    authChecks: 0,
    fixtureErrors: 0,
    accountSwitches: 0,
    peerReadRequests: 0,
    peerMemoryReads: 0,
    releasedReplies: 0,
    blockedSwitchWrites: 0,
    blockedStaleReads: 0,
    unexpectedAi: 0,
  };
  const seen = new Set();
  const faultTables = new Set();
  const armed = new Set();
  const pending = new Set();
  let readFaultArrival = deferred();
  let mode = "",
    target = "",
    serverId = "",
    held = null,
    failed = false,
    closed = false,
    headers = null,
    peer = null,
    expectedPage = null,
    peerRead = false,
    switched = false;
  async function verify(request) {
    let response;
    try {
      assert.equal(closed, false);
      const h = request.headers();
      assert.ok(
        typeof h.authorization === "string" &&
          h.authorization.startsWith("Bearer ") &&
          h.authorization.length <= 8192,
      );
      assert.ok(typeof h.apikey === "string" && h.apikey.length > 0 && h.apikey.length <= 8192);
      response = await context.request.get(ownedApi + "/auth/v1/user", {
        headers: { authorization: h.authorization, apikey: h.apikey },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 15000,
      });
      assert.equal(response.status(), 200);
      const user = await response.json();
      const reader = user?.id === fixture.userId && !switched ? fixture : peer;
      assert.ok(reader);
      assertFixtureOwner(user, reader);
      assert.equal(closed, false);
      headers = { authorization: h.authorization, apikey: h.apikey };
      result.authChecks++;
      return reader;
    } finally {
      await response?.dispose?.();
    }
  }
  function freshId(id) {
    assert.match(id, uuid);
    assert.ok(!Object.values(fixture).includes(id) && !seen.has(id));
    seen.add(id);
    return id;
  }
  const entry = (value) => ({ attribute: "ingredient", value, direction: 1 });
  async function forward(route, override) {
    result.rpcRequests++;
    assert.ok(result.rpcRequests <= 8);
    return route.fetch({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
      ...(override ? { postData: override } : {}),
    });
  }
  function committed(response) {
    assert.ok([200, 204].includes(response.status()));
    result.commits++;
    assert.ok(result.commits <= 7);
  }
  const handle = async (route) => {
    let holding;
    try {
      assert.equal(failed, false);
      assert.equal(closed, false);
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin === ownedApp) {
        result.unexpectedAi++;
        throw Error("owned_memory_ai_blocked");
      }
      assert.equal(url.origin, ownedApi);
      assert.ok(url.pathname.startsWith("/rest/v1/"));
      const table = url.pathname.slice("/rest/v1/".length);
      assert.ok(tables.has(table) || table === rpc);
      if (request.method() === "OPTIONS") return await route.fallback();
      if (peer && request.method() !== "GET") {
        result.blockedSwitchWrites++;
        throw Error("owned_memory_switch_write_blocked");
      }
      if (switched && url.searchParams.get("user_id") === "eq." + fixture.userId) {
        result.blockedStaleReads++;
        throw Error("owned_memory_stale_read_blocked");
      }
      const reader = await verify(request);
      if (request.method() === "GET") {
        assert.ok(tables.has(table));
        assert.equal(url.searchParams.get("user_id"), "eq." + reader.userId);
        if (reader === peer && request.frame().page() === expectedPage) {
          peerRead = true;
          result.peerReadRequests++;
          if (table === "food_signals" || table === "food_memory_state") result.peerMemoryReads++;
        }
        if (faultTables.has(table)) {
          result.readFaults++;
          readFaultArrival.resolve();
          assert.ok(result.readFaults <= 32);
          return await route.fulfill({
            status: 400,
            contentType: "application/json",
            headers: { "access-control-allow-origin": ownedApp },
            body: JSON.stringify({ code: "synthetic_memory_read_failure" }),
          });
        }
        return await route.fallback();
      }
      assert.equal(request.method(), "POST");
      assert.equal(reader, fixture);
      assert.equal(table, rpc);
      assert.equal(url.search, "");
      assert.notEqual(mode, "");
      const step = mode,
        body = request.postDataJSON();
      const adding = step === "add-read-error" || step === "add-late";
      const id =
        adding || step === "reset-lost"
          ? freshId(body._id)
          : step === "correct-conflict"
            ? target
            : serverId;
      assert.match(id, uuid);
      assert.deepEqual(body, {
        _action: adding
          ? "add"
          : step === "correct-conflict"
            ? "correct"
            : step === "forget-lost"
              ? "forget"
              : "reset",
        _id: id,
        _revision: adding || step === "reset-lost" ? 0 : 1,
        _entry: adding
          ? entry(step === "add-late" ? ownedMemoryLabels.late : ownedMemoryLabels.saved)
          : step === "correct-conflict"
            ? entry(ownedMemoryLabels.draft)
            : null,
      });
      mode = "";
      result.clientWrites++;
      assert.ok(result.clientWrites <= 6);
      if (step === "add-late") {
        holding = held;
        holding.started = true;
      }
      if (step === "correct-conflict") {
        committed(await forward(route, { ...body, _entry: entry(ownedMemoryLabels.server) }));
        result.injectedEdits++;
        const rejected = await forward(route);
        assert.equal(rejected.status(), 409);
        return await route.fulfill({ response: rejected });
      }
      const response = await forward(route);
      committed(response);
      if (step === "add-read-error") {
        target = id;
        faultTables.add("food_signals");
      }
      if (holding) {
        holding.committed = true;
        holding.arrived.resolve();
        await holding.release.promise;
      }
      if (["forget-lost", "reset-lost"].includes(step)) return await route.abort("failed");
      try {
        await route.fulfill({ response });
      } catch {
        assert.ok(holding && request.failure());
      }
    } catch {
      failed = true;
      result.fixtureErrors++;
      await route.abort().catch(() => {});
    } finally {
      holding?.done.resolve();
    }
  };
  const handler = (route) => {
    const operation = handle(route);
    pending.add(operation);
    operation.finally(() => pending.delete(operation));
    return operation;
  };
  return {
    handler,
    snapshot: () => ({ ...result }),
    arm(step) {
      assert.ok(!failed && !closed && !peer && mode === "");
      assert.ok(
        ["add-read-error", "correct-conflict", "forget-lost", "reset-lost", "add-late"].includes(
          step,
        ),
      );
      assert.equal(armed.has(step), false);
      if (step === "correct-conflict") assert.match(target, uuid);
      if (step === "forget-lost") assert.match(serverId, uuid);
      if (step === "add-late") {
        assert.equal(held, null);
        held = {
          arrived: deferred(),
          release: deferred(),
          done: deferred(),
          started: false,
          committed: false,
          released: false,
        };
      }
      mode = step;
      armed.add(step);
    },
    fault(table, enabled) {
      assert.ok(!failed && !closed && memoryTables.has(table));
      assert.equal(typeof enabled, "boolean");
      if (enabled) {
        faultTables.add(table);
        readFaultArrival = deferred();
      } else faultTables.delete(table);
    },
    waitReadFault: () => boundedMemoryProbe(readFaultArrival.promise),
    async inspectServerCorrection() {
      assert.ok(!failed && !closed && !peer && headers && result.injectedEdits === 1);
      assert.equal(await verify({ headers: () => headers }), fixture);
      const url = new URL(ownedApi + "/rest/v1/food_signals");
      for (const [key, value] of Object.entries({
        select: "id,user_id,value,revision,status,source_kind,source_key",
        user_id: "eq." + fixture.userId,
        value: "eq." + ownedMemoryLabels.server,
        source_key: "eq.statement:" + target,
        limit: "2",
      }))
        url.searchParams.set(key, value);
      const response = await context.request.get(url.href, {
        headers,
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 15000,
      });
      try {
        assert.equal(closed, false);
        assert.equal(response.status(), 200);
        const rows = await response.json();
        assert.ok(Array.isArray(rows) && rows.length === 1);
        const row = rows[0];
        assert.match(row.id, uuid);
        assert.ok(!seen.has(row.id) && !Object.values(fixture).includes(row.id));
        assert.deepEqual(row, {
          id: row.id,
          user_id: fixture.userId,
          value: ownedMemoryLabels.server,
          revision: 1,
          status: "confirmed",
          source_kind: "correction",
          source_key: "statement:" + target,
        });
        serverId = row.id;
        seen.add(serverId);
        result.inspectionReads++;
      } finally {
        await response.dispose();
      }
    },
    waitHeld() {
      assert.ok(held);
      return boundedMemoryProbe(held.arrived.promise);
    },
    beginAccountSwitch(other, page) {
      validateBrowserFixture(other);
      assert.ok(!failed && !closed && !peer && mode === "");
      assert.notEqual(other.userId, fixture.userId);
      assert.notEqual(other.run, fixture.run);
      assert.ok(page && typeof page === "object" && held?.committed && !held.released);
      peer = other;
      expectedPage = page;
      result.accountSwitches++;
    },
    completeAccountSwitch() {
      assert.ok(
        !failed && !closed && peer && peerRead && !switched && held?.committed && !held.released,
      );
      switched = true;
    },
    release() {
      assert.ok(held && !closed && (!peer || switched));
      if (!held.released) result.releasedReplies++;
      held.released = true;
      held.release.resolve();
    },
    waitReleased() {
      assert.ok(held);
      return boundedMemoryProbe(held.done.promise);
    },
    async assertForeignReads() {
      assert.ok(!failed && !closed && switched && peer && headers);
      assert.equal(await verify({ headers: () => headers }), peer);
      for (const table of ["food_signals", "food_memory_state", "chef_conversations"]) {
        const url = new URL(ownedApi + "/rest/v1/" + table);
        url.searchParams.set("select", "user_id");
        url.searchParams.set("user_id", "eq." + fixture.userId);
        const response = await context.request.get(url.href, {
          headers,
          maxRedirects: 0,
          maxRetries: 0,
          timeout: 15000,
        });
        try {
          assert.equal(closed, false);
          assert.equal(response.status(), 200);
          const rows = await response.json();
          assert.ok(Array.isArray(rows) && rows.length === 0);
        } finally {
          await response.dispose();
        }
      }
    },
    async close() {
      closed = true;
      headers = null;
      held?.release.resolve();
      await boundedMemoryProbe(Promise.all([...pending]));
    },
  };
}

export async function withOwnedMemoryProbe({ context, fixture }, run) {
  const probe = createOwnedMemoryProbe(context, fixture),
    registered = [];
  let value;
  try {
    for (const pattern of patterns) {
      await context.route(pattern, probe.handler);
      registered.push(pattern);
    }
    value = await run(probe);
  } finally {
    let failed = false;
    try {
      await probe.close();
    } catch {
      failed = true;
    }
    for (const pattern of registered) {
      try {
        await context.unroute(pattern, probe.handler);
      } catch {
        failed = true;
      }
    }
    if (failed) throw Error("owned_memory_route_cleanup_failed");
  }
  assert.equal(probe.snapshot().fixtureErrors, 0, "owned_memory_fixture_failed");
  return value;
}
