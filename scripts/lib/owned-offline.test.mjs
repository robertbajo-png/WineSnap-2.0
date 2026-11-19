import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { offlineRequestPolicy, acceptOwnedOffline } from "./owned-offline.mjs";

describe("owned offline acceptance boundaries", () => {
  it("allows only exact owned loopback origins and blocks AI calls", () => {
    expect(offlineRequestPolicy("http://127.0.0.1:5212/kitchen")).toBe("local");
    expect(offlineRequestPolicy("http://127.0.0.1:54323/rest/v1/cooking_sessions")).toBe("local");
    for (const url of [
      "https://wine-scene-snap.lovable.app/kitchen",
      "https://pzniyupmgwvlldvztzqh.supabase.co",
      "http://127.0.0.1:5210/",
      "http://localhost:5212/",
      "http://127.0.0.1:5212.evil.test/",
      "https://generativelanguage.googleapis.com/",
    ])
      expect(offlineRequestPolicy(url)).toBe("external");
    expect(offlineRequestPolicy("http://127.0.0.1:5212/api/ai/recommend")).toBe("ai");
    expect(offlineRequestPolicy("http://127.0.0.1:5212/api/chef")).toBe("ai");
  });
  it("rejects unowned credentials before touching the browser or fixtures", async () => {
    await expect(acceptOwnedOffline({ project: "foreign" }, {})).rejects.toThrow();
  });
  it("uses genuine isolated browser network emulation and guarded cleanup", () => {
    const source = readFileSync(new URL("./owned-offline.mjs", import.meta.url), "utf8");
    expect(source).toContain("browser.newContext(");
    expect(source).toContain("context.setOffline(true)");
    expect(source).toContain("await inspect(), initial");
    expect(source).toContain('ownedBrowserFixture(keys, "cleanup", fixture)');
    expect(source).toContain('ownedBrowserFixture(keys, "absent", previous)');
    expect(source).toContain("finally {");
    expect(source).not.toMatch(
      /storageState|recordHar|tracing|console\.|defineProperty|addInitScript/,
    );
  });
});
