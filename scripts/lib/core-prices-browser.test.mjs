import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCorePricesFixture } from "./core-prices-browser.mjs";
const origin = "http://127.0.0.1:54323",
  base = "http://127.0.0.1:59999";
const key = "sb_publishable_runtime_check_not_a_real_key",
  owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  peer = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
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
  report = { mutations: 0, externalRequests: 0, simulatedWrites: 0 };
  fixture = createCorePricesFixture({
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
describe("isolated price fixture boundary", () => {
  it("intercepts all backend reads without reaching the installed API", async () => {
    const req = route("/rest/v1/wines?user_id=eq." + owner);
    await fixture.route(req);
    expect(req.continue).not.toHaveBeenCalled();
    expect(JSON.parse(req.fulfill.mock.calls[0][0].body)).toHaveLength(4);
  });
  it("returns only the synthetic peer's own bottles", async () => {
    const req = route("/rest/v1/wines?user_id=eq." + peer, { user: "synthetic-peer" });
    await fixture.route(req);
    expect(JSON.parse(req.fulfill.mock.calls[0][0].body).map((r) => r.user_id)).toEqual([peer]);
  });
  it.each([{ user: "unrecognized" }, { apiKey: "unrecognized" }])(
    "rejects nonfixture credentials",
    async (options) => {
      const req = route("/auth/v1/user", options);
      await expect(fixture.route(req)).rejects.toThrow();
      expect(req.continue).not.toHaveBeenCalled();
    },
  );
  it("does not forward the price POST, even though it targets the fixture app", async () => {
    const req = route("/api/public/hooks/refresh-cellar-values", {
      target: base,
      method: "POST",
      body: { action: "refresh", wineIds: [fixture.state.wines[0].id] },
    });
    await fixture.route(req);
    expect(req.continue).not.toHaveBeenCalled();
    expect(req.fulfill).toHaveBeenCalledOnce();
    expect(report.simulatedPriceRequests).toBe(1);
  });
  it("rejects cross-owner price IDs", async () => {
    const req = route("/api/public/hooks/refresh-cellar-values", {
      target: base,
      method: "POST",
      user: "synthetic-peer",
      body: { action: "refresh", wineIds: [fixture.state.wines[0].id] },
    });
    await expect(fixture.route(req)).rejects.toThrow();
    expect(fixture.state.requests).toEqual([]);
  });
  it("makes synthetic automatic quotes match the actual fixture wine identity", async () => {
    const wine = fixture.state.wines[0];
    const req = route("/api/public/hooks/refresh-cellar-values", {
      target: base,
      method: "POST",
      body: { action: "refresh", wineIds: [wine.id] },
    });
    await fixture.route(req);
    expect(wine.retail_price_match.name).toBe(wine.wine_name);
    expect(wine.retail_price_match.identity.wineId).toBe(wine.id);
    expect(wine.retail_price_match.source).toBe("bolaget.io");
  });
  it("blocks external traffic, unknown same-app APIs and other mutations", async () => {
    const external = route("/", { target: "https://unapproved.example.invalid" }),
      api = route("/api/ai/ask-winesnap", { target: base, method: "POST" }),
      write = route("/rest/v1/wines", { method: "PATCH" });
    for (const req of [external, api, write]) {
      await fixture.route(req);
      expect(req.abort).toHaveBeenCalledOnce();
      expect(req.continue).not.toHaveBeenCalled();
    }
    expect(report.externalRequests).toBe(1);
    expect(report.mutations).toBe(2);
  });
});
