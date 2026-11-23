import assert from "node:assert/strict";
import { ownedApi } from "./owned-backend.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const planningSmokeItem = "Lokalt syntetiskt inkop";
const servings = 3;

export function matchesPlanningResponse(response, method, endpoint) {
  const url = new URL(response.url());
  return (
    url.origin === ownedApi && url.pathname === endpoint && response.request().method() === method
  );
}

export function assertPlanningSmokeReceipt(row, fixture) {
  assert.equal(row?.user_id, fixture.userId);
  assert.equal(row.revision, 1);
  assert.equal(row.document.weekStart, row.week_start);
  assert.match(row.week_start, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(row.document.meals.length, 1);
  assert.equal(row.document.meals[0].recipeVersionId, fixture.versionId);
  assert.equal(row.document.meals[0].servings, servings);
  assert.equal(row.document.manualItems.length, 1);
  assert.equal(row.document.manualItems[0].item.name, planningSmokeItem);
  assert.equal(row.document.manualItems[0].checked, true);
}

export function assertPlanningCookReceipt(row, fixture) {
  assert.equal(row?.user_id, fixture.userId);
  assert.equal(row.recipe_version_id, fixture.versionId);
  assert.equal(row.state.servings, servings);
  assert.equal(row.state.status, "running");
}

// This journey is shared by the approved installed QA run and the disposable clone.
// A fresh fixture and routing guard must be in place before it is invoked.
export async function acceptPlanningSmoke({ page, base, fixture, phase, pass, capture }) {
  assert.match(fixture.userId, uuid);
  assert.match(fixture.versionId, uuid);
  const origin = new URL(base);
  assert.ok(origin.protocol === "http:" && origin.hostname === "127.0.0.1" && origin.port);
  assert.equal(origin.origin, base);
  assert.ok(Number.isSafeInteger(fixture.ingredientGrams) && fixture.ingredientGrams > 0);
  assert.ok(Number.isSafeInteger(fixture.steps) && fixture.steps > 0);
  const expectedGrams = (fixture.ingredientGrams * servings) / 2 + " g";
  const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
  const response = (method, endpoint) =>
    page.waitForResponse((item) => matchesPlanningResponse(item, method, "/rest/v1/" + endpoint));

  phase("planning_create");
  await page.goto(base + "/kitchen#plan", { waitUntil: "domcontentloaded" });
  await button(/^Lägg till måltid/)
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Lägg till måltid", exact: true });
  await dialog.getByRole("combobox").nth(1).selectOption(fixture.versionId);
  await page.getByLabel("Portioner", { exact: true }).fill(String(servings));
  await button("Klar").click();
  await button("Inköpslista").click();
  await page.getByText(expectedGrams, { exact: true }).waitFor();
  await button("Lägg till vara").click();
  await page.getByLabel("Vara", { exact: true }).fill(planningSmokeItem);
  await button("Klar").click();
  await page.getByRole("checkbox", { name: new RegExp(planningSmokeItem) }).check();
  const [saved] = await Promise.all([
    response("POST", "rpc/kitchen_save_week_plan"),
    button("Spara vecka").click(),
  ]);
  assert.equal(saved.status(), 200);
  const savedPlan = await saved.json();
  assertPlanningSmokeReceipt(savedPlan, fixture);
  await page.getByText("Veckoplanen sparades.", { exact: true }).waitFor();
  pass("planning_explicit_save_receipt");

  phase("planning_reload_shopping");
  const [loaded] = await Promise.all([
    response("GET", "kitchen_week_plans"),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  assert.equal(loaded.status(), 200);
  const body = await loaded.json();
  const loadedPlan = Array.isArray(body) && body.length === 1 ? body[0] : body;
  assertPlanningSmokeReceipt(loadedPlan, fixture);
  assert.equal(loadedPlan.last_request_id, savedPlan.last_request_id);
  assert.deepEqual(loadedPlan.document, savedPlan.document);
  await button("Inköpslista").click();
  await page.getByText(expectedGrams, { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: new RegExp(planningSmokeItem) }).isChecked(),
    true,
  );
  pass("planning_reload_keeps_scaled_and_checked_shopping");
  await capture("planning-shopping", 390);

  phase("planning_cook_pinned_version");
  await button("Måltider").click();
  const [cooked] = await Promise.all([
    response("POST", "rpc/kitchen_save_session"),
    button("Starta planerad matlagning").click(),
  ]);
  assert.equal(cooked.status(), 200);
  assertPlanningCookReceipt(await cooked.json(), fixture);
  await page.waitForURL(
    (url) => url.origin === base && url.pathname === "/kitchen" && url.hash === "#cook",
  );
  await page.getByText("Steg 1 av " + fixture.steps, { exact: true }).waitFor();
  pass("planning_cook_uses_exact_saved_version_and_servings");
}
