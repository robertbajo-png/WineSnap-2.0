import { describe, expect, it, vi } from "vitest";
import { createRetailPriceHandler } from "./retailPriceService.server";
import { priceIdentity, type RetailWine } from "./retailPrices";
import { candidate, quoted, wine } from "./testing/retailFixtures";

function setup(overrides = {}) {
  const deps = {
    authenticate: vi.fn(async () => "owner"),
    load: vi.fn(async () => [wine]),
    lookup: vi.fn(async () => [candidate]),
    save: vi
      .fn<(userId: string, wine: RetailWine, patch: Record<string, unknown>) => Promise<boolean>>()
      .mockResolvedValue(true),
    now: () => "2026-10-05T12:00:00Z",
    ...overrides,
  };
  const handler = createRetailPriceHandler(deps);
  const request = async (body: unknown = { action: "refresh", wineIds: [wine.id] }) => {
    const response = await handler(
      new Request("http://localhost/price", { method: "POST", body: JSON.stringify(body) }),
    );
    return { code: response.status, body: await response.json() };
  };
  return { deps, request };
}
describe("owner-only price refresh", () => {
  it("authenticates before validation or spending source requests", async () => {
    const { deps, request } = setup({ authenticate: vi.fn(async () => null) });
    expect((await request()).code).toBe(401);
    expect(deps.load).not.toHaveBeenCalled();
    expect(deps.lookup).not.toHaveBeenCalled();
  });
  it("rejects oversized or fabricated requests", async () => {
    const { deps, request } = setup();
    expect((await request({ action: "refresh", wineIds: Array(4).fill(wine.id) })).code).toBe(400);
    expect(
      (
        await request({
          action: "confirm",
          wineId: wine.id,
          productNumber: candidate.productNumber,
          price: 1,
          acknowledged: true,
        })
      ).code,
    ).toBe(400);
    expect(deps.lookup).not.toHaveBeenCalled();
  });
  it("skips unavailable/foreign rows and scopes writes to the authenticated owner", async () => {
    const skipped = setup({ load: vi.fn(async () => []) });
    expect((await skipped.request()).body.results[0].status).toBe("skipped");
    expect(skipped.deps.lookup).not.toHaveBeenCalled();
    const { deps, request } = setup();
    expect((await request()).body.results[0].status).toBe("matched");
    expect(deps.load).toHaveBeenCalledWith("owner", [wine.id]);
    expect(deps.save).toHaveBeenCalledWith(
      "owner",
      wine,
      expect.objectContaining({ market_price: 159, retail_price_status: "matched" }),
    );
    expect(deps.save.mock.calls[0][2]).not.toHaveProperty("purchase_price");
  });
  it("requires review for wrong sizes/years and duplicate exact catalog products", async () => {
    for (const candidates of [
      [{ ...candidate, vintage: 2024 }],
      [{ ...candidate, volumeMl: 1500 }],
      [candidate, { ...candidate, productNumber: "99901" }],
    ]) {
      const { deps, request } = setup({ lookup: vi.fn(async () => candidates) });
      expect((await request()).body.results[0].status).toBe("review");
      expect(deps.save.mock.calls[0][2]).not.toHaveProperty("market_price");
    }
  });
  it("retains stored quotes for source failure and missing products", async () => {
    for (const lookup of [
      vi.fn(async () => []),
      vi.fn(async () => {
        throw new Error("Timeout");
      }),
    ]) {
      const { deps, request } = setup({ load: vi.fn(async () => [quoted()]), lookup });
      const status = (await request()).body.results[0].status;
      expect(["missing", "error"]).toContain(status);
      expect(deps.save.mock.calls[0][2]).not.toHaveProperty("market_price");
      expect(deps.save.mock.calls[0][2]).not.toHaveProperty("market_price_checked_at");
    }
  });
  it("detects concurrent edits and reports missing migration without raw database errors", async () => {
    expect((await setup({ save: vi.fn(async () => false) }).request()).body.results[0].status).toBe(
      "changed",
    );
    const result = await setup({
      load: vi.fn(async () => {
        throw { code: "42703", message: "private details" };
      }),
    }).request();
    expect(result).toEqual({ code: 503, body: { error: "migration_required" } });
  });
});
describe("explicit product confirmation", () => {
  const input = {
    action: "confirm",
    wineId: wine.id,
    productNumber: candidate.productNumber,
    acknowledged: true,
  };
  it("refuses confirmations that were never proposed or identities that changed", async () => {
    const { deps, request } = setup();
    expect((await request(input)).body.results[0].status).toBe("changed");
    expect(deps.lookup).not.toHaveBeenCalled();
    const edited = {
      ...wine,
      vintage: 2024,
      retail_price_candidates: { identity: priceIdentity(wine), candidates: [candidate] },
    };
    expect(
      (await setup({ load: vi.fn(async () => [edited]) }).request(input)).body.results[0].status,
    ).toBe("changed");
  });
  it("confirms unknown volume only from an acknowledged proposal, refetching the price", async () => {
    const row = { ...wine, bottle_ml: null };
    const pending = {
      ...row,
      retail_price_candidates: { identity: priceIdentity(row), candidates: [candidate] },
    };
    const { deps, request } = setup({
      load: vi.fn(async () => [pending]),
      lookup: vi.fn(async () => [{ ...candidate, price: 169 }]),
    });
    expect((await request(input)).body.results[0].status).toBe("matched");
    expect(deps.lookup).toHaveBeenCalledWith(pending, candidate.productNumber);
    expect(deps.save.mock.calls[0][2]).toMatchObject({
      bottle_ml: 750,
      market_price: 169,
      retail_price_match: { verification: "manual", identity: { bottleMl: 750 } },
    });
  });
  it("refuses product changes between proposal and confirmation", async () => {
    const pending = {
      ...wine,
      retail_price_candidates: { identity: priceIdentity(wine), candidates: [candidate] },
    };
    for (const patch of [{ vintage: 2024 }, { name: "Reserve" }, { volumeMl: 1500 }]) {
      const { deps, request } = setup({
        load: vi.fn(async () => [pending]),
        lookup: vi.fn(async () => [{ ...candidate, ...patch }]),
      });
      expect((await request(input)).body.results[0].status).toBe("changed");
      expect(deps.save).not.toHaveBeenCalled();
    }
  });
});
