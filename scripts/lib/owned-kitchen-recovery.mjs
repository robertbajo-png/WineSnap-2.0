import assert from "node:assert/strict";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { assertFixtureOwner, validateBrowserFixture } from "./owned-browser-fixture.mjs";

export function assertKitchenRecoveryRead(url, method, fixture) {
  validateBrowserFixture(fixture);
  const parsed = new URL(url);
  assert.equal(parsed.origin, ownedApi);
  assert.ok(
    [
      "/rest/v1/kitchen_recipes",
      "/rest/v1/kitchen_recipe_versions",
      "/rest/v1/cooking_sessions",
    ].includes(parsed.pathname),
  );
  assert.equal(method, "GET");
  assert.equal(parsed.searchParams.get("user_id"), "eq." + fixture.userId);
}

// Tagged synthetic account only. Real Auth/RLS, no injected session or IDB edit.
export async function acceptOwnedKitchenRecovery({ page, context, fixture, phase, capture, pass }) {
  validateBrowserFixture(fixture);
  const report = {
    completed: false,
    authChecks: 0,
    blockedWrites: 0,
    fixtureErrors: 0,
    cleanupCompleted: false,
  };
  const patterns = [
    "kitchen_recipes",
    "kitchen_recipe_versions",
    "cooking_sessions",
    "rpc/kitchen_*",
  ].map((table) => ownedApi + "/rest/v1/" + table + "*");
  patterns.push(ownedApp + "/api/chef*");
  let second, root;
  const handler = async (route) => {
    let response;
    try {
      const request = route.request();
      if (request.method() !== "GET") {
        report.blockedWrites++;
        throw Error("unexpected_probe_write");
      }
      assertKitchenRecoveryRead(request.url(), request.method(), fixture);
      const headers = request.headers();
      assert.ok(headers.authorization?.startsWith("Bearer ") && headers.apikey);
      response = await context.request.get(ownedApi + "/auth/v1/user", {
        headers: { authorization: headers.authorization, apikey: headers.apikey },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 15000,
      });
      assert.equal(response.status(), 200);
      assertFixtureOwner(await response.json(), fixture);
      assert.ok(++report.authChecks <= 30);
      return await route.fallback();
    } catch {
      report.fixtureErrors++;
      return await route.abort();
    } finally {
      await response?.dispose?.();
    }
  };
  try {
    phase("kitchen_installed_read_recovery");
    for (const pattern of patterns) await context.route(pattern, handler);
    await page.goto(ownedApp + "/kitchen#cook");
    const toggle = page.getByRole("button", { name: /^(Pausa|\u00c5teruppta) matlagningen$/ });
    await toggle.waitFor();
    root = await page.locator("html").elementHandle();
    second = await context.newPage();
    await second.goto(ownedApp + "/kitchen#cook");
    await second.getByRole("button", { name: /^(Pausa|\u00c5teruppta) matlagningen$/ }).waitFor();
    await toggle.click();
    await page
      .getByText(
        "K\u00f6ket \u00e4ndrades i en annan flik. H\u00e4mta uppdateringen innan du forts\u00e4tter.",
        { exact: true },
      )
      .waitFor();
    await page.goto(ownedApp + "/kitchen#library");
    const search = page.getByRole("searchbox", { name: "S\u00f6k recept" });
    await search.fill("local qa unsaved search");
    await page.getByRole("button", { name: "H\u00e4mta igen", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    assert.equal(await search.inputValue(), "local qa unsaved search");
    assert.equal(await root.evaluate((node) => node.isConnected), true);
    await page.waitForTimeout(800);
    assert.equal(report.blockedWrites, 0);
    assert.equal(report.fixtureErrors, 0);
    assert.ok(report.authChecks >= 6);
    await capture("kitchen-read-recovered", 390);
    pass("kitchen_installed_read_recovery_preserves_document_search_and_never_replays_write");
    report.completed = true;
    return report;
  } finally {
    await root?.dispose();
    if (second && !second.isClosed()) await second.close();
    for (const pattern of patterns) await context.unroute(pattern, handler);
    report.cleanupCompleted = !second || second.isClosed();
    assert.equal(report.cleanupCompleted, true);
  }
}
