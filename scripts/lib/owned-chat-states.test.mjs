import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { acceptOwnedChatStates } from "./owned-chat-states.mjs";

describe("manual installed chat acceptance boundary", () => {
  it("rejects a real/nonfixture account before opening a page or route", async () => {
    await expect(acceptOwnedChatStates({ fixture: { userId: "real-owner" } })).rejects.toThrow();
  });
  it("retains exact loopback scope, bounded mocked AI and private fixture checks", () => {
    const source = readFileSync(new URL("./owned-chat-states.mjs", import.meta.url), "utf8");
    expect(source).toContain("validateBrowserFixture(fixture)");
    expect(source).toContain("assert.equal(new URL(page.url()).origin, ownedApp)");
    expect(source).toContain('ownedApp + "/api/ai/ask-winesnap"');
    expect(source).toContain("result.simulatedAiRequests <= 2");
    expect(source).toContain("context.unroute(endpoint, handler)");
    expect(source).not.toContain("storageState(");
    expect(source).not.toContain("request.headers()");
    expect(source).not.toContain("fetch(");
  });
});
