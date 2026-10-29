import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  availableCarbs,
  compareLimit,
  emptyBinding,
  estimateRecipe,
  referenceSchema,
  resolveBinding,
  substitutionPrompt,
  type Binding,
  type FoodReference,
} from "./domain";
import { parseSlvRecord, referenceFoods } from "./catalog";
import snapshot from "./slv-reference.json";
import { startingRecipes } from "../kitchen/catalog";
import { independentEnvironment } from "../../../config/independent/environment";
const reference: FoodReference = {
  id: "test",
  name: "Testetikett",
  form: "raw",
  convention: "EU",
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
      resolveBinding(binding({ reference: { ...reference, fiber: null } })).macros?.fiber,
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
    expect(resolveBinding(binding({ grams })).macros).toBeNull(),
  );
  it("requires actual matching food state and confirmation", () => {
    expect(resolveBinding(binding({ weighedForm: "cooked" })).macros).toBeNull();
    expect(resolveBinding(binding({ confirmed: false })).macros).toBeNull();
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
    expect(estimateRecipe(r, {}, 2).total.carbs).toBe(0);
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
    expect(referenceFoods).toHaveLength(19);
    const tomato = referenceFoods.find((r) => r.id === "slv:364")!;
    expect(tomato.carbs).toBe(2.6);
    expect(tomato.fiber).toBe(1.3);
    expect(tomato.convention).toBe("EU");
    expect(tomato.source.kind).toBe("slv");
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
  it("does not turn a missing source nutrient into zero", () => {
    const original = snapshot.records[0];
    const r = { ...original, nutrients: original.nutrients.filter((n) => n.euroFIRkod !== "CHO") };
    expect(parseSlvRecord(r, snapshot).carbs).toBeNull();
  });
  it("has no persistence, provider call, household or tracking integration", () => {
    const s = readFileSync("src/features/nutrition/NutritionPanel.tsx", "utf8");
    expect(s).not.toMatch(
      /localStorage|indexedDB|sessionStorage|supabase|askChef|food_memory_change|familyChange/,
    );
  });
});
