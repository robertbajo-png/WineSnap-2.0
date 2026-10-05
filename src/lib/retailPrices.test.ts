import { describe, expect, it, vi } from "vitest";
import {
  acceptedRetailMatch,
  canConfirmPrice,
  exactRetailMatch,
  initialPriceProgress,
  priceCandidates,
  priceFreshness,
  priceIdentity,
  runPriceBatches,
} from "./retailPrices";
import { wine, candidate, quoted } from "./testing/retailFixtures";
describe("retail identity and freshness", () => {
  it("matches exact producer/cuvee/year/volume without punctuation or accent drift", () => {
    expect(exactRetailMatch(wine, candidate)).toBe(true);
    expect(exactRetailMatch({ ...wine, country: "Tyskland" }, candidate)).toBe(true);
    expect(
      exactRetailMatch(wine, {
        ...candidate,
        producer: "Zéhn Morgen",
        name: "Chardonnay Weisser Burgunder 2023",
      }),
    ).toBe(true);
    for (const patch of [
      { vintage: 2024 },
      { volumeMl: 1500 },
      { producer: "Another winery" },
      { name: "Reserve Chardonnay" },
      { packaging: "Bag in box" },
      { country: "France" },
    ]) {
      expect(exactRetailMatch(wine, { ...candidate, ...patch })).toBe(false);
    }
  });
  it("does not infer missing year or volume for automatic matching", () => {
    expect(exactRetailMatch({ ...wine, bottle_ml: null }, candidate)).toBe(false);
    expect(exactRetailMatch({ ...wine, vintage: null }, candidate)).toBe(false);
    expect(canConfirmPrice(wine, { ...candidate, volumeMl: null })).toBe(false);
    expect(canConfirmPrice(wine, { ...candidate, vintage: null })).toBe(false);
  });
  it("only reuses a manual product connection while identities still agree", () => {
    const alias = { ...wine, wine_name: "Chardonnay blend" };
    const manual = {
      ...alias,
      retail_price_match: { ...candidate, identity: priceIdentity(alias), verification: "manual" },
    };
    expect(acceptedRetailMatch(manual, candidate)).toBe(true);
    expect(acceptedRetailMatch({ ...manual, wine_name: "Riesling" }, candidate)).toBe(false);
    expect(acceptedRetailMatch(manual, { ...candidate, vintage: 2024 })).toBe(false);
    expect(acceptedRetailMatch(manual, { ...candidate, name: "Another blend" })).toBe(false);
  });
  it("separates legacy, fresh, old, failed and identity-changed prices", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    expect(priceFreshness(wine, now)).toBe("missing");
    expect(priceFreshness({ ...wine, market_price: 159 }, now)).toBe("unverified");
    expect(priceFreshness(quoted(), now)).toBe("fresh");
    expect(priceFreshness(quoted({ market_price_checked_at: "2026-09-01T10:00:00Z" }), now)).toBe(
      "old",
    );
    expect(priceFreshness(quoted({ retail_price_status: "error" }), now)).toBe("old");
    expect(priceFreshness(quoted({ market_price_checked_at: "2027-01-01T10:00:00Z" }), now)).toBe(
      "old",
    );
    expect(priceFreshness(quoted({ bottle_ml: 1500 }), now)).toBe("unverified");
    expect(priceFreshness(quoted({ market_price: 190 }), now)).toBe("unverified");
  });
  it("invalidates proposals after identity edits", () => {
    const pending = {
      ...wine,
      retail_price_candidates: { identity: priceIdentity(wine), candidates: [candidate] },
    };
    expect(priceCandidates(pending)).toEqual([candidate]);
    expect(priceCandidates({ ...pending, vintage: 2024 })).toEqual([]);
  });
});
describe("bounded price batches", () => {
  const ids = Array.from(
    { length: 205 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  it("checks every wine, never more than three in a request", async () => {
    const request = vi.fn(async (batch: string[]) => ({
      results: batch.map((wineId) => ({ wineId, status: "matched" })),
    }));
    const result = await runPriceBatches(
      initialPriceProgress(ids),
      request,
      () => {},
      () => false,
    );
    expect(result.checked).toBe(205);
    expect(result.remaining).toEqual([]);
    expect(request.mock.calls.every(([batch]) => batch.length <= 3)).toBe(true);
  });
  it("pauses between groups and resumes without checking completed rows again", async () => {
    let stop = false;
    const request = vi.fn(async (batch: string[]) => ({
      results: batch.map((wineId) => ({ wineId, status: "review" })),
    }));
    const paused = await runPriceBatches(
      initialPriceProgress(ids.slice(0, 8)),
      request,
      () => {
        stop = true;
      },
      () => stop,
    );
    expect(paused.checked).toBe(3);
    const done = await runPriceBatches(
      paused,
      request,
      () => {},
      () => false,
    );
    expect(done.review).toBe(8);
    expect(request.mock.calls.flatMap(([batch]) => batch)).toEqual(ids.slice(0, 8));
  });
  it("preserves the pending group on transport failure and rejects incomplete/foreign responses", async () => {
    const initial = initialPriceProgress(ids.slice(0, 3));
    for (const response of [
      { results: [] },
      { results: ids.slice(1, 4).map((wineId) => ({ wineId, status: "matched" })) },
    ]) {
      await expect(
        runPriceBatches(
          initial,
          async () => response,
          () => {},
          () => false,
        ),
      ).rejects.toThrow();
    }
    await expect(
      runPriceBatches(
        initial,
        async () => {
          throw new Error("Timeout");
        },
        () => {},
        () => false,
      ),
    ).rejects.toThrow("Timeout");
    expect(initial.remaining).toEqual(ids.slice(0, 3));
  });
});
