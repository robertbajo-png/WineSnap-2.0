import { describe, expect, it } from "vitest";
import type { RecipeDocument, RecipeVersion } from "../kitchen/domain";
import { buildShoppingList, weekDates, weekForDate, weekPlanSchema, type WeekPlan } from "./domain";

const uuid = (n: number) => `11111111-1111-4111-8111-${n.toString(16).padStart(12, "0")}`;
const owner = uuid(1);
const monday = "2026-11-16";
const item = (
  n: number,
  name: string,
  amount: number,
  unit: RecipeDocument["ingredients"][0]["unit"],
) => ({ id: uuid(n), name, amount, unit });

function recipe(
  id: number,
  ingredients: RecipeDocument["ingredients"],
  servings = 2,
): RecipeVersion {
  return {
    id: uuid(id),
    recipe_id: uuid(99),
    user_id: owner,
    revision: id,
    created_at: "2026-11-16T12:00:00Z",
    document: {
      title: "Test recipe",
      description: "",
      servings,
      totalMinutes: 20,
      image: "none",
      sourceNote: "",
      notes: "",
      ingredients,
      steps: [{ id: uuid(98), title: "Cook", text: "Test only", timerSeconds: null }],
    },
  };
}

function week(meals: WeekPlan["meals"] = []): WeekPlan {
  return { weekStart: monday, meals, manualItems: [], shoppingEdits: [] };
}

const first = {
  date: monday,
  meal: "dinner",
  recipeVersionId: uuid(2),
  servings: 4,
} as const;
const second = {
  date: "2026-11-19",
  meal: "lunch",
  recipeVersionId: uuid(3),
  servings: 2,
} as const;

const flour = recipe(2, [item(10, "Fullkornsmjol", 250, "g"), item(11, "Olja", 2, "tbsp")]);
const secondFlour = recipe(3, [
  item(12, "FULLKORNSMJOL", 0.5, "kg"),
  item(13, "Olja", 1, "dl"),
  item(14, "Fullkornsmjol", 2, "dl"),
]);

function ready(plan: WeekPlan, versions: readonly unknown[]) {
  const result = buildShoppingList(owner, plan, versions);
  if (result.status !== "ready") throw Error("Expected a complete list");
  return result;
}

