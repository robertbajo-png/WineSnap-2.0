import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("restaurant menu contracts", () => {
  it("loads private taste data server-side and keeps scores outside the AI schema", () => {
    const edgeFunction = source("supabase/functions/restaurant-match/index.ts");

    expect(edgeFunction).toContain("rankRestaurantCandidates");
    expect(edgeFunction).toContain('.eq("id", access.userId)');
    expect(edgeFunction).toContain('.eq("user_id", access.userId)');
    expect(edgeFunction).toContain('from("derived_preferences")');
    expect(edgeFunction).not.toContain('match_score: { type: "number"');
    expect(edgeFunction).not.toContain("requestBody.profile");
  });

  it("validates transient images before sending them to the gateway", () => {
    const edgeFunction = source("supabase/functions/restaurant-match/index.ts");

    expect(edgeFunction).toContain("validImageDataUrl");
    expect(edgeFunction).toContain("6 * 1024 * 1024");
    expect(edgeFunction).toContain("AbortSignal.timeout");
  });

  it("does not trust client taste data or persist new menu photos", () => {
    const route = source("src/routes/restaurant.tsx");

    expect(route).not.toContain('.from("profiles")');
    expect(route).not.toContain('.from("taste_profile")');
    expect(route).toContain("image_url: null");
    expect(route).toContain('recordRecommendationEvent(eventType, "restaurant"');
    expect(route).toContain('source: "restaurant"');
  });

  it("stores structured menu context behind the existing owner RLS", () => {
    const migration = source(
      "supabase/migrations/20260928090000_add_restaurant_menu_mode.sql",
    ).toLowerCase();
    const originalMigration = source(
      "supabase/migrations/20260720214457_36b7d2fd-ec14-49ca-96c0-49e7fa962596.sql",
    ).toLowerCase();

    expect(migration).toContain("add column constraints jsonb");
    expect(migration).toContain("add column extracted_wines jsonb");
    expect(migration).toContain("'restaurant'");
    expect(originalMigration).toContain("auth.uid() = user_id");
  });
});
