import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { pantryBrowserRequest } from "./owned-pantry-accept.mjs";

describe("installed DEV-07 browser acceptance", () => {
  it.each([
    [ownedApp + "/kitchen#plan", "GET", "web"],
    [ownedApi + "/auth/v1/token?grant_type=password", "POST", "login"],
    [ownedApi + "/auth/v1/token?grant_type=password", "OPTIONS", "preflight"],
    [ownedApi + "/auth/v1/user", "GET", "api"],
    [ownedApi + "/rest/v1/kitchen_pantry", "GET", "api"],
    [ownedApi + "/rest/v1/kitchen_diners", "GET", "api"],
    [ownedApi + "/rest/v1/rpc/kitchen_confirm_pantry_consumption", "POST", "api"],
    [ownedApi + "/rest/v1/kitchen_pantry", "DELETE", "blocked"],
    [ownedApi + "/rest/v1/rpc/kitchen_family_change", "POST", "blocked"],
    [ownedApi + "/rest/v1/another_table", "GET", "blocked"],
    [ownedApi + "/auth/v1/token?grant_type=refresh_token", "POST", "blocked"],
    [ownedApi + "/auth/v1/admin/users", "GET", "blocked"],
    [ownedApi + "/storage/v1/object/list/wine-labels", "POST", "blocked"],
    [ownedApi + "/functions/v1/privacy-export", "POST", "blocked"],
    [ownedApp + "/api/chef", "POST", "blocked"],
    [ownedApp + "/api", "GET", "blocked"],
    ["http://127.0.0.1:5213/kitchen", "GET", "blocked"],
    ["https://winesnap-fixture.invalid/kitchen", "GET", "blocked"],
    ["http://synthetic@127.0.0.1:5212/kitchen", "GET", "blocked"],
    ["not a URL", "GET", "blocked"],
  ])("restricts %s %s to %s", (url, verb, expected) => {
    expect(pantryBrowserRequest(url, verb)).toBe(expected);
  });

  it("gates test writes on the installed binary, exact ledger, paused tunnel and private manifests", () => {
    const launcher = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(launcher).toContain("await verify({ syncWebKeys: !pantryAcceptance });");
    expect(launcher).toMatch(
      /phase = "pantry_acceptance_ledger";[\s\S]+?readPausedPantryState\(\);[\s\S]+?assert\.equal\(installedPantry, pantryWebLabel\);[\s\S]+?assert\.equal\(ledger.scope, "already_applied"\);[\s\S]+?acceptInstalledPantry\(keys,/,
    );
    expect(launcher).toContain("pantry-browser-${name}-fixture.json");
    expect(launcher).toMatch(
      /async function verify\([\s\S]+?if \(syncWebKeys\) await installWebKeys\(\);/,
    );
  });
});
