import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acceptOwnedCollectorStates } from "./owned-collector-states.mjs";
describe("installed collector acceptance boundary", () => {
  it("rejects nonfixture input before opening a page or network route", async () => {
    await expect(
      acceptOwnedCollectorStates({ fixture: { userId: "real-owner" } }),
    ).rejects.toThrow();
  });
  it("limits forwarded writes to exact fixture IDs, loopback, one insert/edit and no redirects", () => {
    const source = readFileSync(new URL("./owned-collector-states.mjs", import.meta.url), "utf8");
    expect(source).toContain("validateBrowserFixture(fixture)");
    expect(source).toContain("assert.equal(url.origin, ownedApi)");
    expect(source).toContain("body.user_id, fixture.userId");
    expect(source).toContain("body.wine_id, fixture.wineId");
    expect(source).toContain("maxRedirects: 0");
    expect(source).toContain("context.unroute(endpoint, handler)");
    expect(source).not.toContain("request.headers()");
    expect(source).not.toContain("storageState(");
  });
});
