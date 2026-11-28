import { describe, expect, it } from "vitest";
import { assertKitchenTabsFixture } from "./core-kitchen-tabs-browser.mjs";

function scope() {
  return {
    base: "http://127.0.0.1:59999",
    owner: "10000000-0000-4000-8000-000000000001",
    fixture: {
      recipeId: "10000000-0000-4000-8000-000000000002",
      sessionId: "10000000-0000-4000-8000-000000000003",
    },
    peerSession: {
      user: { id: "20000000-0000-4000-8000-000000000001" },
      access_token: "synthetic.header.synthetic-not-a-valid-signature",
    },
    authKey: "sb-127-auth-token",
    report: { synthetic: true, fixtureDataMocked: true },
  };
}
describe("isolated kitchen tab probe boundary", () => {
  it("accepts only the isolated loopback synthetic browser scope", () => {
    expect(() => assertKitchenTabsFixture(scope())).not.toThrow();
  });
  it.each([
    "installed",
    "api",
    "inbox",
    "hosted",
    "noPort",
    "query",
    "path",
    "realSession",
    "sameAccount",
    "realReport",
    "wrongKey",
  ])("rejects %s before any browser action", (kind) => {
    const value = scope();
    if (kind === "installed") value.base = "http://127.0.0.1:5212";
    if (kind === "api") value.base = "http://127.0.0.1:54323";
    if (kind === "inbox") value.base = "http://127.0.0.1:8026";
    if (kind === "hosted") value.base = "https://unapproved.example.invalid";
    if (kind === "noPort") value.base = "http://127.0.0.1";
    if (kind === "query") value.base += "?anything=1";
    if (kind === "path") value.base += "/anything";
    if (kind === "realSession") value.peerSession.access_token = "not-a-synthetic-session";
    if (kind === "sameAccount") value.peerSession.user.id = value.owner;
    if (kind === "realReport") value.report.synthetic = false;
    if (kind === "wrongKey") value.authKey = "another-key";
    expect(() => assertKitchenTabsFixture(value)).toThrow();
  });
});
