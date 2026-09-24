import { describe, expect, it } from "vitest";
import { socialDiscoveryRank, tasteSimilarityLevel } from "./socialDiscovery";

describe("taste similarity presentation", () => {
  it("requires enough evidence before claiming strong overlap", () => {
    expect(
      tasteSimilarityLevel({
        similarity_score: 0.91,
        similarity_confidence: 0.18,
        shared_preference_count: 2,
      }),
    ).toBe("learning");
    expect(
      tasteSimilarityLevel({
        similarity_score: 0.82,
        similarity_confidence: 0.7,
        shared_preference_count: 7,
      }),
    ).toBe("strong");
  });

  it("distinguishes partial and low overlap", () => {
    expect(
      tasteSimilarityLevel({
        similarity_score: 0.64,
        similarity_confidence: 0.4,
        shared_preference_count: 3,
      }),
    ).toBe("some");
    expect(
      tasteSimilarityLevel({
        similarity_score: 0.31,
        similarity_confidence: 0.5,
        shared_preference_count: 5,
      }),
    ).toBe("low");
  });

  it("ranks evidence-backed overlap ahead of raw similarity guesses", () => {
    const reliable = socialDiscoveryRank({
      similarity_score: 0.72,
      similarity_confidence: 0.8,
      shared_preference_count: 8,
      is_following: false,
      recent_public_wines: 4,
    });
    const weak = socialDiscoveryRank({
      similarity_score: 0.95,
      similarity_confidence: 0.1,
      shared_preference_count: 2,
      is_following: false,
      recent_public_wines: 4,
    });
    expect(reliable).toBeGreaterThan(weak);
  });
});
