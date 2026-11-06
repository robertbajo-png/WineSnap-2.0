import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { acceptOwnedCoreStates } from "./owned-core-states.mjs";
describe("disposable core-state probes", () => {
  it("rejects a real or foreign account manifest before browser activity", async () => {
    await expect(acceptOwnedCoreStates({ fixture: { userId: "real" } })).rejects.toThrow();
  });
  it("keeps all AI replies synthetic and verifies stable write IDs", () => {
    const source = readFileSync(new URL("./owned-core-states.mjs", import.meta.url), "utf8");
    const compact = source.replace(/\s+/g, "");
    expect(compact).toContain('model:"synthetic-ui-probe"');
    expect(compact).toContain("chefRequests[0].requestId,chefRequests[1].requestId");
    expect(compact).toContain("versions[0],versions[1]");
    expect(compact).toContain("assert.equal(wineWrites,1)");
    expect(compact).toContain("awaitpage.unroute(...route)");
    expect(source).not.toMatch(
      /api\.openai\.com|generativelanguage|storageState\(|writeFile|localStorage/,
    );
    const browser = readFileSync(new URL("./owned-pilot-browser.mjs", import.meta.url), "utf8");
    expect(browser).toContain('serviceWorkers: "block"');
  });
});
