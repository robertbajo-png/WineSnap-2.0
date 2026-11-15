import {
  authoritativeLabelText,
  validateIdentity,
  validateTaste,
} from "../../src/lib/labelValidation";
import {
  completionContent,
  deriveFoodMemory,
  needsSafetyResponse,
  providerMemory,
  recipeDraft,
  type FoodSignal,
} from "../../src/features/chef/domain";
import { groundedSuggestions } from "../../supabase/functions/_shared/suggestionCatalog";
import { scorePersonalizedCandidate } from "../../supabase/functions/_shared/recommendationScoring";

const owner = "10000000-0000-4000-8000-000000000001";
const peer = "20000000-0000-4000-8000-000000000001";
const at = Date.parse("2026-11-15T12:00:00Z");
const field = (value: string, extra = {}) => ({
  value,
  source: "label",
  confidence: 95,
  evidence: value,
  ...extra,
});
const identity = (value: unknown, text = "ZEHN MORGEN 20 23 CHARDONNAY") =>
  (validateIdentity({ producer: value }, text).producer as { value: string | null }).value;
const signal = (extra: Partial<FoodSignal> = {}): FoodSignal => ({
  id: owner,
  user_id: owner,
  source_kind: "statement",
  source_key: "synthetic-statement-1",
  source_feedback_id: null,
  attribute: "ingredient",
  value: "tomat",
  direction: 1,
  source_excerpt: "synthetic culinary statement",
  source_title: "Synthetic quality fixture",
  confidence: 1,
  status: "confirmed",
  revision: 1,
  created_at: new Date(at).toISOString(),
  ...extra,
});
const recipe = {
  title: "Syntetisk tomatsoppa",
  description: "Synthetic quality fixture, not medical advice.",
  servings: 2,
  totalMinutes: 20,
  ingredients: [{ name: "tomat", amount: 400, unit: "g" }],
  steps: [{ title: "Tillaga", text: "Koka soppan och smaka av.", timerSeconds: 600 }],
};
const rejects = (action: () => unknown) => {
  try {
    action();
    return false;
  } catch {
    return true;
  }
};

