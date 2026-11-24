import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { nutritionBrowserRequest, rehearseNutritionAcceptance } from "./owned-nutrition-accept.mjs";

describe("installed DEV-08 acceptance boundaries", () => {
  it.each([
    [ownedApp + "/kitchen#plan", "GET", "web"],
    [ownedApp + "/api/chef", "POST", "blocked"],
    [ownedApi + "/auth/v1/token?grant_type=password", "POST", "login"],
    [ownedApi + "/auth/v1/token?grant_type=refresh_token", "POST", "blocked"],
    [ownedApi + "/auth/v1/admin/users", "GET", "blocked"],
    [ownedApi + "/rest/v1/kitchen_recipe_versions", "GET", "api"],
    [ownedApi + "/rest/v1/kitchen_recipes", "DELETE", "blocked"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_recipe", "OPTIONS", "preflight"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_recipe", "POST", "api"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_recipe?extra=1", "POST", "blocked"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_week_plan", "POST", "api"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_pantry_item", "POST", "blocked"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_session", "POST", "blocked"],
    [ownedApi + "/storage/v1/object/wine-labels/other", "GET", "blocked"],
    ["https://winesnap.boleoai.se/kitchen", "GET", "blocked"],
    ["http://bad@127.0.0.1:5212/kitchen", "GET", "blocked"],
    ["not a URL", "GET", "blocked"],
  ])("restricts %s %s to %s", (value, method, result) => {
    expect(nutritionBrowserRequest(value, method)).toBe(result);
  });

  it.each([
    ownedApp,
    ownedApi,
    "http://127.0.0.1:54323",
    "http://127.0.0.1:8026",
    "http://localhost:46119",
    "https://winesnap.boleoai.se",
    "http://127.0.0.1:46119/path",
  ])("refuses to run the rehearsal on %s before creating a fixture", (base) => {
    expect(() =>
      rehearseNutritionAcceptance(
        null,
        {},
        {
          base,
          relay() {},
          relayWeb() {},
          browser: { newContext() {} },
        },
      ),
    ).toThrow();
  });

  it("requires a paused tunnel, marked image and complete ledger before creating fixtures", () => {
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(manager).toMatch(
      /phase = "nutrition_acceptance_guard";[\s\S]+?await readPausedPantryState\(\);[\s\S]+?winesnap\.recipe-nutrition[\s\S]+?requireNutritionLedger\([\s\S]+?"nutrition-browser-owner-fixture\.json"[\s\S]+?acceptInstalledNutrition\(keys,/,
    );
    const launcher = readFileSync(new URL("../run-owned-windows.ps1", import.meta.url), "utf8");
    expect(launcher).toContain("$Action -eq 'NutritionUpdate' -and -not $VerifiedNutritionBackup");
    expect(launcher.indexOf("Open-OwnedRuntimeLock -Name operation")).toBeLessThan(
      launcher.indexOf("WINESNAP_OWNED_NUTRITION_BACKUP"),
    );
  });
});
