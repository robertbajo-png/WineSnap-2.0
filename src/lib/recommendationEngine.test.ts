import { describe, expect, it } from "vitest";
import {
  rankPersonalizedCandidates,
  scorePersonalizedCandidate,
  scoreWineSimilarity,
  type RecommendationPreference,
} from "./recommendationEngine";

const memory: RecommendationPreference[] = [
  {
    attribute: "grape",
    value_text: "Riesling",
    value_number: null,
    preference_score: 0.9,
    confidence: 0.8,
    evidence_count: 4,
  },
  {
    attribute: "sweetness",
    value_text: null,
    value_number: 3,
    preference_score: 0.8,
    confidence: 0.7,
    evidence_count: 3,
  },
  {
    attribute: "oak",
    value_text: null,
    value_number: 8,
    preference_score: -0.8,
    confidence: 0.8,
    evidence_count: 3,
  },
];

describe("personalized recommendation scoring", () => {
  it("ranks evidence-backed matches ahead of unsupported candidates", () => {
    const ranked = rankPersonalizedCandidates(
      [
        {
          producer: "B",
          wine_name: "Generic red",
          wine_type: "red",
          grape_varieties: ["Merlot"],
          sweetness: 7,
          oak: 8,
        },
        {
          producer: "A",
          wine_name: "Dry Riesling",
          wine_type: "white",
          region: "Mosel",
          grape_varieties: ["Riesling"],
          sweetness: 3,
          oak: 1,
        },
      ],
      {
        preferred_types: ["white"],
        preferred_regions: ["Mosel"],
        preferred_grapes: ["Riesling"],
        sweetness: 3,
        oak: 2,
      },
      memory,
    );

    expect(ranked[0].wine_name).toBe("Dry Riesling");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].confidence).toBe("high");
    expect(ranked[0].evidence.some((item) => item.attribute === "grape")).toBe(true);
  });

  it("does not invent high confidence for cold-start users", () => {
    expect(
      scorePersonalizedCandidate(
        { producer: "A", wine_name: "Unknown", wine_type: "white" },
        null,
        [],
      ),
    ).toEqual({ score: 50, confidence: "low", evidence: [] });
  });

  it("penalizes candidates close to a reliably avoided numeric preference", () => {
    const oaky = scorePersonalizedCandidate({ oak: 8 }, null, memory);
    const unoaked = scorePersonalizedCandidate({ oak: 1 }, null, memory);
    expect(oaky.score).toBeLessThan(unoaked.score);
    expect(oaky.evidence).toContainEqual(
      expect.objectContaining({ attribute: "oak", direction: "negative" }),
    );
  });
});

describe("wine similarity scoring", () => {
  it("uses shared grapes, type, region, and structure instead of model confidence", () => {
    const close = scoreWineSimilarity(
      {
        wine_type: "white",
        region: "Mosel",
        country: "Germany",
        grape_varieties: ["Riesling"],
        acidity: 8,
        sweetness: 3,
      },
      {
        wine_type: "white",
        region: "Mosel",
        country: "Germany",
        grape_varieties: ["Riesling"],
        acidity: 7,
        sweetness: 3,
      },
    );
    const distant = scoreWineSimilarity(
      { wine_type: "white", region: "Mosel", grape_varieties: ["Riesling"] },
      { wine_type: "red", region: "Barossa", grape_varieties: ["Shiraz"] },
    );
    expect(close.score).toBeGreaterThan(distant.score);
    expect(close.evidence[0].source).toBe("similarity");
  });
});