describe("weekly planning calendar and validation", () => {
  it("uses civil dates and Monday weeks across month, year and clock changes", () => {
    expect(weekForDate("2027-01-01")).toBe("2026-12-28");
    expect(weekDates("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(weekDates(weekForDate("2026-10-25")).at(-1)).toBe("2026-10-25");
    expect(weekForDate("2028-02-29")).toBe("2028-02-28");
    for (const date of ["2026-02-29", "2026-01-01T03:00:00Z", "2026-4-8"])
      expect(() => weekForDate(date)).toThrow();
  });

  it("rejects duplicate slots, days outside the week, invalid quantities and extra fields", () => {
    const invalid = [
      { ...week(), weekStart: "2026-11-17" },
      week([first, { ...first, recipeVersionId: uuid(3) }]),
      week([{ ...first, date: "2026-11-15" }]),
      week([{ ...first, date: "2026-11-23" }]),
      week([{ ...first, servings: 0 }]),
      week([{ ...first, servings: 24.5 }]),
      { ...week(), user_id: owner },
      {
        ...week(),
        manualItems: [
          { id: uuid(15), item: { name: "Citron", amount: 2, unit: null }, checked: false },
        ],
      },
    ];
    for (const value of invalid) expect(weekPlanSchema.safeParse(value).success).toBe(false);
  });
});

describe("deterministic shopping derivation", () => {
  it("keeps diner selection in the meal without changing recipe amounts or shopping edits", () => {
    const {
      recipeItems: [line],
    } = ready(week([first]), [flour]);
    const plan = {
      ...week([{ ...first, dinerIds: [uuid(28)] }]),
      shoppingEdits: [
        { key: line.key, basis: line.basis, checked: true, excluded: false, adjustment: null },
      ],
    };
    expect(weekPlanSchema.parse(plan).meals[0].dinerIds).toEqual([uuid(28)]);
    expect(ready(plan, [flour]).recipeItems[0]).toEqual({ ...line, checked: true });
    for (const dinerIds of [
      [],
      [uuid(28), uuid(28).toUpperCase()],
      Array.from({ length: 25 }, (_, index) => uuid(index)),
    ])
      expect(weekPlanSchema.safeParse(week([{ ...first, dinerIds }])).success).toBe(false);
  });

  it("scales servings, merges compatible units and never guesses density", () => {
    const result = ready(week([second, first]), [secondFlour, flour]);
    expect(
      result.recipeItems.map((line) => [line.name, line.unit, line.basis.knownAmount]),
    ).toEqual([
      ["Fullkornsmjol", "g", 1000],
      ["Fullkornsmjol", "ml", 200],
      ["Olja", "ml", 160],
    ]);
    expect(result).toEqual(ready(week([first, second]), [flour, secondFlour]));
    expect(result.recipeItems[0].basis.sources).toEqual([first, second]);
  });

  it("preserves unspecified amounts beside known amounts without guessing", () => {
    const version = recipe(2, [
      item(10, "Salt", 0, "pinch"),
      item(11, "Salt", 1, "pinch"),
      item(12, "Peppar", 0, "pinch"),
      item(13, "Peppar", 1, "g"),
    ]);
    const result = ready(week([first]), [version]);
    expect(
      result.recipeItems.map((line) => [
        line.name,
        line.unit,
        line.basis.knownAmount,
        line.basis.unknownAmounts,
      ]),
    ).toEqual([
      ["Peppar", "g", 2, 0],
      ["Peppar", "pinch", null, 1],
      ["Salt", "pinch", 2, 1],
    ]);
    expect(result.recipeItems[2].basis.sources).toEqual([first]);
  });

  it("pins the requested recipe revision instead of using a newer recipe", () => {
    const changed = recipe(3, [item(15, "Smor", 100, "g")]);
    expect(changed.recipe_id).toBe(flour.recipe_id);
    expect(ready(week([first]), [changed, flour]).recipeItems[0].basis.knownAmount).toBe(500);
    expect(buildShoppingList(owner, week([first]), [changed])).toEqual({
      status: "missing_recipes",
      missingMeals: [{ date: monday, meal: "dinner" }],
    });
  });

  it("fails closed for foreign, invalid or ambiguous versions even beside a valid meal", () => {
    const plan = week([first, second]);
    const rejectedVersions = [
      [{ ...flour, user_id: uuid(12) }],
      [{ ...flour, document: { ...flour.document, servings: 0 } }],
      [flour, flour],
    ];
    for (const versions of rejectedVersions)
      expect(buildShoppingList(owner, plan, [...versions, secondFlour])).toEqual({
        status: "missing_recipes",
        missingMeals: [{ date: monday, meal: "dinner" }],
      });
  });

  it("considers normalized spelling but does not merge different ingredient names", () => {
    const version = recipe(2, [
      item(10, "Ro\u0308d  paprika", 1, "pcs"),
      item(11, "R\u00d6D PAPRIKA", 1, "pcs"),
      item(12, "Paprika", 1, "pcs"),
    ]);
    const result = ready(week([first]), [version]);
    expect(result.recipeItems.map((line) => [line.key, line.basis.knownAmount])).toEqual([
      ["pcs:paprika", 2],
      ["pcs:r\u00f6d paprika", 4],
    ]);
  });

  it("retains manual entries and checked adjustments across reloads, not stale recipe changes", () => {
    const input = week([first]);
    const original = ready(input, [flour]).recipeItems[0];
    input.manualItems.push({
      id: uuid(16),
      item: { name: "Citron", amount: null, unit: null },
      checked: true,
    });
    const adjustment = { name: "Mjolpaket", amount: 1, unit: "pcs" } as const;
    input.shoppingEdits.push({
      key: original.key,
      basis: original.basis,
      checked: true,
      excluded: true,
      adjustment,
    });
    const restored = weekPlanSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(ready(restored, [flour])).toMatchObject({
      recipeItems: [
        expect.objectContaining({ checked: true, excluded: true, adjustment }),
        expect.anything(),
      ],
      manualItems: input.manualItems,
    });
    const changedServings = { ...restored, meals: [{ ...first, servings: 6 }] };
    expect(ready(changedServings, [flour])).toMatchObject({
      recipeItems: [
        expect.objectContaining({ checked: false, excluded: false, adjustment: null }),
        expect.anything(),
      ],
      manualItems: input.manualItems,
    });
    const sameQuantityNewVersion = { ...restored, meals: [{ ...first, recipeVersionId: uuid(3) }] };
    const next = { ...flour, id: uuid(3), revision: 3 };
    expect(ready(sameQuantityNewVersion, [next]).recipeItems[0].checked).toBe(false);
    expect(ready({ ...restored, meals: [] }, []).manualItems).toEqual(input.manualItems);
  });
});
