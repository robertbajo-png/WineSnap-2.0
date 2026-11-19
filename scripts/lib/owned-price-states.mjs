import assert from "node:assert/strict";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";

// Real fixture Auth/RLS reads, but never forward a catalog/price request.
export async function acceptOwnedPriceStates({ page, context, fixture, phase, pass, capture }) {
  validateBrowserFixture(fixture);
  assert.equal(new URL(page.url()).origin, ownedApp);
  const hook = ownedApp + "/api/public/hooks/refresh-cellar-values";
  const wines = ownedApi + "/rest/v1/wines*";
  const result = {
    completed: false,
    mockedPriceRequests: 0,
    injectedReadErrors: 0,
    fixtureErrors: 0,
  };
  let failRead = true;
  const readHandler = async (route) => {
    try {
      const req = route.request(),
        url = new URL(req.url());
      assert.equal(url.origin, ownedApi);
      assert.equal(url.pathname, "/rest/v1/wines");
      if (req.method() === "OPTIONS") return route.fallback();
      assert.equal(req.method(), "GET");
      assert.equal(url.searchParams.get("user_id"), "eq." + fixture.userId);
      if (!failRead) return route.fallback();
      result.injectedReadErrors++;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: { "access-control-allow-origin": ownedApp },
        body: JSON.stringify({ code: "synthetic_price_read_error" }),
      });
    } catch {
      result.fixtureErrors++;
      await route.abort().catch(() => {});
    }
  };
  const hookHandler = async (route) => {
    try {
      const req = route.request();
      assert.equal(req.url(), hook);
      assert.equal(req.method(), "POST");
      assert.deepEqual(req.postDataJSON(), { action: "refresh", wineIds: [fixture.wineId] });
      result.mockedPriceRequests++;
      assert.equal(result.mockedPriceRequests, 1);
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "synthetic_price_failure" }),
      });
    } catch {
      result.fixtureErrors++;
      await route.abort().catch(() => {});
    }
  };
  const panel = () => page.getByRole("region", { name: "Butiksprisreferens", exact: true });
  const reload = () =>
    panel().getByRole("button", { name: "L\u00e4s in sparade priser", exact: true });
  try {
    await context.route(wines, readHandler);
    await context.route(hook, hookHandler);
    phase("price_installed_initial_read_recovery");
    await page.goto(ownedApp + "/cellar/overview", { waitUntil: "domcontentloaded" });
    await page.getByRole("alert").waitFor();
    assert.equal(await panel().count(), 0);
    failRead = false;
    await page.getByRole("button", { name: "F\u00f6rs\u00f6k igen", exact: true }).click();
    await panel().waitFor();
    assert.equal(result.mockedPriceRequests, 0);
    pass("price_installed_initial_read_retry");
    phase("price_installed_uncertain_response");
    await panel().getByRole("button", { name: "Uppdatera priser", exact: true }).click();
    await reload().waitFor();
    assert.equal(result.mockedPriceRequests, 1);
    pass("price_installed_unknown_response_recovery");
    phase("price_installed_read_only_retry");
    failRead = true;
    await reload().click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (el) => el.textContent?.trim() === "L\u00e4s in sparade priser" && !el.disabled,
      ),
    );
    assert.equal(result.injectedReadErrors, 2);
    assert.equal(result.mockedPriceRequests, 1);
    failRead = false;
    await reload().focus();
    await page.keyboard.press("Enter");
    await panel().getByRole("button", { name: "Forts\u00e4tt", exact: true }).waitFor();
    assert.equal(result.mockedPriceRequests, 1);
    assert.equal(result.fixtureErrors, 0);
    pass("price_installed_repeated_read_retry_without_catalog_repeat");
    await capture("overview-prices", 390);
    result.completed = true;
    return result;
  } finally {
    await context.unroute(wines, readHandler);
    await context.unroute(hook, hookHandler);
  }
}
