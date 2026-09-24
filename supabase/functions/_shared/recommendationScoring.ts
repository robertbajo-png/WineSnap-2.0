export type RecommendationCandidate = {
  producer?: string | null;
  wine_name?: string | null;
  vintage?: string | number | null;
  region?: string | null;
  country?: string | null;
  wine_type?: string | null;
  grape_varieties?: string[] | null;
  primary_notes?: string[] | null;
  secondary_notes?: string[] | null;
  tertiary_notes?: string[] | null;
  body?: number | null;
  tannin?: number | null;
  acidity?: number | null;
  sweetness?: number | null;
  oak?: number | null;
  fruit?: number | null;
};

export type RecommendationPreference = {
  attribute: string;
  value_text: string | null;
  value_number: number | null;
  preference_score: number;
  confidence: number;
  evidence_count: number;
};

export type ExplicitTasteProfile = {
  preferred_types?: string[] | null;
  preferred_regions?: string[] | null;
  preferred_grapes?: string[] | null;
  body?: number | null;
  tannin?: number | null;
  acidity?: number | null;
  sweetness?: number | null;
  oak?: number | null;
  fruit?: number | null;
};

export type MatchEvidence = {
  attribute: string;
  value: string;
  direction: "positive" | "negative";
  source: "explicit" | "memory" | "profile" | "similarity";
  impact: number;
};

export type MatchResult = {
  score: number;
  confidence: "low" | "medium" | "high";
  evidence: MatchEvidence[];
};

const TEXT_WEIGHTS: Record<string, number> = {
  grape: 16,
  region: 12,
  wine_type: 11,
  producer: 8,
  aroma: 7,
};

const NUMERIC_ATTRIBUTES = ["body", "tannin", "acidity", "sweetness", "oak", "fruit"] as const;

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textualValues(candidate: RecommendationCandidate, attribute: string) {
  if (attribute === "grape") return candidate.grape_varieties ?? [];
  if (attribute === "region") return [candidate.region];
  if (attribute === "wine_type") return [candidate.wine_type];
  if (attribute === "producer") return [candidate.producer];
  if (attribute === "aroma") {
    return [
      ...(candidate.primary_notes ?? []),
      ...(candidate.secondary_notes ?? []),
      ...(candidate.tertiary_notes ?? []),
    ];
  }
  return [];
}

function matchesText(candidate: RecommendationCandidate, attribute: string, expected: string) {
  const normalizedExpected = normalize(expected);
  if (!normalizedExpected) return false;
  return textualValues(candidate, attribute).some((value) => {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return false;
    return (
      normalizedValue === normalizedExpected ||
      normalizedValue.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedValue)
    );
  });
}

function numericValue(candidate: RecommendationCandidate, attribute: string) {
  if (!NUMERIC_ATTRIBUTES.includes(attribute as (typeof NUMERIC_ATTRIBUTES)[number])) return null;
  return finiteNumber(candidate[attribute as (typeof NUMERIC_ATTRIBUTES)[number]]);
}

function numericFit(actual: number, preferred: number) {
  return clamp(1 - Math.abs(actual - preferred) / 7, 0, 1);
}

function addEvidence(
  evidence: MatchEvidence[],
  attribute: string,
  value: string,
  contribution: number,
  source: MatchEvidence["source"],
) {
  if (Math.abs(contribution) < 1) return;
  evidence.push({
    attribute,
    value,
    direction: contribution >= 0 ? "positive" : "negative",
    source,
    impact: Math.round(Math.abs(contribution) * 10) / 10,
  });
}

