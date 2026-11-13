import { supabase } from "@/integrations/supabase/client";
import type { RecommendationCandidate } from "@/lib/recommendationEngine";
import { accountWriteClient, type AccountWriteScope } from "./accountWriteScope";

export type RecommendationEventType =
  "impression" | "open" | "save" | "like" | "dislike" | "dismiss" | "compare";

export type RecommendationSource =
  "for_you" | "similar" | "compare" | "ask" | "social" | "restaurant";

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
  scope?: AccountWriteScope,
) {
  let client = supabase;
  let owner: string;
  if (scope) {
    try {
      client = await accountWriteClient(scope);
      owner = scope.owner;
    } catch {
      return false;
    }
  } else {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return false;
    owner = data.user.id;
  }
  if (scope && !scope.current()) return false;
  const candidateKey = recommendationKey(candidate);
  if (!candidateKey) return false;

  if (eventType === "like" || eventType === "dislike") {
    const { error: replaceError } = await client
      .from("recommendation_events")
      .delete()
      .eq("user_id", owner)
      .eq("source", source)
      .eq("candidate_key", candidateKey)
      .in("event_type", ["like", "dislike"]);
    if (replaceError) {
      console.error("Could not replace recommendation feedback", replaceError);
      return false;
    }
  }

  if (scope && !scope.current()) return false;
  const { error } = await client.from("recommendation_events").insert({
    user_id: owner,
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
  return !scope || scope.current();
}
