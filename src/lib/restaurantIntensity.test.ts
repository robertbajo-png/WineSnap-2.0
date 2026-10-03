import { describe, expect, it } from "vitest";
import { sanitizeRestaurantIntensity } from "../../supabase/functions/_shared/restaurantRanking";

describe("restaurant intensity validation", () => {
  it.each([0, 5.5, 10])("preserves valid intensity %s", (value) => {
    expect(sanitizeRestaurantIntensity(value)).toBe(value);
  });
  it.each([null, undefined, "5", -1, 11, NaN, Infinity])(
    "does not treat invalid or missing intensity as a known taste",
    (value) => {
      expect(sanitizeRestaurantIntensity(value)).toBeNull();
    },
  );
});
