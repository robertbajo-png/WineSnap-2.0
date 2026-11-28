import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function acceptPantryStock({ page, base, fixture, backend, report, capture }) {
  const { owner, peer, rest, recipe } = fixture;
  const dinerId = randomUUID();
  const seed = await backend.admin("/kitchen_diners", {
    method: "POST",
    body: JSON.stringify([
      {
        id: dinerId,
        user_id: owner.id,
        document: {
          name: "Syntetisk matgäst",
          kind: "child",
          preferences: [{ attribute: "ingredient", value: "tomater", direction: -1 }],
        },
      },
      {
        id: randomUUID(),
        user_id: peer.id,
        document: { name: "Annan profil", kind: "adult", preferences: [] },
      },
    ]),
  });
  assert.equal(seed.status, 201);
  const version = await recipe(owner, "Syntetisk tomatsoppa", undefined, {
    name: "Tomater",
    amount: 400,
  });
  await runPantryJourney({
    page,
    base,
    version,
    dinerId,
    report,
    capture,
    async read(table) {
      const response = await rest(owner, `/${table}?select=*`);
      assert.equal(response.status, 200);
      return response.json();
    },
  });
  return version;
}

export async function runPantryJourney({
  page,
  base,
  version,
  dinerId,
  read,
  report,
  capture,
  phase = () => {},
}) {
  const origin = new URL(base);
  assert.equal(origin.origin, base);
  assert.ok(origin.protocol === "http:" && origin.hostname === "127.0.0.1" && origin.port);
  for (const id of [version.id, dinerId]) assert.match(id, /^[a-f0-9-]{36}$/);
  const step = (name) => {
    report.phase = name;
    phase(name);
  };
  const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
  const text = (value) => page.getByText(value, { exact: true });
  const pantry = async () => {
    const rows = await read("kitchen_pantry");
    assert.equal(rows.length, 1);
    return rows[0];
  };

  step("pantry_create");
  await page.goto(base + "/kitchen#pantry", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Skafferi", exact: true }).waitFor();
  await text("Inga råvaror i skafferiet.").waitFor();
  step("pantry_enter_item");
  await button("Lägg till råvara").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Råvara", { exact: true }).fill("Tomater");
  await dialog.getByLabel("Mängd", { exact: true }).fill("400");
  await dialog.getByLabel("Enhet", { exact: true }).selectOption("g");
  await dialog.getByRole("checkbox", { name: "Bekräfta mängden nu" }).check();
  step("pantry_save_item");
  await button("Spara lagerpost").click();
  await text("Lagerposten sparades.").waitFor();
  await page.getByText(/^Bekräftad /).waitFor();
  const confirmed = await pantry();
  assert.equal(confirmed.revision, 1);
  assert.equal(confirmed.items.length, 1);
  assert.equal(confirmed.items[0].amount, 400);
  assert.equal(confirmed.items[0].unit, "g");
  assert.ok(Number.isFinite(Date.parse(confirmed.items[0].confirmedAt)));
  await capture?.("pantry-stock", 320);
  await capture?.("pantry-stock", 1440);
  report.passed.push(
    capture ? "real_pantry_confirmation_and_responsive_stock" : "real_pantry_confirmation",
  );

  step("pantry_shop");
  await button("Veckoplan").click();
  await button(/^Lägg till måltid/)
    .first()
    .click();
  const meal = page.getByRole("dialog", { name: "Lägg till måltid", exact: true });
  await meal.getByRole("combobox").nth(1).selectOption(version.id);
  await meal.getByLabel("Portioner", { exact: true }).fill("3");
  step("pantry_choose_existing_diner");
  await meal.getByRole("checkbox", { name: "Syntetisk matgäst", exact: true }).check();
  assert.equal(await meal.getByRole("checkbox", { name: "Annan profil", exact: true }).count(), 0);
  await meal.getByText("Syntetisk matgäst: undviker tomater", { exact: true }).waitFor();
  assert.equal(await meal.getByLabel("Portioner", { exact: true }).inputValue(), "3");
  await capture?.("pantry-diners", 390);
  await capture?.("pantry-diners", 1440);
  await button("Klar").click();
  await button("Spara vecka").click();
  await text("Veckoplanen sparades.").waitFor();
  step("pantry_diner_receipt");
  const rows = await read("kitchen_week_plans");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].document.meals[0].dinerIds, [dinerId]);
  assert.equal(rows[0].document.meals[0].servings, 3);
  assert.ok(!JSON.stringify(rows[0].document).includes("Syntetisk matgäst"));
  step("pantry_diner_reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await text("Matgäster: Syntetisk matgäst").waitFor({ timeout: 60000 });
  report.passed.push("existing_owner_diner_preferences_and_private_selection_survive_reload");
  step("pantry_shop");
  await button("Inköpslista").click();
  await text("Behövs: 600 g").waitFor();
  await text("Från skafferiet: 400 g").waitFor();
  await text("Att köpa: 200 g").waitFor();
  assert.deepEqual(await pantry(), confirmed);
  await capture?.("pantry-shopping", 390);
  await capture?.("pantry-shopping", 1440);
  report.passed.push("real_plan_reload_shows_200g_without_changing_stock");

  step("pantry_uncertain");
  await button("Skafferi").click();
  await button("Redigera Tomater").click();
  assert.equal(
    await dialog.getByRole("checkbox", { name: "Bekräfta mängden nu" }).isChecked(),
    false,
  );
  await button("Spara lagerpost").click();
  await text("Inte bekräftad").waitFor();
  assert.equal((await pantry()).items[0].confirmedAt, null);
  await button("Veckoplan").click();
  await text("600 g").waitFor();
  assert.equal(await text("Att köpa: 200 g").count(), 0);
  report.passed.push("uncertain_stock_restores_full_shopping_quantity");

  step("pantry_cook_completion");
  await button("Skafferi").click();
  await button("Redigera Tomater").click();
  await dialog.getByRole("checkbox", { name: "Bekräfta mängden nu" }).check();
  await button("Spara lagerpost").click();
  await text("Lagerposten sparades.").waitFor();
  const beforeCook = await pantry();
  await button("Veckoplan").click();
  await button("Måltider").click();
  await button("Starta planerad matlagning").click();
  await text("Steg 1 av 1").waitFor();
  await button("Avsluta").click();
  await button("Avsluta matlagningen").click();
  await text("Matlagningen är avslutad").waitFor();
  assert.deepEqual(await pantry(), beforeCook);
  const receipts = () => read("kitchen_pantry_consumption");
  assert.deepEqual(await receipts(), []);
  step("pantry_explicit_review");
  await button("Granska förbrukning").click();
  const review = page.getByRole("dialog", { name: "Granska förbrukning", exact: true });
  const tomato = review.getByRole("checkbox", { name: /Tomater/ });
  await tomato.waitFor();
  assert.equal(await tomato.isChecked(), false);
  assert.equal(await button("Bekräfta förbrukning").isDisabled(), true);
  await tomato.check();
  await button("Avbryt").click();
  assert.deepEqual(await pantry(), beforeCook);
  assert.deepEqual(await receipts(), []);
  await button("Granska förbrukning").click();
  await tomato.check();
  await review.getByLabel("Använd mängd (g)", { exact: true }).fill("250");
  await capture?.("pantry-consumption", 390);
  await capture?.("pantry-consumption", 1440);
  await button("Bekräfta förbrukning").click();
  await text("Förbrukningen är registrerad.").waitFor();
  await text("Tomater: 250 g").waitFor();
  const [receipt] = await receipts();
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].amount, 250);
  assert.equal(receipt.items[0].itemId, beforeCook.items[0].id);
  const afterCook = await pantry();
  assert.equal(afterCook.items[0].amount, 150);
  assert.equal(afterCook.revision, beforeCook.revision + 1);
  assert.equal(afterCook.items[0].confirmedAt, beforeCook.items[0].confirmedAt);
  await button("Stäng").click();
  await button("Granska förbrukning").click();
  await text("Förbrukningen är registrerad.").waitFor();
  assert.equal(await button("Bekräfta förbrukning").count(), 0);
  assert.deepEqual(await receipts(), [receipt]);
  assert.deepEqual(await pantry(), afterCook);
  const sessions = await read("cooking_sessions");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, receipt.session_id);
  assert.equal(sessions[0].recipe_version_id, version.id);
  assert.equal(sessions[0].state.status, "completed");
  assert.equal(sessions[0].state.servings, 3);
  report.passed.push("completed_and_cancelled_cook_leave_stock_until_actual_confirmation_once");
}
