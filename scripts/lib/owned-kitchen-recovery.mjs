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

// Tagged synthetic account only. One normal peer-tab edit, then read-only recovery.
export async function acceptOwnedKitchenRecovery({
  page,
  context,
  fixture,
  phase,
  capture,
  pass,
  report = {},
}) {
  validateBrowserFixture(fixture);
  Object.assign(report, {
    completed: false,
    authChecks: 0,
    writes: 0,
    blockedWrites: 0,
    fixtureErrors: 0,
    cleanupCompleted: false,
  });
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
      if (request.method() === "OPTIONS") return await route.fallback();
      if (!["GET", "POST"].includes(request.method())) {
        report.blockedWrites++;
        throw Error("unexpected_probe_write");
      }
      const url = new URL(request.url());
      assert.equal(url.origin, ownedApi);
      if (request.method() === "GET") assertKitchenRecoveryRead(request.url(), "GET", fixture);
      else {
        assert.equal(request.frame().page(), second);
        assert.equal(url.pathname, "/rest/v1/rpc/kitchen_save_session");
        assert.equal(report.writes, 0);
        const body = request.postDataJSON();
        assert.deepEqual(
          Object.keys(body).sort(),
          ["_id", "_version_id", "_expected_revision", "_request_id", "_state", "_feedback"].sort(),
        );
        assert.equal(body._id, fixture.sessionId);
        assert.equal(body._version_id, fixture.versionId);
        assert.equal(body._feedback, null);
        assert.ok(Number.isInteger(body._expected_revision) && body._expected_revision > 0);
        assert.match(body._request_id, /^[a-f0-9-]{36}$/);
        assert.ok(["running", "paused"].includes(body._state?.status));
        assert.ok(JSON.stringify(body._state).length < 8192);
        report.writes++;
      }
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
    const edited = second.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/rpc/kitchen_save_session" &&
        response.request().method() === "POST",
    );
    await second.getByRole("button", { name: /^(Pausa|\u00c5teruppta) matlagningen$/ }).click();
    assert.equal((await edited).status(), 200);
    await second.waitForFunction(
      () => document.querySelector(".k-status button")?.disabled === false,
    );
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
    assert.equal(report.writes, 1);
    assert.equal(report.fixtureErrors, 0);
    assert.ok(report.authChecks >= 6);
    await page.setViewportSize({ width: 390, height: 844 });
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
