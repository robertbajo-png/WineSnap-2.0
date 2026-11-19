import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCoreKitchenFixture } from "./core-kitchen-browser.mjs";

const origin = "http://127.0.0.1:54323";
const base = "http://127.0.0.1:59999";
const key = "sb_publishable_runtime_check_not_a_real_key";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const peer = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
let fixture, report;
function route(
  path,
  { target = origin, method = "GET", user = "synthetic-owner", apiKey = key, body = {} } = {},
) {
  return {
    request: () => ({
      url: () => target + path,
      method: () => method,
      headers: () => ({ apikey: apiKey, authorization: user }),
      postDataJSON: () => body,
    }),
    continue: vi.fn(),
    abort: vi.fn(),
    fulfill: vi.fn(),
  };
}
beforeEach(() => {
  report = { mutations: 0, externalRequests: 0 };
  fixture = createCoreKitchenFixture({
    origin,
    base,
    key,
    owner,
    report,
    users: new Map([
      ["synthetic-owner", { id: owner }],
      ["synthetic-peer", { id: peer }],
    ]),
  });
});
describe("isolated kitchen fixture boundary", () => {
  const memoryBody = (id, value = "syntheticspice") => ({
    _action: "add",
    _id: id,
    _revision: 0,
    _entry: { attribute: "ingredient", value, direction: 1 },
  });
  it("does not permit an unarmed memory mutation even for the synthetic owner", async () => {
    const request = route("/rest/v1/rpc/food_memory_change", {
      method: "POST",
      body: memoryBody(crypto.randomUUID()),
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.memory.counts()).toEqual({ writeCount: 0, commits: 0 });
  });
  it("does not let another account use an armed memory scenario", async () => {
    fixture.memory.arm("add-read-error");
    const request = route("/rest/v1/rpc/food_memory_change", {
      method: "POST",
      user: "synthetic-peer",
      body: memoryBody(crypto.randomUUID()),
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.memory.counts().commits).toBe(0);
  });
  it("requires the exact bounded memory payload rather than arbitrary preferences or reset", async () => {
    fixture.memory.arm("add-read-error");
    const request = route("/rest/v1/rpc/food_memory_change", {
      method: "POST",
      body: { ...memoryBody(crypto.randomUUID()), _action: "reset" },
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(fixture.memory.counts().commits).toBe(0);
  });
  it("mocks one committed memory write and failed read without forwarding or allowing a duplicate", async () => {
    fixture.memory.arm("add-read-error");
    const id = crypto.randomUUID();
    const request = route("/rest/v1/rpc/food_memory_change", {
      method: "POST",
      body: memoryBody(id),
    });
    await fixture.route(request);
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.memory.counts()).toEqual({ writeCount: 1, commits: 1 });
    expect(fixture.failedTables.has("food_signals")).toBe(true);
    expect(fixture.memory.rows(owner).some((s) => s.id === id)).toBe(true);
    expect(fixture.memory.rows(peer)).toEqual([]);
    await expect(fixture.route(request)).rejects.toThrow();
    expect(fixture.memory.counts()).toEqual({ writeCount: 1, commits: 1 });
  });
  it("uses a newer revision only for the captured synthetic signal when injecting a conflict", async () => {
    const id = crypto.randomUUID();
    fixture.memory.arm("add-read-error");
    await fixture.route(
      route("/rest/v1/rpc/food_memory_change", { method: "POST", body: memoryBody(id) }),
    );
    fixture.memory.arm("correct-conflict");
    const request = route("/rest/v1/rpc/food_memory_change", {
      method: "POST",
      body: { ...memoryBody(id, "syntheticdraft"), _action: "correct", _revision: 1 },
    });
    await fixture.route(request);
    expect(request.fulfill.mock.calls[0][0].status).toBe(409);
    expect(fixture.memory.rows(owner).find((s) => s.id === id)).toMatchObject({
      revision: 2,
      value: "syntheticserver",
    });
    expect(fixture.memory.counts()).toEqual({ writeCount: 2, commits: 1 });
  });
  it("rejects an unapproved memory scenario without enabling a write", () => {
    expect(() => fixture.memory.arm("arbitrary-action")).toThrow();
    expect(fixture.memory.counts().commits).toBe(0);
  });
  it("only replaces wine stock through the known synthetic pairing modes", async () => {
    expect(() => fixture.changePairingWines("unapproved")).toThrow();
    fixture.changePairingWines("consumed-and-alternate");
    const request = route("/rest/v1/wines");
    await fixture.route(request);
    const rows = JSON.parse(request.fulfill.mock.calls[0][0].body);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(fixture.wineId);
    expect(rows[0].quantity).toBe(0);
    expect(rows[1].id).not.toBe(rows[0].id);
    expect(rows.every((r) => r.user_id === owner)).toBe(true);
    expect(request.continue).not.toHaveBeenCalled();
    const other = route("/rest/v1/wines", { user: "synthetic-peer" });
    await fixture.route(other);
    expect(JSON.parse(other.fulfill.mock.calls[0][0].body)).toEqual([]);
  });
  it("only permits known synthetic pairing profile changes", () => {
    expect(() => fixture.changePairingDiners("unapproved")).toThrow();
    expect(() => fixture.nextRead("unknown_table")).toThrow();
  });
  it("keeps reclassified synthetic profiles private to the fixture owner", async () => {
    fixture.changePairingDiners("adult-becomes-child");
    const owned = route("/rest/v1/kitchen_diners");
    await fixture.route(owned);
    const rows = JSON.parse(owned.fulfill.mock.calls[0][0].body);
    expect(rows[0].document.kind).toBe("child");
    expect(rows[0].revision).toBe(2);
    const other = route("/rest/v1/kitchen_diners", { user: "synthetic-peer" });
    await fixture.route(other);
    expect(JSON.parse(other.fulfill.mock.calls[0][0].body)).toEqual([]);
    expect(owned.continue).not.toHaveBeenCalled();
    expect(other.continue).not.toHaveBeenCalled();
  });
  it("observes a held read without forwarding it or releasing it early", async () => {
    const release = fixture.delay("kitchen_diners");
    const arrival = fixture.nextRead("kitchen_diners");
    const request = route("/rest/v1/kitchen_diners");
    const reading = fixture.route(request);
    await arrival;
    expect(request.fulfill).not.toHaveBeenCalled();
    release();
    await reading;
    expect(request.fulfill).toHaveBeenCalledOnce();
    expect(request.continue).not.toHaveBeenCalled();
  });
  it("keeps injected meal read errors inside the enabled synthetic scenario", async () => {
    fixture.beginMealChecks();
    fixture.failedTables.add("meal_wine_links");
    const request = route("/rest/v1/meal_wine_links");
    await fixture.route(request);
    expect(request.fulfill.mock.calls[0][0].status).toBe(400);
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.counts().writeCount).toBe(0);
  });
  it("rejects an arbitrary rename even when the exact synthetic rename is armed", async () => {
    fixture.beginMealChecks();
    fixture.armMealScenario("household-lost");
    const id = "11111111-2222-4333-8444-555555555555";
    await fixture.route(
      route("/rest/v1/rpc/kitchen_family_change", {
        method: "POST",
        body: {
          _action: "create_household",
          _id: id,
          _revision: 0,
          _data: {
            name: "Synthetic household",
            displayName: "Synthetic owner",
            adultConfirmed: true,
          },
        },
      }),
    );
    fixture.armMealScenario("rename-late");
    const request = route("/rest/v1/rpc/kitchen_family_change", {
      method: "POST",
      body: { _action: "rename_household", _id: id, _revision: 1, _data: { name: "unapproved" } },
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.counts().commits).toBe(1);
  });
  it("provides a completed recipe session for the actual history query", async () => {
    fixture.beginMealChecks();
    const request = route("/rest/v1/cooking_sessions?state-%3E%3Estatus=in.(completed,abandoned)");
    await fixture.route(request);
    const rows = JSON.parse(request.fulfill.mock.calls[0][0].body);
    expect(rows).toHaveLength(1);
    expect(rows[0].state.status).toBe("completed");
    expect(rows[0].user_id).toBe(owner);
    expect(request.continue).not.toHaveBeenCalled();
  });
  it("keeps unknown writes blocked even after the meal scenarios are enabled", async () => {
    fixture.beginMealChecks();
    const request = route("/rest/v1/rpc/kitchen_save_session", { method: "POST" });
    await fixture.route(request);
    expect(request.abort).toHaveBeenCalledOnce();
    expect(request.continue).not.toHaveBeenCalled();
  });
  it("does not allow a peer to execute an armed owner meal scenario", async () => {
    fixture.beginMealChecks();
    fixture.armMealScenario("household-lost");
    const request = route("/rest/v1/rpc/kitchen_family_change", {
      method: "POST",
      user: "synthetic-peer",
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.counts().commits).toBe(0);
  });
  it("requires the exact armed synthetic body, not arbitrary family changes", async () => {
    fixture.beginMealChecks();
    fixture.armMealScenario("household-lost");
    const request = route("/rest/v1/rpc/kitchen_family_change", {
      method: "POST",
      body: {
        _id: "11111111-2222-4333-8444-555555555555",
        _action: "delete_household",
        _revision: 0,
      },
    });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(request.continue).not.toHaveBeenCalled();
    expect(fixture.counts().commits).toBe(0);
  });
  it("mocks installed-origin reads without forwarding even one network request", async () => {
    const request = route("/rest/v1/kitchen_recipes");
    await fixture.route(request);
    expect(request.continue).not.toHaveBeenCalled();
    expect(JSON.parse(request.fulfill.mock.calls[0][0].body)).toHaveLength(1);
    expect(report.simulatedReadRequests).toBe(1);
  });
  it("does not return owner records to a second synthetic account", async () => {
    const request = route("/rest/v1/kitchen_recipes", { user: "synthetic-peer" });
    await fixture.route(request);
    expect(JSON.parse(request.fulfill.mock.calls[0][0].body)).toEqual([]);
  });
  it("permits only known read-only gate RPCs, not writes", async () => {
    const gate = route("/rest/v1/rpc/kitchen_access", { method: "POST" });
    await fixture.route(gate);
    expect(gate.fulfill).toHaveBeenCalled();
    const write = route("/rest/v1/rpc/kitchen_save_session", { method: "POST" });
    await fixture.route(write);
    expect(write.abort).toHaveBeenCalledOnce();
    expect(report.mutations).toBe(1);
  });
  it("blocks installed-origin unknown tables and all external hosts", async () => {
    const unknown = route("/rest/v1/unrecognized");
    await fixture.route(unknown);
    expect(unknown.abort).toHaveBeenCalledOnce();
    const external = route("/", { target: "https://unapproved.example.invalid" });
    await fixture.route(external);
    expect(external.abort).toHaveBeenCalledOnce();
    expect(external.continue).not.toHaveBeenCalled();
    expect(report.externalRequests).toBe(1);
  });
  it("forwards only static/page reads on its isolated app origin", async () => {
    const page = route("/assets/synthetic.js", { target: base });
    await fixture.route(page);
    expect(page.continue).toHaveBeenCalledOnce();
    const api = route("/api/chef", { target: base, method: "POST" });
    await fixture.route(api);
    expect(api.abort).toHaveBeenCalledOnce();
    expect(api.continue).not.toHaveBeenCalled();
  });
  it.each([{ user: "unrecognized" }, { apiKey: "not-the-fixture-key" }])(
    "rejects a nonfixture identity or public key",
    async (options) => {
      const request = route("/rest/v1/kitchen_recipes", options);
      await expect(fixture.route(request)).rejects.toThrow();
      expect(request.continue).not.toHaveBeenCalled();
      expect(request.fulfill).not.toHaveBeenCalled();
    },
  );
  it("can hold a read then deliver a failure without treating it as empty", async () => {
    const release = fixture.delay("meal_wine_links");
    const request = route("/rest/v1/meal_wine_links");
    const pending = fixture.route(request);
    expect(request.fulfill).not.toHaveBeenCalled();
    fixture.failedTables.add("meal_wine_links");
    release();
    await pending;
    expect(request.fulfill.mock.calls[0][0].status).toBe(503);
    expect(request.continue).not.toHaveBeenCalled();
  });
});
