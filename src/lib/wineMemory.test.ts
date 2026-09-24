import { describe, expect, it } from "vitest";
import {
  memoryPromptSummary,
  preferenceDescription,
  reliablePreferences,
  type DerivedPreference,
} from "./wineMemory";

const preference = (overrides: Partial<DerivedPreference> = {}): DerivedPreference => ({
  attribute: "grape",
  value_text: "Nebbiolo",
  value_number: null,
  preference_score: 0.8,
  confidence: 0.7,
  evidence_count: 3,
  ...overrides,
});

describe("Wine Memory summaries", () => {
  it("filters weak conclusions and ranks stronger evidence first", () => {
    const result = reliablePreferences([
      preference({ value_text: "Merlot", confidence: 0.2, evidence_count: 8 }),
      preference({ value_text: "Nebbiolo", confidence: 0.7, evidence_count: 3 }),
      preference({ value_text: "Riesling", confidence: 0.8, evidence_count: 1 }),
    ]);
    expect(result.map((item) => item.value_text)).toEqual(["Nebbiolo", "Riesling"]);
  });

  it("describes positive, negative, and numeric preferences without false precision", () => {
    expect(preferenceDescription(preference())).toContain("likes grape: Nebbiolo");
    expect(
      preferenceDescription(
        preference({
          attribute: "sweetness",
          value_text: null,
          value_number: 7.25,
          preference_score: -0.6,
        }),
      ),
    ).toContain("tends to avoid sweetness: about 7.3/10");
  });

  it("returns a cold-start message when evidence is insufficient", () => {
    expect(memoryPromptSummary([preference({ confidence: 0.1 })])).toBe(
      "Not enough reliable Wine Memory evidence yet.",
    );
  });
});
