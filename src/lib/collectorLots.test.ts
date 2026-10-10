import { describe, expect, it } from "vitest";
import {
  collectorLotSchema,
  collectorLotRowSchema,
  collectorTotals,
  collectorForm,
  parseCollectorForm,
  type CollectorLotInput,
} from "./collectorLots";

const lot = (overrides: Partial<CollectorLotInput> = {}): CollectorLotInput => ({
  wine_id: "11111111-1111-4111-8111-111111111111",
  purpose: "invest",
  purchased_at: "2026-10-04",
  quantity: 6,
  remaining: 3,
  bottle_ml: 750,
  unit_cost: 100,
  additional_cost: 60,
  currency: "SEK",
  condition: "",
  provenance: "",
  storage: "",
  estimate_price: null,
  estimate_currency: null,
  estimate_date: null,
  estimate_source: null,
  estimate_confidence: null,
  ...overrides,
});
describe("collector lots", () => {
  it("adds a first valuation to an existing unvalued acquisition using displayed defaults", () => {
    const form = collectorForm(lot({ currency: "EUR" }));
    expect(form.estimate_currency).toBe("EUR");
    expect(form.estimate_confidence).toBe("low");
    expect(parseCollectorForm(form).success).toBe(true);
    const result = parseCollectorForm({
      ...form,
      estimate_price: "150",
      estimate_date: "2026-10-10",
      estimate_source: "Quotation",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.estimate_currency).toBe("EUR");
  });
  it("validates persisted rows before using them for portfolio totals", () => {
    const row = {
      ...lot(),
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-10-04T10:00:00Z",
      updated_at: "2026-10-04T10:00:00Z",
    };
    expect(collectorLotRowSchema.safeParse(row).success).toBe(true);
    expect(collectorLotRowSchema.safeParse({ ...row, remaining: -1 }).success).toBe(false);
  });
  it("accepts a complete acquisition without a fabricated valuation", () => {
    expect(collectorLotSchema.safeParse(lot()).success).toBe(true);
  });
  it("rejects invalid dates, quantities, currencies and money", () => {
    for (const input of [
      lot({ purchased_at: "2026-02-30" }),
      lot({ quantity: 0 }),
      lot({ remaining: 7 }),
      lot({ unit_cost: Infinity }),
      lot({ unit_cost: -1 }),
      lot({ unit_cost: 0.001 }),
      lot({ additional_cost: -1 }),
    ]) {
      expect(collectorLotSchema.safeParse(input).success).toBe(false);
    }
    expect(collectorLotSchema.safeParse({ ...lot(), currency: "XYZ" }).success).toBe(false);
  });
  it("requires source, date, currency and confidence with manual estimates", () => {
    expect(collectorLotSchema.safeParse(lot({ estimate_price: 150 })).success).toBe(false);
    expect(
      collectorLotSchema.safeParse(
        lot({
          estimate_price: 150,
          estimate_currency: "SEK",
          estimate_date: "2026-10-04",
          estimate_source: "Auction quotation",
          estimate_confidence: "low",
        }),
      ).success,
    ).toBe(true);
    expect(collectorLotSchema.safeParse(lot({ estimate_source: "Source" })).success).toBe(false);
  });
  it("allocates acquisition fees across original bottles and excludes empty lots", () => {
    expect(collectorTotals([lot(), lot({ remaining: 0 })])).toEqual([
      { currency: "SEK", bottles: 3, cost: 330, estimate: 0, valued: 0 },
    ]);
  });
  it("keeps estimate and cost currencies separate without calculating profit", () => {
    expect(collectorTotals([lot({ estimate_price: 15, estimate_currency: "EUR" })])).toEqual([
      { currency: "EUR", bottles: 0, cost: 0, estimate: 45, valued: 3 },
      { currency: "SEK", bottles: 3, cost: 330, estimate: 0, valued: 0 },
    ]);
  });
  it("includes zero-priced estimates in coverage", () => {
    expect(collectorTotals([lot({ estimate_price: 0, estimate_currency: "SEK" })])[0].valued).toBe(
      3,
    );
  });
});
