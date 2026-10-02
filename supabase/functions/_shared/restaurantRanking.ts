import {
  scorePersonalizedCandidate,
  type ExplicitTasteProfile,
  type MatchEvidence,
  type RecommendationCandidate,
  type RecommendationPreference,
} from "./recommendationScoring.ts";

export type RestaurantMode = "familiar" | "balanced" | "adventurous";
export type DishFit = "excellent" | "good" | "neutral" | "poor";
export type BudgetFit = "in_budget" | "over_budget" | "unknown";

export type RestaurantCandidate = RecommendationCandidate & {
  producer?: string | null;
  wine_name: string;
  price?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  menu_line?: string | null;
  dish_fit?: DishFit | null;
  style_reason?: string | null;
  food_reason?: string | null;
};

export type RestaurantConstraints = {
  maxPrice?: number | null;
  mode?: RestaurantMode;
};

export type RankedRestaurantCandidate = RestaurantCandidate & {
  match_score: number;
  match_confidence: "low" | "medium" | "high";
  match_evidence: MatchEvidence[];
  budget_fit: BudgetFit;
  selection_style: RestaurantMode;
};

function finitePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseMenuPrice(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { amount: null, currency: null };

  const compact = raw.replace(/\u00a0/g, " ");
  const match = compact.match(/\d[\d\s.,]*/);
  if (!match) return { amount: null, currency: null };

  let numeric = match[0].replace(/\s/g, "");
  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");
  const decimalIndex = Math.max(comma, dot);
  if (decimalIndex >= 0 && numeric.length - decimalIndex - 1 <= 2) {
    const integer = numeric.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decimals = numeric.slice(decimalIndex + 1).replace(/[.,]/g, "");
    numeric = `${integer}.${decimals}`;
  } else {
    numeric = numeric.replace(/[.,]/g, "");
  }

  const amount = finitePositiveNumber(numeric);
  const lower = compact.toLowerCase();
  const currency =
    lower.includes("sek") || lower.includes("kr")
      ? "SEK"
      : lower.includes("eur") || compact.includes("€")
        ? "EUR"
        : lower.includes("usd") || compact.includes("$")
          ? "USD"
          : lower.includes("gbp") || compact.includes("£")
            ? "GBP"
            : null;
  return { amount, currency };
}

function dishBonus(fit: DishFit | null | undefined) {
  if (fit === "excellent") return 12;
  if (fit === "good") return 6;
  if (fit === "poor") return -12;
  return 0;
}

function modeAdjustedScore(score: number, mode: RestaurantMode) {
  if (mode === "familiar") return score + (score >= 75 ? 7 : score < 55 ? -8 : 0);
  if (mode === "adventurous") return 100 - Math.abs(score - 60) * 1.5;
  return score;
}

function selectionStyle(score: number): RestaurantMode {
  if (score >= 75) return "familiar";
  if (score >= 55) return "balanced";
  return "adventurous";
}

export function rankRestaurantCandidates(
  candidates: RestaurantCandidate[],
  profile: ExplicitTasteProfile | null | undefined,
  preferences: RecommendationPreference[],
  constraints: RestaurantConstraints = {},
): RankedRestaurantCandidate[] {
  const maxPrice = finitePositiveNumber(constraints.maxPrice);
  const mode = constraints.mode ?? "balanced";

  return candidates
    .map((candidate, originalRank) => {
      const parsedPrice = parseMenuPrice(candidate.price);
      const amount = finitePositiveNumber(candidate.price_amount) ?? parsedPrice.amount;
      const currency = candidate.price_currency ?? parsedPrice.currency;
      const match = scorePersonalizedCandidate(candidate, profile, preferences);
      const budgetFit: BudgetFit =
        maxPrice == null || amount == null
          ? "unknown"
          : amount <= maxPrice
            ? "in_budget"
            : "over_budget";
      const rankScore =
        modeAdjustedScore(match.score, mode) +
        dishBonus(candidate.dish_fit) -
        (budgetFit === "over_budget" ? 40 : budgetFit === "unknown" && maxPrice ? 3 : 0);

      return {
        ...candidate,
        price_amount: amount,
        price_currency: currency,
        match_score: match.score,
        match_confidence: match.confidence,
        match_evidence: match.evidence,
        budget_fit: budgetFit,
        selection_style: selectionStyle(match.score),
        rankScore,
        originalRank,
      };
    })
    .sort((left, right) => {
      const budgetOrder = { in_budget: 0, unknown: 1, over_budget: 2 } as const;
      return (
        budgetOrder[left.budget_fit] - budgetOrder[right.budget_fit] ||
        right.rankScore - left.rankScore ||
        left.originalRank - right.originalRank
      );
    })
    .map(({ rankScore: _rankScore, originalRank: _originalRank, ...candidate }) => candidate);
}
