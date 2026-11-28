import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gradeMealPhoto, mealPhotoCases, mealPhotoFixture } from "./meal-photo-quality-fixtures";
import type { MealPhotoEstimate } from "../../src/features/meal-photos/domain";

const empty = { items: [] };
const apple = (portion: MealPhotoEstimate["items"][number]["portion"]): MealPhotoEstimate => ({
  items: [{ name: "Rött äpple", confidence: "medium", portion }],
});

describe("synthetic meal photo quality cases", () => {
  it("renders a fixed and distinct normalized RGB frame for each case", () => {
    const fingerprints = mealPhotoCases.map((id) => {
      const frame = mealPhotoFixture(id);
      expect(frame.pixels.length).toBe(frame.width * frame.height * 3);
      expect(frame.pixels).toEqual(mealPhotoFixture(id).pixels);
      return createHash("sha256").update(frame.pixels).digest("hex");
    });
    expect(new Set(fingerprints).size).toBe(mealPhotoCases.length);
  });

  it("distinguishes recognition and false positives from measurable scale", () => {
    const bounded = apple({ minGrams: 85, maxGrams: 155 });
    expect(gradeMealPhoto("empty", empty).passed).toBe(true);
    expect(gradeMealPhoto("empty", apple(null)).passed).toBe(false);
    expect(gradeMealPhoto("no-scale", apple(null)).passed).toBe(true);
    expect(gradeMealPhoto("no-scale", bounded).passed).toBe(false);
    expect(gradeMealPhoto("cropped", empty).passed).toBe(true);
    expect(gradeMealPhoto("cropped", bounded).passed).toBe(false);
    expect(gradeMealPhoto("calibrated", apple(null)).passed).toBe(false);
    expect(gradeMealPhoto("calibrated", apple({ minGrams: 89, maxGrams: 90 })).passed).toBe(false);
    expect(gradeMealPhoto("calibrated", bounded).passed).toBe(true);
  });
});
