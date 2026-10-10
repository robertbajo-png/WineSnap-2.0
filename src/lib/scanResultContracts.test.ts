import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("scan result integration", () => {
  const route = readFileSync(new URL("../routes/scan.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../routes/wine.$id.tsx", import.meta.url), "utf8");

  it("keeps the review screen after save and guards duplicate inserts", () => {
    expect(route).toContain("saveGuardRef.current.tryStart()");
    expect(route).toContain("savedIdRef.current = inserted.id");
    expect(route).toContain("saved={savedId !== null}");
    expect(route).not.toContain('setStage("match")');
    expect(route).not.toContain("MatchFound");
  });

  it("preserves the original AI record and never deletes a saved image on back", () => {
    expect(route).toContain("ai_raw: originalWine");
    expect(route).toContain("if (saving || savedIdRef.current) return");
    expect(route).not.toContain("setPreviewUrl(null);\n      setStage");
  });

  it("uses personal tasting notes instead of deriving a star rating from taste intensity", () => {
    expect(detail).not.toContain("computeRating");
    expect(detail).toContain("wineRating(w)");
    expect(detail).toContain("tasting_notes(rating,created_at,user_id)");
    expect(detail).toContain('"wine.yourRating"');
    expect(detail).toContain('"wine.ownerRating"');
    expect(detail).toContain("rating != null");
  });
});
