import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import { createPlanningDatabaseFixture } from "./lib/planning-database-browser.mjs";

const tag = process.argv[2];
assert.ok(process.platform === "win32" && process.argv.length === 3);
assert.match(tag, /^winesnap-planning-rehearsal:dev06-[a-f0-9]{7,40}$/);
const report = {
  scope: "dev06_isolated_web_rollback",
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
const backend = isolatedPlanningBackend(report);
let browser, denyProxy;
const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });

try {
  const previous = await backend.inspectPreviousOwnedWeb();
  const nextImage = await backend.candidateImage(tag);
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
  assert.equal(report.isolatedMigrationsApplied, 38);
  const fixture = await createPlanningDatabaseFixture({
    backend,
    base,
    origin: "http://127.0.0.1:54323",
    key: "sb_publishable_runtime_check_not_a_real_key",
    relayWeb: backend.requestWeb,
    report,
  });
  async function pageForImage(legacy) {
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
    await page.locator("#email").fill(fixture.owner.email);
    await page.locator("#password").fill(fixture.owner.password);
    assert.ok((await page.locator("#email").inputValue()) === fixture.owner.email);
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
  report.phase = "candidate_web_save";
  const recipe = await fixture.recipe(fixture.owner, title);
  const { page } = candidate;
  const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
  await page.goto(base + "/kitchen#plan", { waitUntil: "domcontentloaded" });
  await button(/^Lägg till måltid/)
    .first()
    .click();
  await page.getByRole("dialog").getByRole("combobox").nth(1).selectOption(recipe.id);
  await page.getByLabel("Portioner", { exact: true }).fill("3");
  await button("Klar").click();
  await button("Inköpslista").click();
  await page.getByText("300 g", { exact: true }).waitFor();
  await button("Lägg till vara").click();
  await page.getByLabel("Vara", { exact: true }).fill("Syntetisk inköpsrad");
  await button("Klar").click();
  await button("Spara vecka").click();
  await page.getByText("Veckoplanen sparades.", { exact: true }).waitFor();
  const rows = await fixture.rest(fixture.owner, "/kitchen_week_plans?select=*");
  assert.equal(rows.status, 200);
  const [plan] = await rows.json();
  assert.equal(plan.revision, 1);
  assert.equal(plan.document.meals[0].recipeVersionId, recipe.id);
  assert.equal(plan.document.meals[0].servings, 3);
  assert.equal(plan.document.manualItems[0].item.name, "Syntetisk inköpsrad");
  report.passed.push("candidate_image_saved_week_plan_through_browser");
  await candidate.context.close();

  report.phase = "capture_before_web_replacement";
  await fixture.refreshFixtureLogin(fixture.peer);
  const peerRecipe = await fixture.recipe(fixture.peer, "Syntetiskt recept för annat konto");
  const peerSave = await fixture.rest(fixture.peer, "/rpc/kitchen_save_week_plan", {
    _week_start: plan.week_start,
    _expected_revision: 0,
    _request_id: randomUUID(),
    _document: {
      weekStart: plan.week_start,
      meals: [
        { date: plan.week_start, meal: "dinner", recipeVersionId: peerRecipe.id, servings: 2 },
      ],
      manualItems: [],
      shoppingEdits: [],
    },
  });
  assert.equal(peerSave.status, 200);
  const before = await backend.planSnapshot();
  assert.equal(before.relations.find(({ table }) => table === "kitchen_week_plans")?.rows, 2);
  function verifySnapshot(after, afterNormalUse) {
    const key = ({ schema, table }) => schema + "." + table;
    const relations = new Map(after.relations.map((row) => [key(row), row]));
    const differences = before.relations
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
    assert.deepEqual(after.relations, before.relations);
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
  verifySnapshot(await backend.planSnapshot(), false);
  report.passed.push("web_image_replacement_did_not_change_plans_or_schema");
  const fallback = await pageForImage(true);
  report.phase = "previous_web_recipe";
  await fallback.page.goto(previousBase + "/kitchen", { waitUntil: "domcontentloaded" });
  await fallback.page.getByRole("button", { name: new RegExp(title) }).click();
  await fallback.page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await fallback.page.locator('option[value="plan"]').count(), 0);
  report.phase = "previous_web_existing_cook_mode";
  await fallback.page.getByRole("button", { name: "Börja laga", exact: true }).click();
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
  await fallback.context.close();

  report.phase = "verify_rollback_preserved_plans_after_normal_use";
  verifySnapshot(await backend.planSnapshot(), true);
  report.passed.push("both_plans_recipes_and_schema_unchanged_after_normal_use");
  report.phase = "verify_installed_image_and_network_untouched";
  assert.deepEqual(await backend.inspectPreviousOwnedWeb(), previous);
  assert.equal(report.externalRequests, 0);
  assert.equal(report.mutations, 0);
  assert.equal(report.fixtureErrors, 0);
  assert.equal(report.pageErrors, 0);
  assert.equal(report.realFixtureLogins, 2);
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
