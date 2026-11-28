import { describe, expect, it } from "vitest";
import type { RecipeVersion, SavedSession } from "../kitchen/domain";
import { buildShoppingList, type WeekPlan } from "../planning/domain";
import {
  pantrySnapshotSchema,
  stockConfirmationMaxAgeMs,
  stockInputSchema,
  stockStatus,
  suggestPantryConsumption,
  suggestPantryShopping,
  type PantrySnapshot,
  type StockItem,
} from "./domain";

const uuid = (n: number) => `11111111-1111-4111-8111-${n.toString(16).padStart(12, "0")}`;
const owner = uuid(1);
const peer = uuid(3);
const timestamp = "2026-11-23T10:00:00.000Z";
const now = Date.parse(timestamp);
const version: RecipeVersion = {
  id: uuid(4),
  recipe_id: uuid(2),
  user_id: owner,
  revision: 1,
  created_at: timestamp,
  document: {
    title: "Tomatsoppa",
    description: "",
    servings: 2,
    totalMinutes: 20,
    image: "none",
    notes: "",
    sourceNote: "",
    ingredients: [{ id: uuid(6), name: "Tomater", amount: 400, unit: "g" }],
    steps: [{ id: uuid(7), title: "Koka", text: "Koka soppan", timerSeconds: null }],
  },
};
const week: WeekPlan = {
  weekStart: "2026-11-23",
  meals: [{ date: "2026-11-23", meal: "dinner", recipeVersionId: version.id, servings: 3 }],
  manualItems: [{ id: uuid(8), item: { name: "Tomater", amount: 1, unit: "kg" }, checked: false }],
  shoppingEdits: [],
};
const cooked: SavedSession = {
  id: uuid(10),
  user_id: owner,
  recipe_version_id: version.id,
  revision: 2,
  state: { status: "completed", activeStep: 0, servings: 3, checkedIngredientIds: [], timers: [] },
  last_request_id: uuid(11),
  updated_at: timestamp,
};
const stock = (changes: Partial<StockItem> = {}): StockItem => ({
  id: uuid(20),
  name: "Tomater",
  amount: 0.4,
  unit: "kg",
  confirmedAt: timestamp,
  ...changes,
});
const snapshot = (...items: StockItem[]): PantrySnapshot => ({
  user_id: owner,
  revision: 1,
  items,
  last_request_id: uuid(21),
  updated_at: timestamp,
});
const derive = (available: unknown, candidate = version, plan = week) =>
  suggestPantryShopping(owner, buildShoppingList(owner, plan, [candidate]), available, now);

describe("confirmed pantry quantities", () => {
  it("allows explicit zero or an unconfirmed observation, but not a confirmed unknown amount", () => {
    const input = { name: "Tomater", unit: "g" } as const;
    expect(stockInputSchema.safeParse({ ...input, amount: 0, confirmed: true }).success).toBe(true);
    expect(stockInputSchema.safeParse({ ...input, amount: null, confirmed: false }).success).toBe(
      true,
    );
    expect(stockInputSchema.safeParse({ ...input, amount: null, confirmed: true }).success).toBe(
      false,
    );
    expect(pantrySnapshotSchema.safeParse(snapshot(stock(), stock())).success).toBe(false);
  });

  it("distinguishes stale, future and unconfirmed observations at the time boundary", () => {
    expect(stockStatus(stock(), now + stockConfirmationMaxAgeMs)).toBe("fresh");
    expect(stockStatus(stock(), now + stockConfirmationMaxAgeMs + 1)).toBe("stale");
    expect(stockStatus(stock(), now - 1)).toBe("unconfirmed");
    expect(stockStatus(stock({ confirmedAt: null }), now)).toBe("unconfirmed");
  });
});

