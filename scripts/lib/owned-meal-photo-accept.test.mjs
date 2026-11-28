import { describe, expect, it } from "vitest";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { mealPhotoBrowserRequest } from "./owned-meal-photo-accept.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const photo = `${ownedApp}/api/meal-photo?id=${id}`;
const analyze = ownedApp + "/api/ai/analyze-meal-photo";
const meals = ownedApi + "/rest/v1/kitchen_photo_meals";
const save = ownedApi + "/rest/v1/rpc/kitchen_save_photo_meal";
const saveProjection =
  "?select=id%2Cuser_id%2Ccreated_at%2Citems%2Ckeep_photo%2Cphoto_state%2Cphoto_sha256";

describe("installed meal photo browser authority", () => {
  it.each([
    [photo, "GET", "photo"],
    [photo, "POST", "photo"],
    [photo, "DELETE", "photo"],
    [analyze, "POST", "estimate"],
    [meals + "?select=id", "GET", "api"],
    [save, "POST", "api"],
    [save, "OPTIONS", "preflight"],
    [save + saveProjection, "POST", "api"],
    [save + saveProjection, "OPTIONS", "preflight"],
    [ownedApi + "/auth/v1/token?grant_type=password", "POST", "login"],
    [ownedApi + "/rest/v1/rpc/meals_access", "POST", "api"],
  ])("allows only the declared test operation %s %s", (url, method, decision) => {
    expect(mealPhotoBrowserRequest(url, method)).toBe(decision);
  });

  it.each([
    [photo + "&id=" + id, "GET"],
    [photo.replace(id, "invalid"), "POST"],
    [photo, "PATCH"],
    [analyze + "?other=true", "POST"],
    [analyze, "GET"],
    [save, "DELETE"],
    [save + "?select=*", "POST"],
    [save + saveProjection + "&limit=1", "POST"],
    [meals + "?select=*", "POST"],
    [ownedApi + "/rest/v1/rpc/kitchen_save_session", "POST"],
    [ownedApi + "/storage/v1/object/meal-photos/file.png", "GET"],
    [ownedApp + "/api/privacy/privacy-export", "POST"],
    ["http://localhost:5212/kitchen", "GET"],
    ["https://example.invalid/api/meal-photo?id=" + id, "GET"],
  ])("blocks requests outside the fixture operation %s %s", (url, method) => {
    expect(mealPhotoBrowserRequest(url, method)).toBe("blocked");
  });
});
