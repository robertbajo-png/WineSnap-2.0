import assert from "node:assert/strict";
import { layout } from "./core-kitchen-browser.mjs";

const stamp = "2026-11-18T12:00:00Z";
const remoteId = "20000000-0000-4000-8000-000000000012";

export function createCorePlanningFixture({ kitchen, origin, owner, users, key, report, base }) {
  assert.equal(origin, "http://127.0.0.1:54323");
  assert.equal(key, "sb_publishable_runtime_check_not_a_real_key");
  const first = kitchen.version;
  const newer = {
    ...first,
    id: "20000000-0000-4000-8000-000000000013",
    revision: 2,
    document: { ...first.document, title: "Synthetic newer version" },
  };
  let current = first,
    saved = null,
    uncertain = false,
    allowCook = false;
  const writes = [],
    cooks = [];
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  return {
    writes,
    cooks,
    first,
    advanceRecipe() {
      current = newer;
    },
    allowCook() {
      allowCook = true;
    },
    uncertainNext() {
      uncertain = true;
    },
    remoteChange() {
      saved = {
        ...saved,
        revision: saved.revision + 1,
        last_request_id: remoteId,
        document: {
          ...saved.document,
          manualItems: [
            {
              id: remoteId,
              item: { name: "Synthetic other tab", amount: null, unit: null },
              checked: false,
            },
          ],
        },
      };
    },
    async route(route) {
      const request = route.request();
      const url = new URL(request.url());
      const name = url.pathname.split("/").at(-1);
      if (url.origin !== origin || request.method() === "OPTIONS") return kitchen.route(route);
      if (
        ![
          "kitchen_week_plans",
          "kitchen_save_week_plan",
          "kitchen_recipes",
          "kitchen_recipe_versions",
          "cooking_sessions",
          "kitchen_save_session",
        ].includes(name)
      )
        return kitchen.route(route);
      assert.equal(request.headers().apikey, key);
      assert.equal(users.get(request.headers().authorization)?.id, owner);
      if (name === "kitchen_save_week_plan" || name === "kitchen_save_session") {
        assert.equal(request.method(), "POST");
        const body = request.postDataJSON();
        report.simulatedWrites++;
        if (name === "kitchen_save_session") {
          assert.ok(allowCook);
          cooks.push({ version: body._version_id, servings: body._state.servings });
          return json(route, {
            id: body._id,
            user_id: owner,
            revision: 1,
            recipe_version_id: body._version_id,
            last_request_id: body._request_id,
            state: body._state,
            updated_at: stamp,
          });
        }
        writes.push(body);
        if (body._expected_revision !== (saved?.revision ?? 0))
          return json(route, { code: "PT409", message: "synthetic_conflict" }, 409);
        saved = {
          user_id: owner,
          week_start: body._week_start,
          revision: body._expected_revision + 1,
          last_request_id: body._request_id,
          document: body._document,
          updated_at: stamp,
        };
        if (uncertain) {
          uncertain = false;
          return json(route, { code: "XX000", message: "synthetic_uncertain" }, 500);
        }
        return json(route, saved);
      }
      assert.equal(request.method(), "GET");
      assert.equal(url.searchParams.get("user_id"), "eq." + owner);
      if (name === "kitchen_week_plans") {
        assert.match(url.searchParams.get("week_start"), /^eq\.\d{4}-\d\d-\d\d$/);
        return json(
          route,
          saved && url.searchParams.get("week_start") === "eq." + saved.week_start ? [saved] : [],
        );
      }
      if (name === "kitchen_recipes") {
        return json(route, [
          { id: current.recipe_id, current_version_id: current.id, revision: current.revision },
        ]);
      }
      if (name === "kitchen_recipe_versions") {
        const matched = [first, newer].filter(({ id }) => url.searchParams.get("id")?.includes(id));
        return json(
          route,
          request.headers().accept?.includes("vnd.pgrst.object") ? matched[0] : matched,
        );
      }
      return allowCook ? json(route, []) : kitchen.route(route);
    },
  };
}

