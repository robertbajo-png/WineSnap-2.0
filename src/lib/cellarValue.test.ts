import { describe, expect, it } from "vitest";
import { summarizeCellarPrices, type CellarPrice } from "./cellarValue";

const wine = (overrides: Partial<CellarPrice> = {}): CellarPrice => ({
  consumed_at: null,
  quantity: 2,
  purchase_price: 100,
  purchase_currency: "SEK",
  market_price: 120,
  market_price_currency: "SEK",
  ...overrides,
});

describe("cellar price summaries", () => {
  it("keeps currencies separate and weights prices by bottle count", () => {
    expect(
      summarizeCellarPrices(
        [wine(), wine({ purchase_currency: " eur ", purchase_price: 10 })],
        "purchase",
      ).groups,
    ).toEqual([
      { currency: "EUR", total: 20, bottles: 2 },
      { currency: "SEK", total: 200, bottles: 2 },
    ]);
  });
  it("never invents a currency or treats missing prices as zero", () => {
    expect(
      summarizeCellarPrices(
        [wine({ purchase_currency: null }), wine({ purchase_price: null })],
        "purchase",
      ),
    ).toEqual({ groups: [], excluded: 4 });
  });
  it("excludes consumed bottles and zero stock", () => {
    expect(
      summarizeCellarPrices([wine({ consumed_at: "2026-10-04" }), wine({ quantity: 0 })], "retail"),
    ).toEqual({ groups: [], excluded: 0 });
  });
  it("handles free bottles, default quantity and invalid amounts", () => {
    expect(
      summarizeCellarPrices(
        [
          wine({ quantity: null, purchase_price: 0 }),
          wine({ purchase_price: NaN }),
          wine({ purchase_price: -1 }),
        ],
        "purchase",
      ),
    ).toEqual({ groups: [{ currency: "SEK", total: 0, bottles: 1 }], excluded: 4 });
  });
  it("uses retail currency independently of purchase currency", () => {
    expect(summarizeCellarPrices([wine({ purchase_currency: "EUR" })], "retail").groups).toEqual([
      { currency: "SEK", total: 240, bottles: 2 },
    ]);
  });
});
