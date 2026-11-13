import assert from "node:assert/strict";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";

// Only the caller's tagged disposable fixture, with normal browser Auth/RLS.
export async function acceptOwnedCollectorStates({ page, context, fixture, phase, pass, capture }) {
  validateBrowserFixture(fixture);
  assert.equal(new URL(page.url()).origin, ownedApp);
  const endpoint = ownedApi + "/rest/v1/collector_lots*";
  const result = {
    completed: false,
    insertRequests: 0,
    updateRequests: 0,
    committedInsertReplyLost: false,
    fixtureErrors: 0,
  };
  let createdId;
  const handler = async (route) => {
    try {
      const request = route.request(),
        url = new URL(request.url()),
        method = request.method();
      assert.equal(url.origin, ownedApi);
      assert.equal(url.pathname, "/rest/v1/collector_lots");
      if (["GET", "OPTIONS"].includes(method)) return route.fallback();
      const body = request.postDataJSON();
      assert.equal(body.wine_id, fixture.wineId);
      if (method === "POST") {
        assert.equal(body.user_id, fixture.userId);
        assert.equal(typeof body.id === "string" && /^[a-f0-9-]{36}$/.test(body.id), true);
        createdId = body.id;
        result.insertRequests++;
        assert.equal(result.insertRequests, 1);
        const saved = await route.fetch({ maxRedirects: 0, timeout: 15000 });
        assert.equal(saved.status(), 201);
        result.committedInsertReplyLost = true;
        await route.abort("failed");
        return;
      }
      assert.equal(method, "PATCH");
      assert.equal(url.searchParams.get("user_id"), "eq." + fixture.userId);
      assert.equal(url.searchParams.get("id"), "eq." + createdId);
      assert.equal(Boolean(url.searchParams.get("updated_at")?.startsWith("eq.")), true);
      result.updateRequests++;
      assert.equal(result.updateRequests, 1);
      return route.fallback();
    } catch {
      result.fixtureErrors++;
      await route.abort().catch(() => {});
    }
  };
  try {
    await context.route(endpoint, handler);
    phase("collector_installed_read");
    await page.goto(ownedApp + "/cellar/collection", { waitUntil: "domcontentloaded" });
    await page.getByText("Inga ink\u00f6p i denna vy.", { exact: true }).waitFor();
    pass("collector_installed_private_read");
    await page.getByRole("button", { name: "L\u00e4gg till ink\u00f6p", exact: true }).click();
    const form = page.locator("form"),
      save = () => form.getByRole("button", { name: "Spara", exact: true });
    await form.getByRole("combobox", { name: "Vin", exact: true }).selectOption(fixture.wineId);
    await form.getByLabel("Ink\u00f6pspris per flaska", { exact: true }).fill("100");
    phase("collector_installed_uncertain_insert");
    await save().click();
    await form.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: /Local browser QA Chardonnay/ }).waitFor();
    assert.equal(result.insertRequests, 1);
    assert.equal(result.committedInsertReplyLost, true);
    pass("collector_installed_lost_insert_reply_reconciled");
    await page.getByRole("button", { name: "Redigera ink\u00f6p", exact: true }).click();
    await form.getByLabel("Ink\u00f6pspris per flaska", { exact: true }).fill("125");
    await form.getByText("Manuell v\u00e4rdering (valfri)", { exact: true }).click();
    await form.getByLabel("Uppskattat andrahandspris per flaska", { exact: true }).fill("0");
    await form.getByLabel("V\u00e4rderingsdatum", { exact: true }).fill("2026-11-13");
    await form
      .getByLabel("V\u00e4rderingsk\u00e4lla", { exact: true })
      .fill("Synthetic local collector reference");
    phase("collector_installed_revision_edit");
    await save().click();
    await form.waitFor({ state: "hidden" });
    await page.getByText(/Synthetic local collector reference/).waitFor();
    assert.equal(result.updateRequests, 1);
    assert.equal(result.fixtureErrors, 0);
    pass("collector_installed_revision_edit_with_source");
    await capture("collector", 390);
    result.completed = true;
    return result;
  } finally {
    await context.unroute(endpoint, handler);
  }
}
