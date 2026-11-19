import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acceptOwnedPriceStates } from "./owned-price-states.mjs";
describe("installed price acceptance boundary", () => {
  it("rejects nonfixture input before opening a page or network route", async () => {
    await expect(acceptOwnedPriceStates({ fixture: { userId: "real-owner" } })).rejects.toThrow();
  });
  it("checks the exact one-wine fixture before either scan journey adds a wine", () => {
    const source = readFileSync(new URL("./owned-pilot-browser.mjs", import.meta.url), "utf8");
    const price = source.indexOf("report.priceStates = await acceptOwnedPriceStates(");
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(source.indexOf("if (liveJourneys) {"));
    expect(price).toBeLessThan(source.indexOf("report.coreStates = await acceptOwnedCoreStates("));
    expect(source.match(/report\.priceStates = await acceptOwnedPriceStates\(/g)).toHaveLength(1);
  });
  it("mocks the exact hook, never forwards a price lookup and binds reads to the fixture", () => {
    const source = readFileSync(new URL("./owned-price-states.mjs", import.meta.url), "utf8");
    expect(source).toContain("validateBrowserFixture(fixture)");
    expect(source).toContain("assert.equal(req.url(), hook)");
    expect(source).toContain("wineIds: [fixture.wineId]");
    expect(source).toContain('url.searchParams.get("user_id"), "eq." + fixture.userId');
    expect(source).toContain("context.unroute(hook, hookHandler)");
    expect(source).toContain("context.unroute(wines, readHandler)");
    expect(source).not.toContain("route.fetch(");
    expect(source).not.toContain("request.headers()");
    expect(source).not.toContain("storageState(");
  });
});
