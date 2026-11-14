import { describe, expect, it } from "vitest";
import { startingRecipes } from "./catalog";
import { initialCookingState, type LocalSession, type RecipeVersion } from "./domain";
import {
  kitchenJourneyHash,
  readKitchenJourney,
  readWineJourney,
  resolveJourneyRecipe,
  wineJourneyHash,
} from "./journey";

const owner = "00000000-0000-4000-8000-000000000001";
const peer = "00000000-0000-4000-8000-000000000002";
const version: RecipeVersion = {
  id: "00000000-0000-4000-8000-000000000003",
  recipe_id: "00000000-0000-4000-8000-000000000004",
  user_id: owner,
  revision: 2,
  document: startingRecipes[0],
  created_at: "2026-11-06T10:00:00Z",
};
const session: LocalSession = {
  id: "00000000-0000-4000-8000-000000000005",
  version,
  state: initialCookingState(version.document, 4),
  baseRevision: 2,
  requestId: "00000000-0000-4000-8000-000000000006",
  dirty: false,
  feedback: null,
};

describe("private food and wine journeys", () => {
  it("round trips a pinned recipe, portions and cooking return without changing the session", () => {
    const before = structuredClone(session);
    const input = {
      view: "pairings" as const,
      recipe: version.id,
      session: session.id,
      servings: 4,
      fromCook: true,
    };
    expect(readKitchenJourney(kitchenJourneyHash(input))).toEqual({
      kind: "ready",
      destination: input,
    });
    const returned = readWineJourney(wineJourneyHash(input));
    expect(returned).toEqual({ kind: "ready", destination: { ...input, view: "cook" } });
    expect(session).toEqual(before);
  });
  it("keeps wine-to-recipe navigation and legacy entry points", () => {
    expect(readKitchenJourney(`#pairings?wine=${owner}`)).toEqual({
      kind: "ready",
      destination: { view: "pairings", wine: owner },
    });
    for (const hash of ["", "#recipes", "#cook", "#pairings", "#chef", "#memory"])
      expect(readKitchenJourney(hash).kind).toBe("none");
    expect(readWineJourney("aromas").kind).toBe("none");
  });
  it.each([
    "#recipes?recipe=https://evil.invalid",
    "#recipes?recipe=nope",
    "#recipes?servings=0",
    "#recipes?servings=25",
    "#recipes?servings=2.5",
    "#recipes?servings=2e0",
    `#recipes?recipe=${version.id}&recipe=${version.id}`,
    "#recipes?returnTo=https://evil.invalid",
    `#cook?recipe=${version.id}`,
    `#pairings?session=${session.id}`,
    "#pairings?fromCook=1",
    "#recipes?fromCook=false",
    "#recipes?servings=2?extra",
    "#recipes?" + "x".repeat(610),
  ])("rejects malformed or ambiguous context %s", (hash) => {
    expect(readKitchenJourney(hash).kind).toBe("invalid");
  });
  it("never accepts an arbitrary wine return URL or destination", () => {
    expect(readWineJourney("kitchen?view=https://evil.invalid").kind).toBe("invalid");
    expect(readWineJourney(`kitchen?view=pairings&recipe=${version.id}`).kind).toBe("invalid");
    expect(() => wineJourneyHash({ view: "recipes" })).toThrow();
  });
  it("resolves only an exact owned version, never substitutes a current revision", () => {
    const newer = { ...version, id: peer, revision: 3 };
    expect(
      resolveJourneyRecipe({ view: "recipes", recipe: version.id }, owner, [newer]),
    ).toBeNull();
    expect(
      resolveJourneyRecipe({ view: "recipes", recipe: version.id }, peer, [version]),
    ).toBeNull();
    expect(resolveJourneyRecipe({ view: "recipes", recipe: version.id }, owner, [version])).toBe(
      version,
    );
    expect(
      resolveJourneyRecipe({ view: "pairings", wine: owner }, owner, [version]),
    ).toBeUndefined();
  });
  it("retains an active session's pinned version even when the cookbook has a newer version", () => {
    const destination = { view: "cook" as const, recipe: version.id, session: session.id };
    expect(resolveJourneyRecipe(destination, owner, [], session)).toBe(version);
    expect(resolveJourneyRecipe(destination, peer, [], session)).toBeNull();
    expect(
      resolveJourneyRecipe({ ...destination, session: peer }, owner, [version], session),
    ).toBeNull();
    expect(
      resolveJourneyRecipe(destination, owner, [version], {
        ...session,
        state: { ...session.state, status: "completed" },
      }),
    ).toBeNull();
  });
});
