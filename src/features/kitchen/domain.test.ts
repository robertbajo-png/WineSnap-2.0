import { describe, expect, it } from "vitest";
import { startingRecipes } from "./catalog";
import {
  changeSessionStatus,
  convertAmount,
  formatTimer,
  initialCookingState,
  newTimer,
  recipeSchema,
  scaledAmount,
  timerRemaining,
  toggleCookingTimer,
  validState,
} from "./domain";
import { emptyKitchenCache, validateCache } from "./storage";
const owner = "00000000-0000-4000-8000-000000000001";
const recipe = startingRecipes[0];
describe("structured recipe and session core", () => {
  it("validates bundled starting recipes without claiming nutrition or safety certification", () => {
    for (const value of startingRecipes) expect(recipeSchema.parse(value)).toEqual(value);
    expect(recipeSchema.safeParse({ ...recipe, calories: 50 }).success).toBe(false);
  });
  it("keeps source quantities immutable when scaling for the actual base servings", () => {
    const source = structuredClone(recipe);
    expect(scaledAmount(180, 3, 6)).toBe(360);
    expect(scaledAmount(1, 3, 1)).toBeCloseTo(1 / 3);
    expect(recipe).toEqual(source);
  });
  it.each([0, 25, 1.5, NaN, Infinity])("refuses invalid portions %s", (value) => {
    expect(() => scaledAmount(100, 2, value)).toThrow();
  });
  it("converts only compatible units and never guesses density", () => {
    expect(convertAmount(1, "kg", "g")).toBe(1000);
    expect(convertAmount(2, "tbsp", "ml")).toBe(30);
    expect(() => convertAmount(1, "g", "ml")).toThrow();
    expect(() => convertAmount(1, "pcs", "g")).toThrow();
  });
  it("rejects duplicate step IDs, non-finite quantities and empty instructions", () => {
    expect(
      recipeSchema.safeParse({ ...recipe, steps: [recipe.steps[0], recipe.steps[0]] }).success,
    ).toBe(false);
    expect(
      recipeSchema.safeParse({
        ...recipe,
        ingredients: [{ ...recipe.ingredients[0], amount: Infinity }],
      }).success,
    ).toBe(false);
    expect(
      recipeSchema.safeParse({ ...recipe, steps: [{ ...recipe.steps[0], text: " " }] }).success,
    ).toBe(false);
  });
  it("checks session steps and ingredient references against the pinned version", () => {
    const state = initialCookingState(recipe);
    expect(() => validState({ ...state, activeStep: recipe.steps.length }, recipe)).toThrow();
    expect(() => validState({ ...state, checkedIngredientIds: [owner] }, recipe)).toThrow();
    expect(() =>
      validState(
        { ...state, checkedIngredientIds: [recipe.ingredients[0].id, recipe.ingredients[0].id] },
        recipe,
      ),
    ).toThrow();
  });
  it("uses absolute timer deadlines and recovers elapsed timers after reload", () => {
    const timer = newTimer("Pasta", 120, 1000, owner);
    expect(timerRemaining(JSON.parse(JSON.stringify(timer)), 91000)).toBe(30000);
    expect(timerRemaining(timer, 200000)).toBe(0);
    expect(formatTimer(1500)).toBe("00:02");
    expect(timerRemaining(timer, -10000)).toBe(timer.durationMs);
  });
  it("pauses/resumes individual timers without replacing their duration", () => {
    const timer = newTimer("Pasta", 120, 1000, owner);
    const paused = toggleCookingTimer(timer, 31000);
    expect(paused.pausedMs).toBe(90000);
    expect(timerRemaining(paused, 1000000)).toBe(90000);
    expect(toggleCookingTimer(paused, 200000).deadlineMs).toBe(290000);
  });
  it("pauses running timers with the session, preserving manually paused timers", () => {
    const running = newTimer("A", 120, 1000, owner);
    const paused = toggleCookingTimer(newTimer("B", 60, 1000, crypto.randomUUID()), 2000);
    const state = { ...initialCookingState(recipe), timers: [running, paused] };
    const stopped = changeSessionStatus(state, "paused", 31000);
    expect(stopped.timers.every((timer) => timer.deadlineMs === null)).toBe(true);
    const resumed = changeSessionStatus(stopped, "running", 200000);
    expect(resumed.timers[0].deadlineMs).toBe(290000);
    expect(resumed.timers[1].deadlineMs).toBeNull();
  });
  it("ends all timers and refuses reactivation of a completed session", () => {
    const state = { ...initialCookingState(recipe), timers: [newTimer("A", 60, 1000, owner)] };
    const completed = changeSessionStatus(state, "completed", 2000);
    expect(completed.timers[0].pausedMs).toBe(0);
    expect(completed.timers[0].deadlineMs).toBeNull();
    expect(() => changeSessionStatus(completed, "running")).toThrow();
  });
  it("refuses oversized timer lists and paused sessions with running deadlines", () => {
    const timer = newTimer("A", 60, 1000, owner);
    expect(() =>
      validState({ ...initialCookingState(recipe), timers: Array(9).fill(timer) }, recipe),
    ).toThrow();
    expect(() =>
      validState({ ...initialCookingState(recipe), status: "paused", timers: [timer] }, recipe),
    ).toThrow();
  });
});
describe("account-partitioned offline cooking", () => {
  it("requires matching owner and recent verified access", () => {
    const cache = emptyKitchenCache(owner);
    expect(validateCache(cache, owner)).toEqual(cache);
    expect(() => validateCache(cache, crypto.randomUUID())).toThrow();
    expect(() => validateCache(cache, owner, cache.verifiedAt + 86400001)).toThrow();
    expect(() => validateCache(cache, owner, cache.verifiedAt - 60001)).toThrow();
  });
  it("refuses downloaded versions belonging to another account", () => {
    const cache = emptyKitchenCache(owner);
    cache.versions.push({
      id: crypto.randomUUID(),
      recipe_id: crypto.randomUUID(),
      user_id: crypto.randomUUID(),
      revision: 1,
      document: recipe,
      created_at: new Date().toISOString(),
    });
    expect(() => validateCache(cache, owner)).toThrow();
  });
});
