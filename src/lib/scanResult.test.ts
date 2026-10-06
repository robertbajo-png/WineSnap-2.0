import { describe, expect, it } from "vitest";
import {
  applyScanIdentity,
  scanAromas,
  scanIdentityDraft,
  scanPairings,
  scanTasteBand,
} from "./scanResult";
import type { AnalyzedWine } from "./scanIdentity";

const wine: AnalyzedWine = {
  wine_name: "Zehn Morgen",
  vintage: 2023,
  region: "Nahe",
  wine_type: "white",
  grape_varieties: ["Chardonnay", "Weisser Burgunder"],
  description: "An estimated fresh white wine.",
  body: 4,
  acidity: 7,
  sweetness: 1,
  primary_notes: ["Citrus", "Apple"],
  secondary_notes: ["Vanilla"],
  tertiary_notes: ["Honey"],
  food_pairings: [{ dish: "Fish", reason: "Fresh acidity" }],
  serving_temp: "10–12 °C",
  glass_type: "White wine glass",
  decant: false,
};

describe("scan result presentation", () => {
  it("deduplicates aromas across families without fabricating intensities", () => {
    expect(
      scanAromas({
        primary_notes: [" Apple ", "Citrus", ""],
        secondary_notes: ["apple", "Vanilla"],
        tertiary_notes: ["CITRUS"],
      }),
    ).toEqual(["Apple", "Citrus", "Vanilla"]);
  });

  it.each([null, undefined, -1, 11, NaN, Infinity])(
    "does not estimate an unknown or invalid taste (%s)",
    (value) => {
      expect(scanTasteBand(value)).toBeNull();
    },
  );

  it.each([
    [0, "low"],
    [3, "low"],
    [4, "medium"],
    [6, "medium"],
    [7, "high"],
    [10, "high"],
  ] as const)("maps existing taste %s to %s", (value, expected) => {
    expect(scanTasteBand(value)).toBe(expected);
  });

  it("accepts only actual food pairing objects with a dish", () => {
    expect(
      scanPairings([
        null,
        "Fish",
        { dish: 5 },
        { dish: " " },
        { dish: " Fish ", reason: " Fresh acidity " },
        { dish: "Salad" },
        { dish: "Cheese", reason: 42 },
      ]),
    ).toEqual([
      { dish: "Fish", reason: "Fresh acidity" },
      { dish: "Salad", reason: null },
      { dish: "Cheese", reason: null },
    ]);
    expect(scanPairings({ dish: "Fish" })).toEqual([]);
  });
});

describe("manual scan corrections", () => {
  it("leaves absent identity fields empty", () => {
    expect(scanIdentityDraft({})).toEqual({
      producer: "",
      wine_name: "",
      vintage: "",
      region: "",
      country: "",
      grape_varieties: "",
      wine_type: "",
    });
  });

  it("preserves the estimate when nothing changed", () => {
    expect(applyScanIdentity(wine, scanIdentityDraft(wine))).toEqual({ wine, changed: false });
  });

  it("does not treat whitespace cleanup as a changed identity", () => {
    const draft = {
      ...scanIdentityDraft(wine),
      wine_name: " Zehn Morgen ",
      grape_varieties: "Chardonnay , Weisser Burgunder ",
    };
    expect(applyScanIdentity(wine, draft)).toEqual({ wine, changed: false });
  });

  it("applies explicit user corrections without retaining the original wine's estimates", () => {
    const result = applyScanIdentity(wine, {
      ...scanIdentityDraft(wine),
      wine_name: "Corrected wine",
      producer: "Producer",
      vintage: "2022",
      country: "Germany",
    });
    expect(result).toMatchObject({
      changed: true,
      wine: {
        wine_name: "Corrected wine",
        producer: "Producer",
        vintage: 2022,
        country: "Germany",
        description: null,
        body: null,
        acidity: null,
        sweetness: null,
        primary_notes: null,
        secondary_notes: null,
        tertiary_notes: null,
        food_pairings: null,
        serving_temp: null,
        glass_type: null,
        decant: null,
      },
    });
    expect(wine.description).toBe("An estimated fresh white wine.");
  });

  it("allows the user to clear an uncertain vintage and grapes", () => {
    expect(
      applyScanIdentity(wine, { ...scanIdentityDraft(wine), vintage: "", grape_varieties: "" }),
    ).toMatchObject({ changed: true, wine: { vintage: null, grape_varieties: null } });
  });

  it.each(["2023abc", "2023.5", "1799", "9999", "0000"])(
    "rejects invalid manual vintage %s",
    (vintage) => {
      expect(applyScanIdentity(wine, { ...scanIdentityDraft(wine), vintage })).toEqual({
        error: "vintage",
      });
    },
  );

  it("requires a name or producer and an allowed type", () => {
    expect(
      applyScanIdentity(wine, { ...scanIdentityDraft(wine), wine_name: " ", producer: "" }),
    ).toEqual({ error: "identity" });
    expect(applyScanIdentity(wine, { ...scanIdentityDraft(wine), wine_type: "invented" })).toEqual({
      error: "type",
    });
  });
});
