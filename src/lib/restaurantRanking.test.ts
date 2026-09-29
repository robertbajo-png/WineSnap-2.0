import { describe, expect, it } from "vitest";
import { parseMenuPrice, rankRestaurantCandidates } from "./restaurantRanking";

describe("restaurant menu ranking", () => {
  it("parses common menu prices without confusing thousands and decimals", () => {
    expect(parseMenuPrice("1 295 kr")).toEqual({ amount: 1295, currency: "SEK" });
    expect(parseMenuPrice("€42,50")).toEqual({ amount: 42.5, currency: "EUR" });
    expect(parseMenuPrice("USD 1,250")).toEqual({ amount: 1250, currency: "USD" });
  });

  it("keeps known in-budget wines ahead of over-budget wines", () => {
    const ranked = rankRestaurantCandidates(
      [
        { wine_name: "Expensive favorite", grape_varieties: ["Nebbiolo"], price: "1 500 kr" },
        { wine_name: "Affordable option", grape_varieties: ["Gamay"], price: "650 kr" },
      ],
      { preferred_grapes: ["Nebbiolo"] },
      [],
      { maxPrice: 800 },
    );

    expect(ranked.map((wine) => wine.wine_name)).toEqual([
      "Affordable option",
      "Expensive favorite",
    ]);
    expect(ranked[0].budget_fit).toBe("in_budget");
    expect(ranked[1].budget_fit).toBe("over_budget");
  });

  it("uses dish fit as ranking evidence without changing the personal taste score", () => {
    const ranked = rankRestaurantCandidates(
      [
        { wine_name: "Neutral", wine_type: "white", dish_fit: "neutral" },
        { wine_name: "Food match", wine_type: "white", dish_fit: "excellent" },
      ],
      { preferred_types: ["white"] },
      [],
    );

    expect(ranked[0].wine_name).toBe("Food match");
    expect(ranked[0].match_score).toBe(ranked[1].match_score);
  });

  it("can promote a credible stretch in adventurous mode", () => {
    const ranked = rankRestaurantCandidates(
      [
        { wine_name: "Very familiar", wine_type: "red", grape_varieties: ["Pinot Noir"] },
        { wine_name: "New direction", wine_type: "white" },
      ],
      { preferred_types: ["red"], preferred_grapes: ["Pinot Noir"] },
      [],
      { mode: "adventurous" },
    );

    expect(ranked[0].wine_name).toBe("New direction");
    expect(ranked[0].selection_style).toBe("adventurous");
  });
});
