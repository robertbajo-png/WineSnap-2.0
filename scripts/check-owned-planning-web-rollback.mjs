import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import { acceptPantryStock } from "./lib/pantry-database-browser.mjs";
import { createPlanningDatabaseFixture } from "./lib/planning-database-browser.mjs";
import { planningMigration } from "./lib/owned-planning-preflight.mjs";
import { acceptRecipeNutrition } from "./lib/recipe-nutrition-browser.mjs";

const tag = process.argv[2];
assert.ok(process.platform === "win32" && process.argv.length === 3);
const stage = tag?.match(/^winesnap-planning-rehearsal:(dev0[678])-[a-f0-9]{7,40}$/)?.[1];
assert.ok(stage);
const pantry = stage === "dev07";
const nutrition = stage === "dev08";
const scope = { pantry, nutrition };
const report = {
  scope: `${stage}_isolated_web_rollback`,
  syntheticAccountsOnly: true,
  installedAppTouched: false,
  productionTouched: false,
  hostedTestTouched: false,
  phase: "inspect_image_identity",
  completed: false,
  cleanupCompleted: false,
  externalRequests: 0,
  mutations: 0,
  fixtureErrors: 0,
  pageErrors: 0,
  passed: [],
};
const backend = isolatedPlanningBackend(report, {
  meals: pantry || nutrition,
  throughMigration: stage === "dev06" ? planningMigration : undefined,
});
let browser, denyProxy;
const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });

