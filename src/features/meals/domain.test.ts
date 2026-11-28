import { describe, expect, it } from "vitest";
import {
  assessPairing,
  dinerDocumentSchema,
  familyFit,
  inferDishTraits,
  mealInputSchema,
  rankPairingWines,
  pairingAudience,
  type Diner,
  type PairingWine,
} from "./domain";
import { startingRecipes } from "../kitchen/catalog";
const owner = "a0000000-0000-4000-8000-000000000001";
const wine: PairingWine = {
  id: "b0000000-0000-4000-8000-000000000001",
  user_id: owner,
  wine_name: "Known",
  vintage: 2023,
  wine_type: "white",
  quantity: 2,
  consumed_at: null,
  image_url: null,
  body: 6,
  acidity: 8,
  tannin: 1,
  sweetness: 2,
  grape_varieties: [],
  region: null,
  country: null,
};
describe("pairing audience consent scope", () => {
  const adult: Diner = {
    id: "c0000000-0000-4000-8000-000000000001",
    user_id: owner,
    household_id: null,
    shared: false,
    revision: 1,
    created_at: "synthetic",
    updated_at: "synthetic",
    document: { name: "Synthetic adult", kind: "adult", preferences: [] },
  };
  const child: Diner = {
    ...adult,
    id: "c0000000-0000-4000-8000-000000000002",
    document: { name: "Synthetic child", kind: "child", preferences: [] },
  };
  it("distinguishes unavailable reads from a successfully loaded empty selection", () => {
    expect(pairingAudience(null, []).consentKey).toBeNull();
    expect(pairingAudience([], []).consentKey).not.toBeNull();
  });
  it("never silently drops an unavailable selected diner", () => {
    const result = pairingAudience([child], [adult.id, child.id]);
    expect(result.missing).toBe(true);
    expect(result.consentKey).toBeNull();
    expect(result.onlyChildren).toBe(false);
  });
  it("uses selected profiles only, without assuming every available adult is dining", () => {
    const result = pairingAudience([adult, child], [child.id]);
    expect(result.diners).toEqual([child]);
    expect(result.onlyChildren).toBe(true);
    expect(pairingAudience([adult, child], []).diners).toEqual([]);
  });
  it("keeps the same scope for reordered results and duplicate selected IDs", () => {
    expect(pairingAudience([adult, child], [child.id, adult.id, adult.id]).consentKey).toBe(
      pairingAudience([child, adult], [adult.id, child.id]).consentKey,
    );
  });
  it("invalidates consent when a selected profile revision changes", () => {
    expect(pairingAudience([{ ...adult, revision: 2 }], [adult.id]).consentKey).not.toBe(
      pairingAudience([adult], [adult.id]).consentKey,
    );
  });
  it("includes profile kind even when a malformed update reused an old revision", () => {
    const result = pairingAudience(
      [{ ...adult, document: { ...adult.document, kind: "child" } }],
      [adult.id],
    );
    expect(result.onlyChildren).toBe(true);
    expect(result.consentKey).not.toBe(pairingAudience([adult], [adult.id]).consentKey);
  });
  it("does not invalidate consent for an unselected profile change", () => {
    expect(pairingAudience([adult, { ...child, revision: 2 }], [adult.id]).consentKey).toBe(
      pairingAudience([adult, child], [adult.id]).consentKey,
    );
  });
  it("retains shared profiles already authorized by the existing RLS read", () => {
    const shared = { ...adult, user_id: "synthetic-other-member", shared: true };
    expect(pairingAudience([shared], [shared.id]).diners).toEqual([shared]);
  });
});
describe("meal pairing evidence", () => {
  it("explains known acid and body without a percentage", () => {
    const r = assessPairing(wine, ["rich", "acidic"]);
    expect(r.label).toBe("Bra utgångspunkt");
    expect(r.evidence.length).toBeGreaterThan(1);
    expect(JSON.stringify(r)).not.toContain("%");
  });
  it("retains missing attributes rather than inferring from color", () => {
    const r = assessPairing({ ...wine, acidity: null, body: null }, ["rich"]);
    expect(r.label).toBe("Begränsat underlag");
    expect(r.unknown).toHaveLength(2);
    expect(r.evidence).toHaveLength(0);
  });
  it("warns about high tannin with heat and acknowledges missing alcohol", () => {
    const r = assessPairing({ ...wine, tannin: 9 }, ["hot"]);
    expect(r.label).toBe("Kan krocka");
    expect(r.cautions.length).toBe(1);
    expect(r.unknown).toContain("Alkoholhalt bedöms inte i denna matchning.");
  });
  it("does not treat an unknown dish as mild", () => {
    const r = structuredClone(startingRecipes[0]);
    r.ingredients = r.ingredients.map((i) => ({ ...i, name: "Okänd ingrediens" }));
    expect(inferDishTraits(r)).toEqual([]);
    expect(assessPairing(wine, []).label).toBe("Begränsat underlag");
  });
  it("does not mistake rostad for ost", () => {
    const r = structuredClone(startingRecipes[0]);
    r.ingredients = r.ingredients.map((i) => ({ ...i, name: "Rostad morot" }));
    expect(inferDishTraits(r)).not.toContain("rich");
  });
  it("only ranks owned unconsumed stock", () => {
    expect(
      rankPairingWines(
        [
          wine,
          { ...wine, id: crypto.randomUUID(), user_id: crypto.randomUUID() },
          { ...wine, id: crypto.randomUUID(), quantity: 0 },
          { ...wine, id: crypto.randomUUID(), consumed_at: new Date().toISOString() },
        ],
        owner,
        ["rich"],
      ),
    ).toHaveLength(1);
  });
  it("separates incompatible, possible and insufficient evidence", () => {
    expect(assessPairing({ ...wine, sweetness: 0 }, ["sweet"]).label).toBe("Kan krocka");
    expect(assessPairing(wine, ["acidic"]).label).toBe("Möjlig kombination");
  });
});
describe("per-person preferences", () => {
  it("keeps child and adult preferences separate", () => {
    const r = structuredClone(startingRecipes[0]);
    r.ingredients[0].name = "Svamp";
    const diner = {
      document: {
        name: "Barn",
        kind: "child",
        preferences: [{ attribute: "ingredient", value: "svamp", direction: -1 }],
      },
    } as Diner;
    expect(familyFit(r, [diner]).conflicts).toEqual(["Barn: undviker svamp"]);
    expect(familyFit(r, []).conflicts).toEqual([]);
  });
  it("does not pretend to evaluate equipment or cuisine from ingredients", () => {
    const d = {
      document: {
        name: "A",
        kind: "adult",
        preferences: [{ attribute: "equipment", value: "ugn", direction: 1 }],
      },
    } as Diner;
    expect(familyFit(startingRecipes[0], [d]).unknown).toHaveLength(1);
  });
  it("normalizes explicit preferences", () => {
    expect(
      dinerDocumentSchema.parse({
        name: " A ",
        kind: "adult",
        preferences: [{ attribute: "ingredient", value: "  TOMAT ", direction: 1 }],
      }).preferences[0].value,
    ).toBe("tomat");
  });
  it.each(["allergi mot nötter", "diabetes", "gravid", "kidney disease"])(
    "rejects health preference %s",
    (value) => {
      expect(
        dinerDocumentSchema.safeParse({
          name: "A",
          kind: "child",
          preferences: [{ attribute: "ingredient", value, direction: -1 }],
        }).success,
      ).toBe(false);
    },
  );
  it("rejects duplicates, extra health fields and invalid directions", () => {
    const p = { attribute: "ingredient", value: "tomat", direction: 1 };
    expect(
      dinerDocumentSchema.safeParse({ name: "A", kind: "adult", preferences: [p, p] }).success,
    ).toBe(false);
    expect(
      dinerDocumentSchema.safeParse({ name: "A", kind: "adult", preferences: [], diagnosis: "x" })
        .success,
    ).toBe(false);
  });
  it("keeps ratings distinct and optional", () => {
    const input = {
      sessionId: crypto.randomUUID(),
      wineId: crypto.randomUUID(),
      wineRating: null,
      pairingRating: 2,
      note: "Bra",
    };
    expect(mealInputSchema.parse(input).wineRating).toBeNull();
    expect(mealInputSchema.safeParse({ ...input, wineRating: 6 }).success).toBe(false);
    expect(mealInputSchema.safeParse({ ...input, foodRating: 1 }).success).toBe(false);
  });
});