describe("pantry suggestions on the shopping list", () => {
  it("suggests buying 200 g for a 600 g plan and 0.4 kg confirmed stock without mutating either input", () => {
    const available = snapshot(stock({ name: " TOMATER " }));
    const list = buildShoppingList(owner, week, [version]);
    const before = structuredClone({ available, list });
    expect([...suggestPantryShopping(owner, list, available, now)]).toEqual([
      ["g:tomater", { needed: 600, covered: 400, toBuy: 200 }],
    ]);
    expect({ available, list }).toEqual(before);
  });

  it("combines compatible confirmed rows and caps coverage at the amount needed", () => {
    const available = snapshot(stock(), stock({ id: uuid(23), amount: 350, unit: "g" }));
    expect([...derive(available).values()]).toEqual([{ needed: 600, covered: 600, toBuy: 0 }]);
  });

  it.each([
    ["stale", stock({ confirmedAt: "2026-11-15T10:00:00.000Z" })],
    ["unconfirmed", stock({ confirmedAt: null })],
    ["future", stock({ confirmedAt: "2026-11-24T10:00:00.000Z" })],
    ["unspecified", stock({ amount: null, confirmedAt: null })],
    ["sold out", stock({ amount: 0 })],
    ["different unit dimension", stock({ unit: "dl" })],
    ["not an exact ingredient", stock({ name: "Krossade tomater" })],
  ])("does not deduct %s stock", (_kind, item) => {
    expect(derive(snapshot(item)).size).toBe(0);
  });

  it("does not deduct for a different or malformed account, missing recipe or unspecified recipe amount", () => {
    expect(derive({ ...snapshot(stock()), user_id: peer }).size).toBe(0);
    expect(derive(snapshot(stock(), stock())).size).toBe(0);
    expect(derive(snapshot(stock()), { ...version, id: uuid(100) }).size).toBe(0);
    const unknown = { ...version.document.ingredients[0], id: uuid(66), amount: 0 };
    const recipe = {
      ...version,
      document: { ...version.document, ingredients: [...version.document.ingredients, unknown] },
    };
    expect(derive(snapshot(stock()), recipe).size).toBe(0);
  });

  it("does not override checked, hidden or manually adjusted recipe lines", () => {
    const list = buildShoppingList(owner, week, [version]);
    if (list.status !== "ready") throw new Error("Expected a ready plan");
    const { key, basis } = list.recipeItems[0];
    const edit = { key, basis, checked: false, excluded: false, adjustment: null };
    for (const option of [
      { checked: true },
      { excluded: true },
      { adjustment: { name: "Tomater", unit: "g" as const, amount: 50 } },
    ])
      expect(
        derive(snapshot(stock()), version, { ...week, shoppingEdits: [{ ...edit, ...option }] })
          .size,
      ).toBe(0);
  });
});

describe("reviewing consumption after a completed cooking session", () => {
  it("uses the cooked portions, walks earlier confirmed stock first and only suggests a draft", () => {
    const early = stock({
      id: uuid(22),
      amount: 250,
      unit: "g",
      confirmedAt: "2026-11-22T10:00:00Z",
    });
    const available = snapshot(stock(), early);
    const before = structuredClone(available);
    expect(suggestPantryConsumption(owner, cooked, version, available, now)).toEqual([
      { itemId: early.id, name: "Tomater", unit: "g", suggestedAmount: 250, availableAmount: 250 },
      {
        itemId: uuid(20),
        name: "Tomater",
        unit: "kg",
        suggestedAmount: 0.35,
        availableAmount: 0.4,
      },
    ]);
    expect(available).toEqual(before);
  });

  it("refuses active, abandoned, foreign and mismatched-version sessions", () => {
    const available = snapshot(stock());
    for (const session of [
      { ...cooked, state: { ...cooked.state, status: "running" } },
      { ...cooked, state: { ...cooked.state, status: "abandoned" } },
      { ...cooked, user_id: peer },
      { ...cooked, recipe_version_id: uuid(55) },
    ])
      expect(suggestPantryConsumption(owner, session, version, available, now)).toEqual([]);
    expect(
      suggestPantryConsumption(owner, cooked, { ...version, user_id: peer }, available, now),
    ).toEqual([]);
  });
});