export async function acceptCorePlanning({ page, base, artifacts, report, fixture, context }) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const status = (text) => page.getByText(text, { exact: true }).waitFor();
  const save = button("Spara vecka");
  const open = async () => {
    await page.getByRole("heading", { name: "Veckoplan", exact: true }).waitFor();
    await button("Måltider").waitFor();
  };
  report.phase = "plan-draft-and-explicit-save";
  await page.goto(base + "/kitchen", { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Fler vyer i köket" }).selectOption("plan");
  await open();
  await page
    .getByRole("button", { name: /^Lägg till måltid/ })
    .first()
    .click();
  await page.getByLabel("Portioner", { exact: true }).fill("3");
  await button("Klar").click();
  await status("Middag · 3 portioner");
  assert.equal(fixture.writes.length, 0);
  assert.equal(await button("Nästa vecka").isDisabled(), true);
  await save.click();
  await status("Veckoplanen sparades.");
  assert.equal(fixture.writes[0]._document.meals[0].recipeVersionId, fixture.first.id);
  assert.equal(await button("Starta planerad matlagning").isDisabled(), true);
  assert.equal(fixture.cooks.length, 0);
  report.passed.push("plan-explicit-save-pins-version-and-respects-active-cook");
  await layout(page, artifacts, report, "week-planner");
  await page.setViewportSize({ width: 320, height: 844 });
  const left = await button("Föregående vecka").boundingBox();
  const right = await button("Nästa vecka").boundingBox();
  assert.ok(left && right && Math.abs(left.y - right.y) < 1 && left.x < right.x);
  report.passed.push("week-navigation-keeps-both-arrows-aligned-on-small-screen");

  report.phase = "plan-old-version-and-shopping-edits";
  fixture.advanceRecipe();
  await page.reload({ waitUntil: "domcontentloaded" });
  await open();
  await page
    .locator(".k-week-plan")
    .getByText(fixture.first.document.title, { exact: true })
    .waitFor();
  await button("Inköpslista").click();
  await status("150 g");
  const original = fixture.first.document.ingredients[0].name;
  await button("Dölj " + original).click();
  await page.getByText("Dolda receptvaror", { exact: true }).click();
  await button("Visa " + original).click();
  await button("Justera " + original).click();
  await page.getByLabel("Mängd", { exact: true }).fill("200");
  await button("Klar").click();
  await status("200 g · Justerad");
  await page.getByRole("checkbox", { name: new RegExp(original) }).check();
  await button("Lägg till vara").click();
  await page
    .getByLabel("Vara", { exact: true })
    .fill("SyntheticManualWithALongUnbrokenPurchaseName");
  await button("Klar").click();
  await status("Mängd ej angiven");
  assert.equal(fixture.writes.length, 1);
  await layout(page, artifacts, report, "shopping-list");
  report.passed.push("shopping-scales-old-version-and-keeps-edits-in-draft");

  report.phase = "plan-conflict-and-uncertain-save";
  fixture.remoteChange();
  await save.click();
  await status("Veckoplanen har ändrats");
  await button("Hämta sparad plan").click();
  await button("Behåll mitt utkast").click();
  assert.equal(fixture.writes.length, 2);
  await context.setOffline(true);
  await status("Du är offline. Spara utkastet när du har anslutning igen.");
  assert.equal(await save.isDisabled(), true);
  await context.setOffline(false);
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Spara vecka")
        ?.disabled,
  );
  assert.equal(fixture.writes.length, 2);
  fixture.uncertainNext();
  await save.click();
  await status("Sparandet är inte bekräftat");
  await button("Hämta sparad plan").click();
  await status("Veckoplanen var redan sparad.");
  assert.equal(fixture.writes.length, 3);
  assert.equal(fixture.writes[2]._expected_revision, 2);
  assert.equal(fixture.writes[2]._document.shoppingEdits[0].checked, true);
  report.passed.push("conflict-and-unknown-recover-without-replay-or-reconnect-write");

  report.phase = "plan-cook-exact-version";
  fixture.allowCook();
  const cookPage = await context.newPage();
  await cookPage.goto(base + "/kitchen#plan", { waitUntil: "domcontentloaded" });
  await cookPage.getByText(fixture.first.document.title, { exact: true }).waitFor();
  await cookPage.getByRole("button", { name: "Starta planerad matlagning", exact: true }).click();
  await cookPage.waitForURL("**/kitchen#cook");
  assert.deepEqual(fixture.cooks, [{ version: fixture.first.id, servings: 3 }]);
  report.passed.push("cook-mode-starts-exact-saved-recipe-and-servings");
  await cookPage.close();
}
