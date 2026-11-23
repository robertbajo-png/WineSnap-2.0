import { describe, expect, it } from "vitest";
import {
  assertPlanningCookReceipt,
  assertPlanningSmokeReceipt,
  matchesPlanningResponse,
  planningSmokeItem,
} from "./owned-planning-smoke.mjs";

const fixture = { userId: "synthetic-owner", versionId: "synthetic-version" };
const plan = () => ({
  user_id: fixture.userId,
  week_start: "2026-11-23",
  revision: 1,
  document: {
    weekStart: "2026-11-23",
    meals: [{ recipeVersionId: fixture.versionId, servings: 3 }],
    manualItems: [{ item: { name: planningSmokeItem }, checked: true }],
  },
});

describe("owned planning browser acceptance", () => {
  it("only accepts the exact API origin, verb and path", () => {
    const post = (url, method = "POST") => ({
      url: () => url,
      request: () => ({ method: () => method }),
    });
    const path = "/rest/v1/rpc/kitchen_save_week_plan";
    const matches = (response) => matchesPlanningResponse(response, "POST", path);
    expect(matches(post("http://127.0.0.1:54323" + path + "?x=1"))).toBe(true);
    expect(matches(post("http://127.0.0.1:5212" + path))).toBe(false);
    expect(matches(post("https://example.invalid" + path))).toBe(false);
    expect(matches(post("http://127.0.0.1:54323" + path, "GET"))).toBe(false);
    expect(matches(post("http://127.0.0.1:54323" + path + "_other"))).toBe(false);
  });

  it.each([
    [
      "owner",
      (row) => {
        row.user_id = "other";
      },
    ],
    [
      "revision",
      (row) => {
        row.revision = 2;
      },
    ],
    [
      "week",
      (row) => {
        row.document.weekStart = "2026-11-30";
      },
    ],
    [
      "recipe version",
      (row) => {
        row.document.meals[0].recipeVersionId = "other";
      },
    ],
    [
      "servings",
      (row) => {
        row.document.meals[0].servings = 2;
      },
    ],
    [
      "shopping state",
      (row) => {
        row.document.manualItems[0].checked = false;
      },
    ],
  ])("rejects a plan receipt with the wrong %s", (_case, change) => {
    const row = plan();
    expect(() => assertPlanningSmokeReceipt(row, fixture)).not.toThrow();
    change(row);
    expect(() => assertPlanningSmokeReceipt(row, fixture)).toThrow();
  });

  it("checks the running cooking session's owner, recipe version and portions", () => {
    const cooking = {
      user_id: fixture.userId,
      recipe_version_id: fixture.versionId,
      state: { servings: 3, status: "running" },
    };
    expect(() => assertPlanningCookReceipt(cooking, fixture)).not.toThrow();
    for (const change of [
      { user_id: "other" },
      { recipe_version_id: "other" },
      { state: { ...cooking.state, servings: 2 } },
      { state: { ...cooking.state, status: "finished" } },
    ]) {
      expect(() => assertPlanningCookReceipt({ ...cooking, ...change }, fixture)).toThrow();
    }
  });
});