export function scorePersonalizedCandidate(
  candidate: RecommendationCandidate,
  profile: ExplicitTasteProfile | null | undefined,
  preferences: RecommendationPreference[],
): MatchResult {
  let score = 50;
  const evidence: MatchEvidence[] = [];

  const explicit = [
    ["wine_type", profile?.preferred_types ?? [], 10],
    ["region", profile?.preferred_regions ?? [], 11],
    ["grape", profile?.preferred_grapes ?? [], 14],
  ] as const;

  for (const [attribute, values, weight] of explicit) {
    const match = values.find((value) => matchesText(candidate, attribute, value));
    if (!match) continue;
    score += weight;
    addEvidence(evidence, attribute, match, weight, "explicit");
  }

  for (const attribute of NUMERIC_ATTRIBUTES) {
    const actual = numericValue(candidate, attribute);
    const preferred = finiteNumber(profile?.[attribute]);
    if (actual == null || preferred == null) continue;
    const contribution = (numericFit(actual, preferred) * 2 - 1) * 5;
    score += contribution;
    addEvidence(evidence, attribute, `${actual}/10`, contribution, "profile");
  }

  for (const preference of preferences) {
    const confidence = clamp(finiteNumber(preference.confidence) ?? 0, 0, 1);
    const preferenceScore = clamp(finiteNumber(preference.preference_score) ?? 0, -1, 1);
    const evidenceFactor = clamp(Math.log2(Math.max(1, preference.evidence_count) + 1) / 2, 0.5, 1);
    if (confidence < 0.35 || Math.abs(preferenceScore) < 0.15) continue;

    if (preference.value_text && TEXT_WEIGHTS[preference.attribute]) {
      if (!matchesText(candidate, preference.attribute, preference.value_text)) continue;
      const contribution =
        TEXT_WEIGHTS[preference.attribute] * preferenceScore * confidence * evidenceFactor;
      score += contribution;
      addEvidence(evidence, preference.attribute, preference.value_text, contribution, "memory");
      continue;
    }

    const actual = numericValue(candidate, preference.attribute);
    const preferred = finiteNumber(preference.value_number);
    if (actual == null || preferred == null) continue;
    const fit = numericFit(actual, preferred);
    const contribution =
      7 * confidence * evidenceFactor * (preferenceScore >= 0 ? fit : -(fit || 0));
    score += contribution;
    addEvidence(evidence, preference.attribute, `${actual}/10`, contribution, "memory");
  }

  const rankedEvidence = evidence
    .sort((a, b) => b.impact - a.impact)
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidateItem) =>
            candidateItem.attribute === item.attribute &&
            candidateItem.value === item.value &&
            candidateItem.direction === item.direction,
        ) === index,
    )
    .slice(0, 5);
  const evidenceStrength = rankedEvidence.reduce((sum, item) => sum + item.impact, 0);
  const confidence = evidenceStrength >= 28 ? "high" : evidenceStrength >= 10 ? "medium" : "low";

  return { score: Math.round(clamp(score, 20, 98)), confidence, evidence: rankedEvidence };
}

export function rankPersonalizedCandidates<T extends RecommendationCandidate>(
  candidates: T[],
  profile: ExplicitTasteProfile | null | undefined,
  preferences: RecommendationPreference[],
) {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      ...scorePersonalizedCandidate(candidate, profile, preferences),
      original_rank: index,
    }))
    .sort((a, b) => b.score - a.score || a.original_rank - b.original_rank);
}

export function scoreWineSimilarity(
  reference: RecommendationCandidate,
  candidate: RecommendationCandidate,
): MatchResult {
  let score = 30;
  const evidence: MatchEvidence[] = [];

  if (
    normalize(reference.wine_type) &&
    normalize(reference.wine_type) === normalize(candidate.wine_type)
  ) {
    score += 18;
    addEvidence(evidence, "wine_type", String(candidate.wine_type), 18, "similarity");
  }

  const referenceGrapes = (reference.grape_varieties ?? []).map(normalize).filter(Boolean);
  const sharedGrapes = (candidate.grape_varieties ?? []).filter((grape) =>
    referenceGrapes.includes(normalize(grape)),
  );
  if (sharedGrapes.length) {
    const contribution = Math.min(34, 18 + sharedGrapes.length * 8);
    score += contribution;
    addEvidence(evidence, "grape", sharedGrapes.join(", "), contribution, "similarity");
  }

  if (normalize(reference.region) && normalize(reference.region) === normalize(candidate.region)) {
    score += 14;
    addEvidence(evidence, "region", String(candidate.region), 14, "similarity");
  } else if (
    normalize(reference.country) &&
    normalize(reference.country) === normalize(candidate.country)
  ) {
    score += 6;
    addEvidence(evidence, "country", String(candidate.country), 6, "similarity");
  }

  for (const attribute of NUMERIC_ATTRIBUTES) {
    const left = numericValue(reference, attribute);
    const right = numericValue(candidate, attribute);
    if (left == null || right == null) continue;
    const contribution = numericFit(left, right) * 4;
    score += contribution;
    addEvidence(evidence, attribute, `${right}/10`, contribution, "similarity");
  }

  const referenceNotes = new Set(
    [
      ...(reference.primary_notes ?? []),
      ...(reference.secondary_notes ?? []),
      ...(reference.tertiary_notes ?? []),
    ]
      .map(normalize)
      .filter(Boolean),
  );
  const sharedNotes = [
    ...(candidate.primary_notes ?? []),
    ...(candidate.secondary_notes ?? []),
    ...(candidate.tertiary_notes ?? []),
  ].filter((note) => referenceNotes.has(normalize(note)));
  if (sharedNotes.length) {
    const contribution = Math.min(10, sharedNotes.length * 3);
    score += contribution;
    addEvidence(evidence, "aroma", sharedNotes.join(", "), contribution, "similarity");
  }

  const rankedEvidence = evidence.sort((a, b) => b.impact - a.impact).slice(0, 5);
  const confidence =
    rankedEvidence.length >= 4 ? "high" : rankedEvidence.length >= 2 ? "medium" : "low";
  return { score: Math.round(clamp(score, 20, 98)), confidence, evidence: rankedEvidence };
}
