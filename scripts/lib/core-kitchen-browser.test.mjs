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
  { target = origin, method = "GET", user = "synthetic-owner", apiKey = key } = {},
) {
  return {
    request: () => ({
      url: () => target + path,
      method: () => method,
      headers: () => ({ apikey: apiKey, authorization: user }),
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
