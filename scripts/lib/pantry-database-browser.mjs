import assert from "node:assert/strict";

export async function acceptPantryStock({ page, base, fixture, report, capture }) {
  const { owner, rest, recipe } = fixture;
  const version = await recipe(owner, "Syntetisk tomatsoppa", undefined, {
    name: "Tomater",
    amount: 400,
  });
  const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
  const text = (value) => page.getByText(value, { exact: true });
  const pantry = async () => {
    const response = await rest(owner, "/kitchen_pantry?select=revision,items");
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.equal(rows.length, 1);
    return rows[0];
  };

  report.phase = "pantry_create";
  await page.goto(base + "/kitchen#pantry", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Skafferi", exact: true }).waitFor();
  await text("Inga råvaror i skafferiet.").waitFor();
  await button("Lägg till råvara").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Råvara", { exact: true }).fill("Tomater");
  await dialog.getByLabel("Mängd", { exact: true }).fill("400");
  await dialog.getByLabel("Enhet", { exact: true }).selectOption("g");
  await dialog.getByRole("checkbox", { name: "Bekräfta mängden nu" }).check();
  await button("Spara lagerpost").click();
  await text("Lagerposten sparades.").waitFor();
  await page.getByText(/^Bekräftad /).waitFor();
  const confirmed = await pantry();
  assert.equal(confirmed.revision, 1);
  assert.equal(confirmed.items.length, 1);
  assert.equal(confirmed.items[0].amount, 400);
  assert.equal(confirmed.items[0].unit, "g");
  assert.ok(Number.isFinite(Date.parse(confirmed.items[0].confirmedAt)));
  await capture("pantry-stock", 320);
  await capture("pantry-stock", 1440);
  report.passed.push("real_pantry_confirmation_and_responsive_stock");

  report.phase = "pantry_shop";
  await button("Veckoplan").click();
  await button(/^Lägg till måltid/)
    .first()
    .click();
  const meal = page.getByRole("dialog", { name: "Lägg till måltid", exact: true });
  await meal.getByRole("combobox").nth(1).selectOption(version.id);
  await meal.getByLabel("Portioner", { exact: true }).fill("3");
  await button("Klar").click();
  await button("Spara vecka").click();
  await text("Veckoplanen sparades.").waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await button("Inköpslista").click();
  await text("Behövs: 600 g").waitFor();
  await text("Från skafferiet: 400 g").waitFor();
  await text("Att köpa: 200 g").waitFor();
  assert.deepEqual(await pantry(), confirmed);
  await capture("pantry-shopping", 390);
  await capture("pantry-shopping", 1440);
  report.passed.push("real_plan_reload_shows_200g_without_changing_stock");

  report.phase = "pantry_uncertain";
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
}
