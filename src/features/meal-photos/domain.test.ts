import { describe, expect, it } from "vitest";
import {
  confirmedPhotoMealSchema,
  mealPhotoEstimateSchema,
  openPhotoMealReview,
  renamePhotoMealItem,
} from "./domain";

const rice = { name: "Ris", confidence: "medium", portion: { minGrams: 80, maxGrams: 140 } };

describe("meal photo estimate", () => {
  it("accepts no match and does not turn unknown portions into zero", () => {
    expect(mealPhotoEstimateSchema.parse({ items: [] }).items).toEqual([]);
    const estimate = mealPhotoEstimateSchema.parse({ items: [{ ...rice, portion: null }] });
    expect(openPhotoMealReview(estimate)).toEqual({
      items: [{ name: "Ris", portion: null }],
      keepPhoto: false,
    });
  });

  it.each([
    { minGrams: 120, maxGrams: 80 },
    { minGrams: 100, maxGrams: 100 },
    { minGrams: 0, maxGrams: 80 },
    { minGrams: 1, maxGrams: 10_001 },
  ])("rejects an invalid or falsely exact image range %j", (portion) => {
    expect(mealPhotoEstimateSchema.safeParse({ items: [{ ...rice, portion }] }).success).toBe(
      false,
    );
  });

  it("rejects provider-supplied safety, nutrition and retention fields", () => {
    expect(
      mealPhotoEstimateSchema.safeParse({ items: [{ ...rice, allergensSafe: true }] }).success,
    ).toBe(false);
    expect(
      mealPhotoEstimateSchema.safeParse({ items: [{ ...rice, energyKcal: 180 }] }).success,
    ).toBe(false);
    expect(mealPhotoEstimateSchema.safeParse({ items: [rice], keepPhoto: true }).success).toBe(
      false,
    );
  });
});

describe("meal photo review", () => {
  const draft = () => openPhotoMealReview(mealPhotoEstimateSchema.parse({ items: [rice] }));

  it("defaults to no photo retention and keeps the estimate distinct from manual entry", () => {
    const review = draft();
    expect(confirmedPhotoMealSchema.parse(review)).toEqual({
      items: [{ name: "Ris", portion: { source: "photo_estimate", range: rice.portion } }],
      keepPhoto: false,
    });
    review.items[0].portion = { source: "manual", grams: 125 };
    expect(confirmedPhotoMealSchema.parse(review).items[0].portion).toEqual({
      source: "manual",
      grams: 125,
    });
  });

  it("drops the estimated range on a changed food identity but retains a manual measure", () => {
    const [item] = draft().items;
    expect(renamePhotoMealItem(item, " Ris ").portion).toEqual(item.portion);
    expect(renamePhotoMealItem(item, "Pasta")).toEqual({ name: "Pasta", portion: null });
    const manual = { source: "manual", grams: 120 } as const;
    expect(renamePhotoMealItem({ ...item, portion: manual }, "Pasta").portion).toEqual(manual);
  });

  it("requires at least one reviewed food and a separate choice about retaining the photo", () => {
    expect(confirmedPhotoMealSchema.safeParse({ items: [], keepPhoto: false }).success).toBe(false);
    expect(confirmedPhotoMealSchema.safeParse({ items: draft().items }).success).toBe(false);
  });
});
