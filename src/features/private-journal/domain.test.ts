import { describe, expect, it } from "vitest";
import { compareMealGoal, journalCommand, mealGoal, reading, readingInWindow } from "./domain";
import { enteredInstant, localTimeOffsets } from "./timestamp";

const at = "2026-10-25T02:30:00+02:00";
const blood = { method: "blood", unit: "mmol/L", value: "1.20", at } as const;

describe("private journal input", () => {
  it("preserves the entered precision, unit and timestamp", () => {
    expect(reading.parse(blood)).toEqual(blood);
    expect(reading.safeParse({ ...blood, unit: "ppm" }).success).toBe(false);
    expect(reading.safeParse({ ...blood, value: "1e2" }).success).toBe(false);
    expect(reading.safeParse({ ...blood, at: at.slice(0, 19) }).success).toBe(false);
    expect(reading.safeParse({ ...blood, at: "2026-10-25T02:30:00-00:00" }).success).toBe(false);
    expect(reading.safeParse({ ...blood, at: "2026-02-30T02:30:00Z" }).success).toBe(false);
    expect(reading.safeParse({ ...blood, value: "LO" }).success).toBe(false);
  });

  it("limits each source to its exact scale; never converts the category to a number", () => {
    const urine = {
      method: "urine",
      scale: "ketostix-acetoacetate",
      unit: "category",
      value: "negative",
      at,
    };
    expect(reading.parse(urine)).toEqual(urine);
    expect(reading.safeParse({ ...urine, value: 0 }).success).toBe(false);
    expect(reading.safeParse({ ...urine, scale: "other" }).success).toBe(false);
    expect(
      reading.safeParse({ ...blood, method: "breath", unit: "ppm", device: "extra" }).success,
    ).toBe(false);
    expect(journalCommand.safeParse({ action: "read", owner: "not-accepted" }).success).toBe(false);
  });

  it("rejects future readings and cuts off at precisely ninety days", () => {
    const measured = Date.parse(at);
    const end = measured + 90 * 86_400_000;
    expect(readingInWindow(blood, measured - 1)).toBe(false);
    expect(readingInWindow(blood, end - 1)).toBe(true);
    expect(readingInWindow(blood, end)).toBe(false);
  });

  it("requires the original offset during repeated clock time and rejects a skipped hour", () => {
    const change = Date.parse("2026-10-25T01:00:00Z");
    const fallback = (instant: number) => (instant < change ? -120 : -60);
    const forward = Date.parse("2026-03-29T01:00:00Z");
    const spring = (instant: number) => (instant < forward ? -60 : -120);
    expect(localTimeOffsets("2026-10-25T02:30", fallback)).toEqual(["+02:00", "+01:00"]);
    expect(enteredInstant("2026-10-25T02:30", "")).toBe("");
    expect(enteredInstant("2026-10-25T02:30", "+02:00")).toBe(at);
    expect(localTimeOffsets("2026-03-29T02:30", spring)).toEqual([]);
    expect(localTimeOffsets("2026-02-30T02:30", fallback)).toEqual([]);
  });
});

it("compares only a quantified, complete estimate per meal and does not invent a daily total", () => {
  const estimate = { carbsPerServing: 12.44, allAmountsKnown: true };
  expect(compareMealGoal(mealGoal.parse({ period: "day", grams: "12.5" }), estimate)).toBe(
    "daily-unverified",
  );
  const goal = mealGoal.parse({ period: "meal", grams: "12.5" });
  expect(compareMealGoal(goal, null)).toBe("incomplete");
  expect(compareMealGoal(goal, { ...estimate, allAmountsKnown: false })).toBe("incomplete");
  expect(compareMealGoal(goal, { ...estimate, carbsPerServing: null })).toBe("incomplete");
  expect(compareMealGoal(goal, estimate)).toBe("within");
  expect(compareMealGoal(goal, { ...estimate, carbsPerServing: 12.501 })).toBe("above");
  expect(mealGoal.safeParse({ period: "meal", grams: "0" }).success).toBe(false);
});
