import { supabase } from "@/integrations/supabase/client";
import type { RecommendationCandidate } from "@/lib/recommendationEngine";

export type RecommendationEventType =
  | "impression"
  | "open"
  | "save"
  | "like"
  | "dislike"
  | "dismiss"
  | "compare";

export type RecommendationSource = "for_you" | "similar" | "compare" | "ask";

export function recommendationKey(candidate: RecommendationCandidate) {
  return [candidate.producer, candidate.wine_name, candidate.vintage]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .join("|")
    .slice(0, 240);
}

export async function recordRecommendationEvent(
  eventType: RecommendationEventType,
  source: RecommendationSource,
  candidate: RecommendationCandidate,
  metadata: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const candidateKey = recommendationKey(candidate);
  if (!candidateKey) return false;

  const { error } = await supabase.from("recommendation_events").insert({
    user_id: data.user.id,
    wine_id: null,
    candidate_key: candidateKey,
    event_type: eventType,
    source,
    candidate: candidate as never,
    metadata: metadata as never,
  });
  if (error) {
    console.error("Could not record recommendation feedback", error);
    return false;
  }
  return true;
}
