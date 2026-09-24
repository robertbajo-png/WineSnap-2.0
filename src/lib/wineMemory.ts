export type DerivedPreference = {
  attribute: string;
  value_text: string | null;
  value_number: number | null;
  preference_score: number;
  confidence: number;
  evidence_count: number;
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  overall: "overall wine response",
  body: "body",
  tannin: "tannin",
  acidity: "acidity",
  sweetness: "sweetness",
  oak: "oak",
  fruit: "fruit character",
  aroma: "aroma",
  grape: "grape",
  region: "region",
  wine_type: "wine type",
  producer: "producer",
  price: "price",
};

export function reliablePreferences(preferences: DerivedPreference[], minimumConfidence = 0.35) {
  return preferences
    .filter(
      (preference) =>
        Number.isFinite(preference.confidence) &&
        preference.confidence >= minimumConfidence &&
        Number.isFinite(preference.preference_score),
    )
    .sort(
      (a, b) =>
        b.confidence * Math.max(1, b.evidence_count) - a.confidence * Math.max(1, a.evidence_count),
    );
}

export function preferenceDescription(preference: DerivedPreference) {
  const label = ATTRIBUTE_LABELS[preference.attribute] ?? preference.attribute.replaceAll("_", " ");
  const subject = preference.value_text
    ? `${label}: ${preference.value_text}`
    : preference.value_number != null
      ? `${label}: about ${Number(preference.value_number).toFixed(1)}/${preference.attribute === "overall" ? 5 : 10}`
      : label;
  const direction = preference.preference_score >= 0 ? "likes" : "tends to avoid";
  return `${direction} ${subject} (confidence ${Math.round(preference.confidence * 100)}%, ${preference.evidence_count} evidence)`;
}

export function memoryPromptSummary(preferences: DerivedPreference[], limit = 12) {
  const reliable = reliablePreferences(preferences).slice(0, limit);
  if (!reliable.length) return "Not enough reliable Wine Memory evidence yet.";
  return reliable.map((preference) => `- ${preferenceDescription(preference)}`).join("\n");
}
