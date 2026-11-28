import { describe, expect, it } from "vitest";
import {
  confirmedPhotoMealSchema,
  mealPhotoEstimateSchema,
  openPhotoMealReview,
  renamePhotoMealItem,
  savedPhotoMealSchema,
} from "./domain";

const rice = { name: "Ris", confidence: "medium", portion: { minGrams: 80, maxGrams: 140 } };

describe("meal photo estimate", () => {
  it("does not accept control characters inside a food label", () => {
    const result = mealPhotoEstimateSchema.safeParse({ items: [{ ...rice, name: "Ris\nBonor" }] });
    expect(result.success).toBe(false);
  });
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

describe("saved photo meal", () => {
  const record = {
    id: "bb000000-0000-4000-8000-000000000001",
    user_id: "ba000000-0000-4000-8000-000000000001",
    created_at: "2026-11-28T09:00:00+00:00",
    items: [{ name: "Ris", portion: null }],
    keep_photo: false,
    photo_state: "none",
  };

  it("distinguishes pending retention, attachment, and photo removal", () => {
    expect(savedPhotoMealSchema.parse(record).photo_state).toBe("none");
    for (const photo_state of ["pending", "ready", "removing", "removed"]) {
      expect(
        savedPhotoMealSchema.parse({ ...record, photo_state, keep_photo: true }).photo_state,
      ).toBe(photo_state);
    }
  });

  it("rejects inconsistent retention and unexpected image paths", () => {
    expect(savedPhotoMealSchema.safeParse({ ...record, photo_state: "ready" }).success).toBe(false);
    expect(savedPhotoMealSchema.safeParse({ ...record, keep_photo: true }).success).toBe(false);
    expect(savedPhotoMealSchema.safeParse({ ...record, signed_url: "unexpected" }).success).toBe(
      false,
    );
  });
});
