import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260927090000_add_social_discovery.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("social discovery database contracts", () => {
  it("keeps taste similarity private to the requesting user", () => {
    expect(migration).toContain(
      "alter table public.user_taste_similarity enable row level security",
    );
    expect(migration).toContain("using (auth.uid() = user_id)");
    expect(migration).toContain(
      "revoke all on public.user_taste_similarity from public, anon, authenticated",
    );
  });

  it("requires authentication and returns aggregate similarity only", () => {
    expect(migration).toContain("viewer_id uuid := auth.uid()");
    expect(migration).toContain("authentication required");
    expect(migration).not.toContain("returns table (\n  preference_key");
  });

  it("limits discovery to public profiles and public wines", () => {
    expect(migration).toContain("profile.is_public = true");
    expect(migration).toContain("wine.is_public = true");
  });
});
