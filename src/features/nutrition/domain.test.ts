import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  availableCarbs,
  compareLimit,
  emptyBinding,
  estimateRecipe,
  recipeSubstitutionDraft,
  referenceSchema,
  resolveBinding,
  substitutionPrompt,
  type Binding,
  type FoodReference,
} from "./domain";
import { parseSlvRecord, referenceFoods, suggestedSwap } from "./catalog";
import snapshot from "./slv-reference.json";
import { startingRecipes } from "../kitchen/catalog";
import { independentEnvironment } from "../../../config/independent/environment";
const reference: FoodReference = {
  id: "test",
  name: "Testetikett",
  form: "raw",
  convention: "EU",
  energyKcal: 112,
  carbs: 10,
  fiber: 4,
  protein: 2,
  fat: 3,
  source: { kind: "label", label: "Syntetisk testetikett" },
};
const binding = (patch: Partial<Binding> = {}): Binding => ({
  reference,
  grams: 100,
  weighedForm: "raw",
  confirmed: true,
  ...patch,
});
const recipe = () => ({
  ...structuredClone(startingRecipes[0]),
  ingredients: [
    { id: crypto.randomUUID(), name: "Test 1", amount: 100, unit: "g" as const },
    { id: crypto.randomUUID(), name: "Test 2", amount: 50, unit: "g" as const },
  ],
});
describe("nutrition conventions and missing data", () => {
  it("never subtracts EU fiber twice", () => expect(availableCarbs(reference)).toBe(10));
  it("subtracts explicit fiber once for US total", () =>
    expect(availableCarbs({ ...reference, convention: "US" })).toBe(6));
  it("does not infer missing US fiber as zero", () =>
    expect(availableCarbs({ ...reference, convention: "US", fiber: null })).toBeNull());
  it("EU carbohydrate remains usable when fiber is unknown", () => {
    expect(availableCarbs({ ...reference, fiber: null })).toBe(10);
    expect(
      resolveBinding(binding({ reference: { ...reference, fiber: null } })).nutrients?.fiber,
    ).toBeNull();
  });
  it("distinguishes explicit zero from missing", () => {
    expect(availableCarbs({ ...reference, carbs: 0 })).toBe(0);
    expect(availableCarbs({ ...reference, carbs: null })).toBeNull();
  });
  it.each([NaN, Infinity, -1, 101])("rejects impossible per-100g value %s", (n) =>
    expect(referenceSchema.safeParse({ ...reference, carbs: n }).success).toBe(false),
  );
  it("rejects US fiber exceeding total and extra fields", () => {
    expect(referenceSchema.safeParse({ ...reference, convention: "US", fiber: 11 }).success).toBe(
      false,
    );
    expect(referenceSchema.safeParse({ ...reference, ketones: 1 }).success).toBe(false);
  });
  it("requires named provenance and valid basis", () => {
    expect(
      referenceSchema.safeParse({ ...reference, source: { kind: "label", label: "" } }).success,
    ).toBe(false);
    expect(referenceSchema.safeParse({ ...reference, form: "unknown" }).success).toBe(false);
  });
});
describe("portion, quantity and precision", () => {
  it.each(["ml", "dl", "l", "tsp", "tbsp", "pcs", "pinch"] as const)(
    "does not invent gram density for %s",
    (unit) => {
      expect(
        emptyBinding({ id: crypto.randomUUID(), name: "Test", amount: 2, unit }).grams,
      ).toBeNull();
    },
  );
  it("converts only mass units without a density", () => {
    expect(
      emptyBinding({ id: crypto.randomUUID(), name: "A", amount: 1.25, unit: "kg" }).grams,
    ).toBe(1250);
  });
  it.each([null, NaN, Infinity, 0, -1, 100001])("rejects invalid edible grams %s", (grams) =>
    expect(resolveBinding(binding({ grams })).nutrients).toBeNull(),
  );
  it("requires actual matching food state and confirmation", () => {
    expect(resolveBinding(binding({ weighedForm: "cooked" })).nutrients).toBeNull();
    expect(resolveBinding(binding({ confirmed: false })).nutrients).toBeNull();
  });
  it("does not round each ingredient before summing", () => {
    const r = recipe();
    r.ingredients[0].amount = 0.14;
    r.ingredients[1].amount = 0.14;
    const b = Object.fromEntries(r.ingredients.map((i) => [i.id, binding({ grams: 0.14 })]));
    expect(estimateRecipe(r, b, 2).total.carbs).toBeCloseTo(0.028, 10);
  });
  it("scales total while per-serving amount stays unchanged", () => {
    const r = recipe(),
      b = Object.fromEntries(r.ingredients.map((i) => [i.id, binding({ grams: i.amount })]));
    const two = estimateRecipe(r, b, 2),
      six = estimateRecipe(r, b, 6);
    expect(two.perServing.carbs).toBe(7.5);
    expect(six.total.carbs).toBe(45);
    expect(six.perServing.carbs).toBe(two.perServing.carbs);
    expect(two.perServing.energyKcal).toBe(84);
    expect(six.total.energyKcal).toBe(504);
    expect(six.perServing.energyKcal).toBe(84);
  });
  it("keeps unknown energy separate from available nutrition without deriving it from macros", () => {
    const r = recipe();
    const b = Object.fromEntries(
      r.ingredients.map((i) => [
        i.id,
        binding({ grams: i.amount, reference: { ...reference, energyKcal: null } }),
      ]),
    );
    expect(estimateRecipe(r, b, 2).perServing).toMatchObject({ energyKcal: null, carbs: 7.5 });
  });
  it("can show complete energy even if a separate label value is unavailable", () => {
    const r = recipe();
    const b = Object.fromEntries(
      r.ingredients.map((i) => [
        i.id,
        binding({ grams: i.amount, reference: { ...reference, carbs: null } }),
      ]),
    );
    expect(estimateRecipe(r, b, 2).perServing).toMatchObject({ energyKcal: 84, carbs: null });
  });
  it("does not publish a total or a successful goal with unknown ingredients", () => {
    const r = recipe(),
      result = estimateRecipe(r, { [r.ingredients[0].id]: binding() }, 2);
    expect(result.known).toBe(1);
    expect(result.total.carbs).toBeNull();
    expect(result.complete).toBe(false);
    expect(compareLimit(result.perServing.carbs, 20)).toBe("unknown");
  });
  it("aggregates EU and US contributions once", () => {
    const r = recipe();
    const v = estimateRecipe(
      r,
      {
        [r.ingredients[0].id]: binding(),
        [r.ingredients[1].id]: binding({
          reference: { ...reference, convention: "US" },
          grams: 100,
        }),
      },
      2,
    );
    expect(v.total.carbs).toBe(16);
  });
  it("takes zero recipe quantities literally without fabricating a food reference", () => {
    const r = recipe();
    r.ingredients = r.ingredients.slice(0, 1);
    r.ingredients[0].amount = 0;
    expect(estimateRecipe(r, {}, 2).total).toMatchObject({ carbs: 0, energyKcal: 0 });
  });
  it("uses full precision at the user's voluntary recipe threshold", () => {
    expect(compareLimit(10.001, 10)).toBe("above");
    expect(compareLimit(10, 10)).toBe("within");
    expect(compareLimit(2, null)).toBe("unset");
  });
  it("does not mutate original recipes or assume substitution equivalence", () => {
    const r = recipe(),
      before = JSON.stringify(r);
    const b = { [r.ingredients[0].id]: binding(), [r.ingredients[1].id]: binding({ grams: 50 }) };
    const alt = {
      ...b,
      [r.ingredients[0].id]: binding({ reference: { ...reference, carbs: 2 }, grams: 300 }),
    };
    expect(estimateRecipe(r, b, 2).total.carbs).toBe(15);
    expect(estimateRecipe(r, alt, 2).total.carbs).toBe(11);
    expect(JSON.stringify(r)).toBe(before);
  });
  it("creates a separate valid local draft with only the selected ingredient changed", () => {
    const r = recipe(),
      original = structuredClone(r),
      id = r.ingredients[0].id;
    const substitute = binding({
      grams: 300,
      reference: { ...reference, name: "Syntetisk ersattare" },
    });
    const draft = recipeSubstitutionDraft(r, id, substitute)!;
    expect(draft.ingredients[0]).toEqual({
      id,
      name: "Syntetisk ersattare",
      amount: 300,
      unit: "g",
    });
    expect(draft.ingredients[1]).toEqual(original.ingredients[1]);
    expect(draft.steps).toEqual(original.steps);
    draft.steps[0].text = "Only in the unsaved draft";
    expect(r).toEqual(original);
    for (const invalid of [
      { grams: null },
      { confirmed: false },
      { weighedForm: "cooked" as const },
    ]) {
      expect(recipeSubstitutionDraft(r, id, { ...substitute, ...invalid })).toBeNull();
    }
    expect(recipeSubstitutionDraft(r, crypto.randomUUID(), substitute)).toBeNull();
  });
  it("hands Chef a culinary request, not a health profile, goal or numeric nutrition claim", () => {
    const prompt = substitutionPrompt("pasta", "squash", 300, 2);
    expect(prompt).toContain("tillagningssteg");
    expect(prompt).not.toMatch(/keto|ketone|diabet|net.?carb|gräns|barn/i);
  });
});
describe("audited public source contract", () => {
  it("keeps nutrition unavailable outside verified test cooking", () => {
    const base = {
      VITE_SUPABASE_URL: "https://pzniyupmgwvlldvztzqh.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_nutrition_check",
      VITE_RECIPE_NUTRITION_ENABLED: "true",
      VITE_COOKING_CORE_ENABLED: "true",
      VITE_PRIVACY_CONTROLS_ENABLED: "true",
      VITE_PRIVACY_OPERATIONS_VERIFIED: "true",
    };
    expect(independentEnvironment("production", base).VITE_RECIPE_NUTRITION_ENABLED).toBe("true");
    expect(() =>
      independentEnvironment("production", { ...base, VITE_COOKING_CORE_ENABLED: "false" }),
    ).toThrow();
    expect(() =>
      independentEnvironment("production", { ...base, VITE_SUPABASE_URL: "https://other.invalid" }),
    ).toThrow();
    expect(independentEnvironment("runtime-check", base).VITE_RECIPE_NUTRITION_ENABLED).toBe(
      "false",
    );
  });
  it("preserves source values and record provenance without an external request", () => {
    expect(referenceFoods).toHaveLength(41);
    const tomato = referenceFoods.find((r) => r.id === "slv:364")!;
    expect(tomato.energyKcal).toBe(18);
    expect(tomato.carbs).toBe(2.6);
    expect(tomato.fiber).toBe(1.3);
    expect(tomato.convention).toBe("EU");
    expect(tomato.source.kind).toBe("slv");
    expect(referenceFoods.find((r) => r.id === "slv:846")?.form).toBe("cooked");
    expect(referenceFoods.find((r) => r.id === "slv:845")?.form).toBe("dry");
  });
  it("verifies all imported record hashes and per-100g edible units", () => {
    for (const record of snapshot.records) {
      expect(
        createHash("sha256")
          .update(JSON.stringify({ food: record.food, nutrients: record.nutrients }))
          .digest("hex"),
      ).toBe(record.sha256);
      expect(() => parseSlvRecord(record, snapshot)).not.toThrow();
    }
  });
  it("suggests a sourced alternative only for curated records with known carb values", () => {
    const pasta = referenceFoods.find((r) => r.id === "slv:845")!;
    expect(suggestedSwap(pasta)?.id).toBe("slv:362");
    expect(suggestedSwap({ ...pasta, carbs: null })).toBeNull();
    expect(suggestedSwap({ ...reference, id: pasta.id })).toBeNull();
    expect(suggestedSwap(referenceFoods.find((r) => r.id === "slv:364"))).toBeNull();
  });
  it("does not turn a missing source nutrient into zero", () => {
    const original = snapshot.records[0];
    const r = {
      ...original,
      nutrients: original.nutrients.filter((n) => !["CHO", "ENERC"].includes(n.euroFIRkod)),
    };
    expect(parseSlvRecord(r, snapshot)).toMatchObject({ carbs: null, energyKcal: null });
  });
  it("rejects an energy record in kJ and inconsistent portion basis or duplicates", () => {
    const original = snapshot.records.find((r) => r.id === 364)!;
    const energy = original.nutrients.find((n) => n.euroFIRkod === "ENERC")!;
    expect(energy?.enhet).toBe("kcal");
    const others = original.nutrients.filter((n) => n !== energy);
    for (const alternative of [{ enhet: "kJ" }, { viktGram: 50 }, { matrisenhetkod: "UNKNOWN" }]) {
      expect(() =>
        parseSlvRecord(
          { ...original, nutrients: [...others, { ...energy, ...alternative }] },
          snapshot,
        ),
      ).toThrow();
    }
    expect(() => parseSlvRecord({ ...original, nutrients: [energy, energy] }, snapshot)).toThrow();
  });
  it("has no persistence, provider call, household or tracking integration", () => {
    const s = readFileSync("src/features/nutrition/NutritionPanel.tsx", "utf8");
    expect(s).not.toMatch(
      /localStorage|indexedDB|sessionStorage|supabase|askChef|food_memory_change|familyChange/,
    );
  });
});