try {
  const previous = await backend.inspectPreviousOwnedWeb(scope);
  const nextImage = await backend.candidateImage(tag, scope);
  assert.match(nextImage, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(nextImage, previous.image);
  // The reservation only chooses a loopback origin for Chromium's storage scope.
  // Every request is served through an intercepted fixture route, not this socket.
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await closeServer(reservation);
  assert.ok(![5212, 54323, 8026].includes(port));
  const base = "http://127.0.0.1:" + port;
  const { chromium } = await import(
    pathToFileURL(
      join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
    ).href
  );
  const previousBase = "http://localhost:5212";
  let deniedLoopback = 0,
    deniedCanaries = 0;
  report.phase = "verify_browser_network_backstop";
  denyProxy = createServer((request, response) => {
    try {
      const url = new URL(request.url);
      if (["127.0.0.1", "localhost"].includes(url.hostname)) {
        deniedLoopback++;
        if (url.pathname === "/canary") deniedCanaries++;
      }
    } catch {
      /* Refuse relative and malformed requests too. */
    }
    response.writeHead(403, {
      "x-winesnap-fixture": "network-denied",
      "content-type": "text/plain",
      Connection: "close",
    });
    response.end("Network disabled for this browser.");
  });
  denyProxy.on("connect", (_request, socket) => socket.destroy());
  denyProxy.listen(0, "127.0.0.1");
  await once(denyProxy, "listening");
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:" + denyProxy.address().port, bypass: "<-loopback>" },
  });
  const sentinel = createServer((_request, response) => response.end("Direct connection."));
  sentinel.listen(0, "127.0.0.1");
  await once(sentinel, "listening");
  try {
    const probe = await browser.newPage();
    try {
      // Before any test navigation, prove both local URL forms hit the deny proxy.
      for (const host of ["127.0.0.1", "localhost"]) {
        const response = await probe.goto(`http://${host}:${sentinel.address().port}/canary`);
        assert.equal(response.status(), 403);
        assert.equal(await response.headerValue("x-winesnap-fixture"), "network-denied");
      }
      assert.equal(deniedCanaries, 2);
    } finally {
      await probe.close();
    }
  } finally {
    await closeServer(sentinel);
  }
  report.browserBackstopVerified = true;
  const deniedBeforeRehearsal = deniedLoopback;
  await backend.boot();
  assert.equal(report.isolatedMigrationsApplied, stage === "dev06" ? 38 : 40);
  const fixture = await createPlanningDatabaseFixture({
    backend,
    base,
    origin: "http://127.0.0.1:54323",
    key: "sb_publishable_runtime_check_not_a_real_key",
    relayWeb: backend.requestWeb,
    report,
    pantry: pantry || nutrition,
  });
  async function pageForImage(legacy, account = fixture.owner) {
    const stage = legacy ? "previous_web" : "candidate_web";
    const pageOrigin = legacy ? previousBase : base;
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    await context.route("**/*", async (route) => {
      try {
        await fixture.route(route, legacy);
      } catch {
        report.fixtureErrors++;
        const { pathname } = new URL(route.request().url());
        if (/^\/(?:rest|auth)\/v1\/(?:rpc\/)?[a-z_]+$/.test(pathname))
          report.lastFixtureRouteFailure = route.request().method() + " " + pathname;
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on("pageerror", () => report.pageErrors++);
    report.phase = stage + "_login_document";
    await page.goto(pageOrigin + "/login", { waitUntil: "networkidle" });
    report.phase = stage + "_login_submit";
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    assert.ok((await page.locator("#email").inputValue()) === account.email);
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await page.waitForURL(
      (url) => url.origin === pageOrigin && ["/", "/onboarding"].includes(url.pathname),
    );
    return { context, page };
  }
  const title = "Syntetiskt recept för återgångsprov";
  report.phase = "candidate_web_save";
  const nextContainer = await backend.replaceRehearsalWeb(nextImage);
  const candidate = await pageForImage(false);
  const { page } = candidate;
  const buttons = (screen) => (name) =>
    screen.getByRole("button", { name, exact: typeof name === "string" });
  async function planFor(account) {
    const rows = await fixture.rest(account, "/kitchen_week_plans?select=*");
    assert.equal(rows.status, 200);
    const data = await rows.json();
    assert.equal(data.length, 1);
    return data[0];
  }
  async function addManualItem(screen, name) {
    const button = buttons(screen);
    await button("Inköpslista").click();
    await button("Lägg till vara").click();
    await screen.getByLabel("Vara", { exact: true }).fill(name);
    await button("Klar").click();
    await button("Spara vecka").click();
    await screen.getByText("Veckoplanen sparades.", { exact: true }).waitFor();
  }
  let recipe, nutritionReceipt;
  if (nutrition) {
    nutritionReceipt = await acceptRecipeNutrition({ page, base, fixture, report });
    recipe = nutritionReceipt.originalVersion;
  } else if (pantry) {
    recipe = await acceptPantryStock({
      page,
      base,
      fixture,
      backend,
      report,
    });
  } else {
    report.phase = "candidate_web_save";
    recipe = await fixture.recipe(fixture.owner, title);
    const button = buttons(page);
    await page.goto(base + "/kitchen#plan", { waitUntil: "domcontentloaded" });
    await button(/^Lägg till måltid/)
      .first()
      .click();
    await page.getByRole("dialog").getByRole("combobox").nth(1).selectOption(recipe.id);
    await page.getByLabel("Portioner", { exact: true }).fill("3");
    await button("Klar").click();
    await button("Inköpslista").click();
    await page.getByText("300 g", { exact: true }).waitFor();
    await addManualItem(page, "Syntetisk inköpsrad");
  }
  const plan = await planFor(fixture.owner);
  assert.equal(plan.revision, 1);
  assert.equal(plan.document.meals[0].recipeVersionId, recipe.id);
  assert.equal(plan.document.meals[0].servings, 3);
  if (pantry) assert.equal(plan.document.meals[0].dinerIds.length, 1);
  else if (nutrition) assert.deepEqual(plan, nutritionReceipt.plan);
  else assert.equal(plan.document.manualItems[0].item.name, "Syntetisk inköpsrad");
  report.passed.push("candidate_image_saved_week_plan_through_browser");
  await candidate.context.close();

  report.phase = "capture_before_web_replacement";
  await fixture.refreshFixtureLogin(fixture.peer);
  const peerRecipe = await fixture.recipe(fixture.peer, "Syntetiskt recept för annat konto");
  let peerDiner;
  if (nutrition) {
    peerDiner = randomUUID();
    const inserted = await backend.admin("/kitchen_diners", {
      method: "POST",
      body: JSON.stringify({
        id: peerDiner,
        user_id: fixture.peer.id,
        document: { name: "Syntetisk matgäst", kind: "adult", preferences: [] },
      }),
    });
    assert.equal(inserted.status, 201);
    const item = await fixture.rest(fixture.owner, "/rpc/kitchen_save_pantry_item", {
      _item_id: randomUUID(),
      _expected_revision: 0,
      _request_id: randomUUID(),
      _item: { name: "Tomater", unit: "g", amount: 400, confirmed: true },
    });
    assert.equal(item.status, 200);
  }
  const peerSave = await fixture.rest(fixture.peer, "/rpc/kitchen_save_week_plan", {
    _week_start: plan.week_start,
    _expected_revision: 0,
    _request_id: randomUUID(),
    _document: {
      weekStart: plan.week_start,
      meals: [
        {
          date: plan.week_start,
          meal: "dinner",
          recipeVersionId: peerRecipe.id,
          servings: 2,
          ...(peerDiner ? { dinerIds: [peerDiner] } : {}),
        },
      ],
      manualItems: [],
      shoppingEdits: [],
    },
  });
  assert.equal(peerSave.status, 200);
  const peerPlan = await planFor(fixture.peer);
  const before = await backend.planSnapshot(scope);
  assert.equal(before.relations.find(({ table }) => table === "kitchen_week_plans")?.rows, 2);
  if (pantry) {
    for (const table of ["kitchen_pantry", "kitchen_pantry_consumption", "cooking_sessions"]) {
      assert.equal(before.relations.find((relation) => relation.table === table)?.rows, 1);
    }
  }
  if (nutrition) {
    const rows = (table) => before.relations.find((relation) => relation.table === table)?.rows;
    assert.equal(rows("kitchen_recipe_versions"), 3);
    assert.equal(rows("kitchen_diners"), 1);
    assert.equal(rows("kitchen_pantry"), 1);
  }
  function verifySnapshot(after, { afterNormalUse = false, editedPlan = false } = {}) {
    const key = ({ schema, table }) => schema + "." + table;
    const expected = before.relations.filter(
      ({ table }) => !editedPlan || table !== "kitchen_week_plans",
    );
    const compared = after.relations.filter(
      ({ table }) => !editedPlan || table !== "kitchen_week_plans",
    );
    const relations = new Map(after.relations.map((row) => [key(row), row]));
    const differences = expected
      .filter((row) => {
        const copy = relations.get(key(row));
        return row.sha256 !== copy?.sha256 || row.rows !== copy?.rows;
      })
      .map(key);
    const { sequences: beforeCounters, ...beforeCatalog } = before.catalog;
    const { sequences: afterCounters, ...afterCatalog } = after.catalog;
    const changedCatalog = Object.keys(beforeCatalog).filter(
      (name) => beforeCatalog[name] !== afterCatalog[name],
    );
    if (differences.length) report.changedRelations = differences;
    if (changedCatalog.length) report.changedCatalogSections = changedCatalog;
    assert.deepEqual(compared, expected);
    assert.deepEqual(afterCatalog, beforeCatalog);
    assert.deepEqual(after.sequenceDefinitions, before.sequenceDefinitions);
    // Ordinary sign-in inserts a refresh token. The allocator position is
    // checked for the swap itself, but can legitimately advance on sign-in.
    if (!afterNormalUse) assert.equal(afterCounters, beforeCounters);
    else report.sequenceCountersChangedDuringUse = afterCounters !== beforeCounters;
  }

  report.phase = "exact_previous_web_replace";
  const previousClone = await backend.replaceRehearsalWeb(previous.image);
  assert.notEqual(previousClone, nextContainer);
  assert.notEqual(previousClone, previous.container);
  report.phase = "verify_replacement_before_legacy_session";
  verifySnapshot(await backend.planSnapshot(scope));
  report.passed.push("web_image_replacement_did_not_change_plans_or_schema");
  const fallback = await pageForImage(true);
  if (nutrition) {
    report.phase = "previous_web_reads_new_recipe_and_pinned_plan";
    await fallback.page.goto(previousBase + "/kitchen", { waitUntil: "domcontentloaded" });
    await buttons(fallback.page)(new RegExp(nutritionReceipt.title)).click();
    await fallback.page
      .getByRole("heading", { name: nutritionReceipt.title, exact: true })
      .waitFor();
    await fallback.page.getByText("Squash", { exact: true }).waitFor();
    const versionsResponse = await fixture.rest(
      fixture.owner,
      `/kitchen_recipe_versions?select=*&recipe_id=eq.${recipe.recipeId}&order=revision.asc`,
    );
    assert.equal(versionsResponse.status, 200);
    const versions = await versionsResponse.json();
    assert.equal(versions.length, 2);
    assert.deepEqual(versions[1], nutritionReceipt.savedVersion);
    await fallback.page.goto(previousBase + "/kitchen#plan", { waitUntil: "domcontentloaded" });
    await buttons(fallback.page)("Inköpslista").click();
    await fallback.page.getByText("Pasta", { exact: true }).waitFor();
    await fallback.page.getByText("300 g", { exact: true }).waitFor();
    assert.equal(await fallback.page.getByText("Squash", { exact: true }).count(), 0);
    assert.deepEqual(await planFor(fixture.owner), plan);
    await fallback.page.goto(previousBase + "/kitchen#pantry", { waitUntil: "domcontentloaded" });
    await fallback.page.getByText("Tomater", { exact: true }).waitFor();
    report.passed.push("exact_previous_image_read_new_version_pinned_shopping_and_stock");
  } else if (pantry) {
    report.phase = "previous_web_refuses_incompatible_diner_plan";
    await fallback.page.goto(previousBase + "/kitchen#plan", { waitUntil: "domcontentloaded" });
    // DEV-06's strict meal schema cannot decode DEV-07's dinerIds field.
    await buttons(fallback.page)("Försök igen").waitFor();
    assert.equal(await buttons(fallback.page)("Spara vecka").count(), 0);
    assert.equal(await fallback.page.locator('option[value="pantry"]').count(), 0);
    assert.deepEqual(await planFor(fixture.owner), plan);
    report.passed.push("exact_previous_image_refused_incompatible_plan_without_writing");
  } else {
    report.phase = "previous_web_recipe";
    await fallback.page.goto(previousBase + "/kitchen", { waitUntil: "domcontentloaded" });
    await fallback.page.getByRole("button", { name: new RegExp(title) }).click();
    await fallback.page.getByRole("heading", { name: title, exact: true }).waitFor();
    assert.equal(await fallback.page.locator('option[value="plan"]').count(), 0);
    report.phase = "previous_web_existing_cook_mode";
    await buttons(fallback.page)("Börja laga").click();
    await fallback.page.waitForURL("**/kitchen#cook");
    await fallback.page.getByText("Teststeg", { exact: true }).waitFor();
    const fallbackSessions = await fixture.rest(
      fixture.owner,
      "/cooking_sessions?select=recipe_version_id,state",
    );
    assert.equal(fallbackSessions.status, 200);
    const [oldCook] = await fallbackSessions.json();
    assert.equal(oldCook.recipe_version_id, recipe.id);
    assert.equal(oldCook.state.servings, 2);
    report.passed.push("exact_previous_image_signed_in_and_cooked_existing_recipe");
  }
  await fallback.context.close();

  report.phase = "verify_rollback_preserved_plans_after_normal_use";
  verifySnapshot(await backend.planSnapshot(scope), { afterNormalUse: true });
  report.passed.push("both_plans_recipes_and_schema_unchanged_after_normal_use");
  if (pantry) {
    const legacyWriter = await pageForImage(true, fixture.peer);
    report.phase = "previous_web_edit_compatible_plan";
    await legacyWriter.page.goto(previousBase + "/kitchen#plan", { waitUntil: "domcontentloaded" });
    await legacyWriter.page.getByText(peerRecipe.title, { exact: true }).waitFor();
    const item = "Syntetisk vara från tidigare version";
    await addManualItem(legacyWriter.page, item);
    const edited = await planFor(fixture.peer);
    assert.equal(edited.revision, peerPlan.revision + 1);
    const { manualItems, ...unchanged } = edited.document;
    assert.equal(manualItems.length, 1);
    assert.equal(manualItems[0].item.name, item);
    assert.deepEqual({ ...unchanged, manualItems: [] }, peerPlan.document);
    assert.deepEqual(await planFor(fixture.owner), plan);
    await legacyWriter.context.close();
    verifySnapshot(await backend.planSnapshot(scope), { afterNormalUse: true, editedPlan: true });
    report.passed.push("previous_image_edit_of_compatible_plan_preserved_diners_stock_and_receipt");
  }
  if (nutrition) {
    const legacyPeer = await pageForImage(true, fixture.peer);
    report.phase = "previous_web_reads_existing_diner_plan";
    await legacyPeer.page.goto(previousBase + "/kitchen#plan", { waitUntil: "domcontentloaded" });
    await legacyPeer.page
      .getByText("Matgäster: Syntetisk matgäst", { exact: true })
      .waitFor({ timeout: 60000 });
    assert.deepEqual(await planFor(fixture.peer), peerPlan);
    await legacyPeer.context.close();
    verifySnapshot(await backend.planSnapshot(scope), { afterNormalUse: true });
    report.passed.push("previous_image_read_diner_plan_without_changing_rows_or_catalog");
  }
  report.phase = "verify_installed_image_and_network_untouched";
  assert.deepEqual(await backend.inspectPreviousOwnedWeb(scope), previous);
  assert.equal(report.externalRequests, 0);
  assert.equal(report.mutations, 0);
  assert.equal(report.fixtureErrors, 0);
  assert.equal(report.pageErrors, 0);
  assert.equal(report.realFixtureLogins, pantry || nutrition ? 3 : 2);
  assert.equal(deniedLoopback, deniedBeforeRehearsal);
  report.passed.push("installed_web_untouched_and_no_browser_traffic_escaped_fixture");
  report.plansVerified = 2;
  report.previousWebImage = previous.image;
  report.candidateImage = nextImage;
  report.completed = true;
} catch (error) {
  report.failure = "isolated_planning_web_rollback_not_accepted";
  report.errorType = ["AssertionError", "TimeoutError"].includes(error.name) ? error.name : "Error";
  const browserCode = String(error.message).match(/net::(ERR_[A-Z_]+)\b/)?.[1];
  if (browserCode) report.browserErrorCode = browserCode;
  if (/^[0-9A-Z]{5}$/.test(error.code ?? "")) report.databaseErrorCode = error.code;
  if (Number.isInteger(error.actual) && Number.isInteger(error.expected))
    report.numericAssertion = { actual: error.actual, expected: error.expected };
} finally {
  await browser?.close().catch(() => {});
  let proxyClosed = true;
  if (denyProxy?.listening)
    await closeServer(denyProxy).catch(() => {
      proxyClosed = false;
    });
  report.cleanupCompleted = (await backend.close()) && proxyClosed;
  console.log(JSON.stringify(report));
  process.exitCode = report.completed && report.cleanupCompleted ? 0 : 1;
}
