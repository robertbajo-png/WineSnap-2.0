import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCoreCollectorFixture } from "./core-collector-browser.mjs";
const origin = "http://127.0.0.1:54323",
  base = "http://127.0.0.1:59999";
const key = "sb_publishable_runtime_check_not_a_real_key",
  owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  peer = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
let fixture, report;
const route = (
  path,
  { target = origin, method = "GET", user = "synthetic-owner", apiKey = key, body = {} } = {},
) => ({
  request: () => ({
    url: () => target + path,
    method: () => method,
    headers: () => ({ apikey: apiKey, authorization: user }),
    postDataJSON: () => body,
    failure: () => null,
  }),
  continue: vi.fn(),
  abort: vi.fn(),
  fulfill: vi.fn(),
});
beforeEach(() => {
  report = { mutations: 0, externalRequests: 0, simulatedWrites: 0 };
  fixture = createCoreCollectorFixture({
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
describe("isolated collector fixture boundary", () => {
  it("mocks all owner reads without forwarding requests to the installed API", async () => {
    const request = route("/rest/v1/collector_lots?user_id=eq." + owner);
    await fixture.route(request);
    expect(request.continue).not.toHaveBeenCalled();
    expect(JSON.parse(request.fulfill.mock.calls[0][0].body)).toHaveLength(2);
  });
  it("never returns owner lots to a peer", async () => {
    const request = route("/rest/v1/collector_lots?user_id=eq." + peer, { user: "synthetic-peer" });
    await fixture.route(request);
    expect(JSON.parse(request.fulfill.mock.calls[0][0].body)).toEqual([]);
  });
  it.each([{ user: "unrecognized" }, { apiKey: "not-the-fixture-key" }])(
    "rejects nonfixture credentials",
    async (options) => {
      const request = route("/auth/v1/user", options);
      await expect(fixture.route(request)).rejects.toThrow();
      expect(request.continue).not.toHaveBeenCalled();
      expect(request.fulfill).not.toHaveBeenCalled();
    },
  );
  it("caps an unpaged response but permits fetching the final page", async () => {
    fixture.reset(true);
    const first = route("/rest/v1/collector_lots?user_id=eq." + owner),
      last = route("/rest/v1/collector_lots?user_id=eq." + owner + "&offset=1000&limit=500");
    await fixture.route(first);
    await fixture.route(last);
    expect(JSON.parse(first.fulfill.mock.calls[0][0].body)).toHaveLength(1000);
    expect(JSON.parse(last.fulfill.mock.calls[0][0].body)).toHaveLength(1);
  });
  it("blocks unknown APIs, external requests and all noncollector writes", async () => {
    const unknown = route("/api/ai/ask-winesnap", { target: base, method: "POST" }),
      external = route("/", { target: "https://unapproved.example.invalid" });
    await fixture.route(unknown);
    await fixture.route(external);
    const write = route("/rest/v1/wines", { method: "POST" });
    await fixture.route(write);
    expect(unknown.abort).toHaveBeenCalledOnce();
    expect(external.abort).toHaveBeenCalledOnce();
    expect(write.abort).toHaveBeenCalledOnce();
    expect(report.mutations).toBe(2);
    expect(report.externalRequests).toBe(1);
  });
  it("rejects writes claiming a different owner", async () => {
    const body = { ...fixture.state.lots[0], user_id: peer };
    const request = route("/rest/v1/collector_lots", { method: "POST", body });
    await expect(fixture.route(request)).rejects.toThrow();
    expect(fixture.state.writes).toEqual([]);
  });
});
