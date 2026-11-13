import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acceptOwnedPriceStates } from "./owned-price-states.mjs";
describe("installed price acceptance boundary", () => {
  it("rejects nonfixture input before opening a page or network route", async () => {
    await expect(acceptOwnedPriceStates({ fixture: { userId: "real-owner" } })).rejects.toThrow();
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
