import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("recommendation backend contracts", () => {
  it("keeps personal ranking server-side and outside the AI schema", () => {
    const tasteSuggestions = source("supabase/functions/taste-suggestions/index.ts");

    expect(tasteSuggestions).toContain("rankPersonalizedCandidates");
    expect(tasteSuggestions).toContain('.eq("id", access.userId)');
    expect(tasteSuggestions).toContain('.eq("user_id", access.userId)');
    expect(tasteSuggestions).not.toContain('match_score: { type: "number"');
  });

  it("loads and authorizes the reference wine before similarity scoring", () => {
    const wineSuggestions = source("supabase/functions/wine-suggestions/index.ts");

    expect(wineSuggestions).toContain("scoreWineSimilarity");
    expect(wineSuggestions).toContain("wine.user_id !== access.userId && !wine.is_public");
    expect(wineSuggestions).not.toContain('match_score: { type: "number"');
  });

  it("stores feedback behind owner-only RLS", () => {
    const migration = source("supabase/migrations/20260926090000_add_recommendation_feedback.sql");

    expect(migration.toLowerCase()).toContain(
      "alter table public.recommendation_events enable row level security",
    );
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("sync_recommendation_feedback_signals");
    expect(migration).toContain("recommendation_events_single_feedback_idx");
  });
});
