import assert from "node:assert/strict";

export async function acceptRecipeNutrition({ page, base, fixture, report, capture }) {
  const { owner, rest, recipe } = fixture;
  const title = "Syntetisk pastaratt";
  const version = await recipe(owner, title, undefined, { name: "Pasta", amount: 200 });
  const phase = (name) => {
    report.phase = name;
  };
  const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
  const text = (value) => page.getByText(value, { exact: true });
  const read = async (path) => {
    const response = await rest(owner, path);
    assert.equal(response.status, 200);
    return response.json();
  };
  const versions = () =>
    read(`/kitchen_recipe_versions?select=*&recipe_id=eq.${version.recipeId}&order=revision.asc`);
  const plans = () => read("/kitchen_week_plans?select=*");
  const showAt = async (locator, name, width) => {
    await page.setViewportSize({ width, height: 844 });
    await locator.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await capture(name, width);
  };

  phase("nutrition_seed_pinned_week_plan");
  await page.goto(base + "/kitchen#plan", { waitUntil: "domcontentloaded" });
  await button(/^Lägg till måltid/)
    .first()
    .click();
  const meal = page.getByRole("dialog", { name: "Lägg till måltid", exact: true });
  await meal.getByRole("combobox").nth(1).selectOption(version.id);
  await meal.getByLabel("Portioner", { exact: true }).fill("3");
  await button("Klar").click();
  await button("Spara vecka").click();
  await text("Veckoplanen sparades.").waitFor();
  const original = await versions(),
    pinned = await plans();
  assert.equal(original.length, 1);
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].document.meals[0].recipeVersionId, version.id);
  assert.equal(pinned[0].document.meals[0].servings, 3);

  phase("nutrition_standard_and_partial_values");
  await page.goto(base + "/kitchen", { waitUntil: "domcontentloaded" });
  await button(new RegExp(title)).click();
  const result = page.getByRole("region", { name: "Beräkningsresultat", exact: true });
  const metricList = result.locator(".nutrition-metrics");
  const verify = async (list, label, value) => {
    await list
      .locator("div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .getByText(value, { exact: true })
      .waitFor();
  };
  await result.getByRole("heading", { name: "Näring per portion", exact: true }).waitFor();
  assert.equal(await metricList.first().getByText("Saknas", { exact: true }).count(), 5);
  await text("Ingrediensunderlag").click();
  const confirm = (prefix) =>
    page
      .locator(`fieldset:has(#${prefix}-food)`)
      .getByRole("checkbox", { name: "Jag har kontrollerat referens, form och ätlig gramvikt" });
  await page.locator("#ingredient-0-food").selectOption("manual");
  await page.getByLabel("Produkt och etikett ingredient-0").fill("Syntetisk pastaetikett");
  await page.getByLabel("Protein per 100 g ingredient-0").fill("12");
  await page.locator("#ingredient-0-form").selectOption("as_sold");
  await confirm("ingredient-0").check();
  await verify(metricList.first(), "Protein", "12 g");
  await verify(metricList.first(), "Energi", "Saknas");
  report.passed.push("standard_recipe_shows_independent_known_and_missing_nutrients");

  phase("nutrition_source_basis_and_scaling");
  await page.locator("#ingredient-0-food").selectOption("slv:845");
  await page.locator("#ingredient-0-form").selectOption("cooked");
  await confirm("ingredient-0").check();
  await verify(metricList.first(), "Energi", "Saknas");
  await page.locator("#ingredient-0-form").selectOption("dry");
  assert.equal(await confirm("ingredient-0").isChecked(), false);
  await confirm("ingredient-0").check();
  for (const [label, value] of [
    ["Energi", "358 kcal"],
    ["Protein", "11,9 g"],
    ["Fett", "1,3 g"],
    ["Kolhydrater", "71,5 g"],
    ["Fiber", "4 g"],
  ]) {
    await verify(metricList.first(), label, value);
  }
  await page.locator("#ingredient-0-grams").fill("100");
  await verify(metricList.first(), "Energi", "Saknas");
  await confirm("ingredient-0").check();
  await verify(metricList.first(), "Energi", "179 kcal");
  await page.locator("#ingredient-0-grams").fill("200");
  await confirm("ingredient-0").check();
  await button("Fler portioner").click();
  await button("Fler portioner").click();
  await text("Hela receptet · 4 portioner").click();
  await verify(metricList.first(), "Energi", "358 kcal");
  await verify(metricList.nth(1), "Energi", "1\u00a0432 kcal");
  await showAt(result, "nutrition-portions", 320);
  await showAt(result, "nutrition-portions", 1440);
  report.passed.push("source_units_confirmation_and_synchronized_portion_scaling");

  phase("nutrition_optional_adult_keto_and_weighed_variant");
  await text("Kostläge").click();
  assert.equal(await page.getByRole("radio", { name: "Standard", exact: true }).isChecked(), true);
  assert.equal(await page.getByRole("radio", { name: "Keto", exact: true }).isDisabled(), true);
  assert.equal(await button("Jämför ett byte").count(), 0);
  await page.getByRole("checkbox", { name: "Jag är vuxen", exact: true }).check();
  await page.getByRole("radio", { name: "Keto", exact: true }).check();
  const compare = page.getByRole("region", { name: "Ingrediensjämförelse", exact: true });
  async function prepareSwap() {
    await button("Jämför ett byte").click();
    await button("Förslag: Squash").click();
    assert.equal(await page.locator("#replacement-grams").inputValue(), "");
    assert.equal(await button("Granska receptutkast").isDisabled(), true);
    await page.locator("#replacement-grams").fill("300");
    await page.locator("#replacement-form").selectOption("raw");
    await confirm("replacement").check();
    const row = compare.getByRole("row", { name: /^Kolhydrater/ });
    await row.getByText("71,5 g", { exact: true }).waitFor();
    await row.getByText("3,75 g", { exact: true }).waitFor();
  }
  const editor = page.getByRole("dialog");
  const review = async () => {
    await button("Granska receptutkast").click();
    assert.equal(await editor.getByLabel("Ingrediens 1", { exact: true }).inputValue(), "Squash");
    assert.equal(await editor.getByLabel("Mängd 1", { exact: true }).inputValue(), "300");
  };
  await prepareSwap();
  await showAt(compare.getByRole("table"), "nutrition-keto-comparison", 390);
  await showAt(compare.getByRole("table"), "nutrition-keto-comparison", 1440);
  report.passed.push("optional_adult_keto_compares_sourced_independently_weighed_swap");

  phase("nutrition_cancel_unwritten_draft");
  await review();
  await editor.getByRole("button", { name: "Avbryt", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  await button("Avbryt jämförelsen").click();
  assert.equal(await compare.count(), 0);
  assert.deepEqual(await versions(), original);
  assert.deepEqual(await plans(), pinned);
  await verify(metricList.first(), "Energi", "358 kcal");
  report.passed.push("rejected_nutrition_draft_did_not_write_recipe_or_plan");

  phase("nutrition_explicit_version_save_keeps_week_pinned");
  await prepareSwap();
  await review();
  await editor.getByRole("button", { name: "Spara ny version", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const saved = await versions();
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0], original[0]);
  assert.equal(saved[1].revision, 2);
  assert.deepEqual(saved[1].document.ingredients[0], {
    ...original[0].document.ingredients[0],
    name: "Squash",
    amount: 300,
  });
  assert.deepEqual(saved[1].document.steps, original[0].document.steps);
  assert.deepEqual(await plans(), pinned);
  await page.goto(base + "/kitchen#plan", { waitUntil: "domcontentloaded" });
  await button("Inköpslista").click();
  await text("300 g").waitFor();
  assert.equal(await text("Squash").count(), 0);
  report.passed.push("only_explicit_save_created_a_version_and_shopping_kept_the_original");
}
