export type TasteSimilarity = {
  similarity_score: number | null;
  similarity_confidence: number | null;
  shared_preference_count: number;
};

export type TasteSimilarityLevel = "strong" | "some" | "low" | "learning";

export function tasteSimilarityLevel(input: TasteSimilarity): TasteSimilarityLevel {
  const score = Number(input.similarity_score);
  const confidence = Number(input.similarity_confidence);
  const shared = Number(input.shared_preference_count);
  if (!Number.isFinite(score) || confidence < 0.2 || shared < 2) return "learning";
  if (score >= 0.72 && confidence >= 0.45 && shared >= 4) return "strong";
  if (score >= 0.55 && confidence >= 0.25) return "some";
  return "low";
}

export function socialDiscoveryRank(
  input: TasteSimilarity & { is_following: boolean; recent_public_wines?: number },
) {
  const score = Number(input.similarity_score) || 0;
  const confidence = Number(input.similarity_confidence) || 0;
  const activity = Math.min(10, Math.max(0, Number(input.recent_public_wines) || 0));
  return score * confidence * 100 + (input.is_following ? 12 : 0) + activity * 0.5;
}
