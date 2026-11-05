import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acceptOwnedPilotUi, pilotViewports } from "./owned-pilot-browser.mjs";

describe("owned pilot browser acceptance boundary", () => {
  it("requires valid owned credentials before preparing files or fixtures", async () => {
    await expect(
      acceptOwnedPilotUi({}, { remember: () => {}, artifactDirectory: "not-used" }),
    ).rejects.toThrow();
  });
  it("covers all agreed phone, tablet and desktop widths", () => {
    expect(pilotViewports).toEqual([360, 390, 430, 1024, 1440]);
  });
  it("does not save browser sessions or allow remote/provider requests", () => {
    const source = readFileSync(new URL("./owned-pilot-browser.mjs", import.meta.url), "utf8");
    expect(source).toContain("offlineRequestPolicy(route.request().url())");
    expect(source).toContain("return route.abort()");
    expect(source).toContain("assert.equal(report.blockedAiRequests, 0)");
    expect(source).toContain('ownedBrowserFixture(keys, "cleanup", fixture)');
    expect(source).not.toContain("storageState(");
    expect(source).not.toContain("launchPersistentContext");
  });
});
