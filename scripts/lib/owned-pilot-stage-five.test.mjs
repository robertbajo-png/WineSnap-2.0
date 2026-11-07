import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { recipeSchema } from "../../src/features/kitchen/domain.ts";
import { ownedDemoRecipe } from "./owned-demo-data.mjs";
import { fixtureImagePaths } from "./owned-browser-fixture.mjs";
import { showOwnedPilotDemo, demoLifetimeMs } from "./owned-pilot-demo.mjs";
import { acceptOwnedLiveJourneys } from "./owned-pilot-live.mjs";

const manifest = () => {
  const run = randomUUID();
  return {
    project: "winesnap-owned-local",
    run,
    email: `owned-browser-${run}@example.test`,
    ...Object.fromEntries(
      ["userId", "wineId", "noteId", "shareId", "versionId", "sessionId"].map((k) => [
        k,
        randomUUID(),
      ]),
    ),
  };
};
describe("owned pilot acceptance and demo boundaries", () => {
  it("rejects invalid credentials and real account manifests before activity", async () => {
    await expect(showOwnedPilotDemo({}, {})).rejects.toThrow();
    await expect(acceptOwnedLiveJourneys({ fixture: { userId: "real" } })).rejects.toThrow();
  });
  it("uses a real recipe contract and existing local photography", () => {
    const recipe = ownedDemoRecipe();
    expect(recipeSchema.safeParse(recipe).success).toBe(true);
    expect(recipe.image).toBe("cauliflower");
    expect(recipe.sourceNote).toMatch(/Demo/);
    expect(demoLifetimeMs).toBe(900000);
  });
  it("only cleans image paths below the validated fixture owner", () => {
    const fixture = manifest(),
      path = fixture.userId + "/" + randomUUID() + ".webp";
    expect(fixtureImagePaths([path, null, path], fixture)).toEqual([path]);
    for (const bad of [
      randomUUID() + "/x.webp",
      fixture.userId + "/../x.webp",
      "https://example.com/x.webp",
      fixture.userId + "/nested/x.webp",
    ])
      expect(() => fixtureImagePaths([bad], fixture)).toThrow();
    expect(() => fixtureImagePaths(Array(201).fill(null), fixture)).toThrow();
  });
  it("bounds live requests and does not export tokens or browser state", () => {
    const live = readFileSync(new URL("./owned-pilot-live.mjs", import.meta.url), "utf8").replace(
      /\s+/g,
      "",
    );
    expect(live).toContain("++count.scan,1");
    expect(live).toContain("++count.chef,1");
    expect(live).toContain("bytesMatched:digest(bytes)===digest(original)");
    expect(live).toContain("assert.equal(report.image.bytesMatched,true)");
    expect(live).toContain("awaitpage.unroute(scanPattern,gate)");
    expect(live).not.toMatch(/storageState\(|writeFile|console\./);
    const demo = readFileSync(new URL("./owned-pilot-demo.mjs", import.meta.url), "utf8");
    expect(demo).toContain("offlineRequestPolicy");
    expect(demo).toContain('model: "Demo');
    expect(demo).not.toMatch(/storageState\(|setSession\(|console\.|api\.openai\.com/);
    expect(demo).toContain('ownedBrowserFixture(keys, "cleanup", fixture');
  });
});
