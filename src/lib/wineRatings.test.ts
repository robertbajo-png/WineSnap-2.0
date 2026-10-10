import { describe, expect, it } from "vitest";
import { wineRating, profileStats } from "./wineRatings";
describe("real wine ratings", () => {
  it("never invents a rating from taste structure or missing data", () => {
    expect(wineRating({})).toBeNull();
    expect(wineRating({ user_rating: NaN })).toBeNull();
    expect(wineRating({ user_rating: 7 })).toBeNull();
    expect(wineRating({ user_rating: 0 })).toBe(0);
  });
  it("prefers the latest actual owner's note, never another person's rating", () => {
    expect(
      wineRating({
        user_id: "a",
        user_rating: 2,
        tasting_notes: [
          { user_id: "a", rating: 3, created_at: "2026-01-01" },
          { user_id: "b", rating: 5, created_at: "2026-10-10" },
          { user_id: "a", rating: 4, created_at: "2026-10-01" },
        ],
      }),
    ).toBe(4);
  });
  it("counts only own active quantities and uses actual ratings", () => {
    expect(
      profileStats(
        [
          { user_id: "a", quantity: 6, user_rating: 4 },
          { user_id: "a", quantity: 3, consumed_at: "2026-10-10", user_rating: 2 },
          { user_id: "a", quantity: 1 },
          { user_id: "b", quantity: 99, user_rating: 5 },
        ],
        "a",
      ),
    ).toEqual({ bottles: 7, tasted: 2, average: 3 });
  });
});