// Fixed synthetic gates against production validators, not a model or a medical-safety grader.
export const aiQualityCases: readonly { id: string; area: string; check: () => boolean }[] = [
  { id: "AQL-01", area: "label", check: () => identity(field("Zehn Morgen")) === "Zehn Morgen" },
  { id: "AQL-02", area: "label", check: () => identity(field("Zehn Zilliken")) === null },
  {
    id: "AQL-03",
    area: "label",
    check: () => identity(field("Zehn Morgen", { source: "inference" })) === null,
  },
  {
    id: "AQL-04",
    area: "label",
    check: () => identity(field("Zehn Morgen", { confidence: 49 })) === null,
  },
  {
    id: "AQL-05",
    area: "label",
    check: () => identity(field("Zehn Morgen", { evidence: "fabricated quote" })) === null,
  },
  {
    id: "AQL-06",
    area: "label",
    check: () => {
      const year = validateIdentity({ vintage: field("2023", { evidence: "20 23" }) }, "20 23")
        .vintage as { value: string };
      return year.value === "2023";
    },
  },
  {
    id: "AQL-07",
    area: "label",
    check: () =>
      authoritativeLabelText("substituted label", "ZEHN MORGEN") === "ZEHN MORGEN" &&
      validateTaste({ acidity: null }).acidity === null,
  },
  {
    id: "AQR-01",
    area: "recipe",
    check: () => {
      const draft = recipeDraft(recipe, "synthetic-model", () => owner);
      return draft.servings === 2 && draft.totalMinutes === 20 && draft.ingredients[0].unit === "g";
    },
  },
  {
    id: "AQR-02",
    area: "recipe",
    check: () =>
      rejects(() =>
        recipeDraft(
          { ...recipe, ingredients: [{ name: "tomat", amount: 1, unit: "invented-unit" }] },
          "synthetic-model",
          () => owner,
        ),
      ),
  },
  {
    id: "AQR-03",
    area: "recipe",
    check: () => rejects(() => recipeDraft({ title: "partial" }, "synthetic-model", () => owner)),
  },
  {
    id: "AQR-04",
    area: "recipe",
    check: () =>
      rejects(() =>
        completionContent({
          choices: [{ finish_reason: "length", message: { content: "partial output" } }],
        }),
      ),
  },
  {
    id: "AQM-01",
    area: "memory",
    check: () => providerMemory([signal({ user_id: peer })], owner).length === 0,
  },
  {
    id: "AQM-02",
    area: "memory",
    check: () => providerMemory([signal({ status: "pending" })], owner).length === 0,
  },
  {
    id: "AQM-03",
    area: "memory",
    check: () =>
      providerMemory([signal({ source_kind: "feedback", confidence: 0.1 })], owner).length === 0,
  },
  {
    id: "AQM-04",
    area: "memory",
    check: () => {
      const result = deriveFoodMemory(
        [
          signal({ source_kind: "feedback" }),
          signal({
            id: peer,
            source_kind: "feedback",
            source_key: "synthetic-feedback-2",
            direction: -1,
          }),
        ],
        owner,
        at,
      );
      return result[0].confidence === 0 && !result[0].explicit;
    },
  },
  {
    id: "AQM-05",
    area: "memory",
    check: () => {
      const result = deriveFoodMemory(
        [
          signal(),
          signal({
            id: peer,
            source_kind: "correction",
            source_key: "synthetic-correction-2",
            direction: -1,
            created_at: new Date(at + 1000).toISOString(),
          }),
        ],
        owner,
        at + 1000,
      );
      return result[0].direction === -1 && result[0].explicit && result[0].evidenceCount === 2;
    },
  },
  { id: "AQM-06", area: "memory", check: () => providerMemory([], owner).length === 0 },
  {
    id: "AQM-07",
    area: "memory",
    check: () =>
      deriveFoodMemory([signal(), signal({ id: peer })], owner, at)[0].evidenceCount === 1,
  },
  {
    id: "AQS-01",
    area: "safety",
    check: () => needsSafetyResponse("Kan du garantera allergisaker mat?"),
  },
  { id: "AQS-02", area: "safety", check: () => needsSafetyResponse("Can I eat raw chicken?") },
  {
    id: "AQS-03",
    area: "safety",
    check: () => needsSafetyResponse("Ge mig medicinsk kost for diabetes"),
  },
  { id: "AQS-04", area: "safety", check: () => !needsSafetyResponse("Hur skar jag en tomat?") },
  {
    id: "AQW-01",
    area: "recommendation",
    check: () => groundedSuggestions([{ catalog_id: "invented-bottle" }]).length === 0,
  },
  {
    id: "AQW-02",
    area: "recommendation",
    check: () => {
      const [result] = groundedSuggestions([
        { catalog_id: "cloudy-sauvignon", producer: "invented", vintage: 1900, price: 123 },
      ]);
      return (
        result.producer === "Cloudy Bay" &&
        result.vintage === 2024 &&
        !Object.hasOwn(result, "price") &&
        !!result.source_url
      );
    },
  },
  {
    id: "AQW-03",
    area: "recommendation",
    check: () =>
      groundedSuggestions([{ catalog_id: "cloudy-sauvignon" }, { catalog_id: "cloudy-sauvignon" }])
        .length === 1,
  },
  {
    id: "AQW-04",
    area: "recommendation",
    check: () => {
      const result = scorePersonalizedCandidate({ grape_varieties: ["Chardonnay"] }, null, [
        {
          attribute: "grape",
          value_text: "Chardonnay",
          value_number: null,
          preference_score: 1,
          confidence: 0.1,
          evidence_count: 1,
        },
      ]);
      return result.confidence === "low" && result.evidence.length === 0 && result.score === 50;
    },
  },
];

export function runDeterministicAiQuality() {
  const cases = aiQualityCases.map(({ id, area, check }) => {
    const started = Date.now();
    let passed = false;
    try {
      passed = check() === true;
    } catch {
      /* No raw exception or source data in reports. */
    }
    return { id, area, passed, durationMs: Math.max(0, Date.now() - started) };
  });
  return {
    version: 1,
    suite: "winesnap-ai-quality-v1",
    mode: "deterministic" as const,
    synthetic: true,
    liveProvider: false,
    providerCalls: 0,
    productionTouched: false,
    medicalSafetyCertified: false,
    semanticQualityVerified: false,
    completed: cases.every((c) => c.passed),
    cases,
  };
}
