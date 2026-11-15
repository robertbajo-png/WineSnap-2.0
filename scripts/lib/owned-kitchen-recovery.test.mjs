import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertKitchenRecoveryRead } from "./owned-kitchen-recovery.mjs";
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixture = {
  project: "winesnap-owned-local",
  run: id(1),
  userId: id(2),
  wineId: id(3),
  noteId: id(4),
  shareId: id(5),
  versionId: id(6),
  sessionId: id(7),
  email: `owned-browser-${id(1)}@example.test`,
};
const url = "http://127.0.0.1:54323/rest/v1/cooking_sessions?user_id=eq." + fixture.userId;
describe("installed kitchen read probe boundary", () => {
  it("keeps the focused mode explicit, parent-controlled, fixture-cleaned and separate from full acceptance", () => {
    const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
    const parent = read("../run-owned-windows.ps1");
    expect(parent).toContain("if($KitchenRecoveryOnly -and $Action -ne 'PilotAccept')");
    expect(parent).toContain("$start.Environment['WINESNAP_OWNED_KITCHEN_RECOVERY_ONLY']='1'");
    expect(parent).toContain("'PilotDemoAccept','BrowserCleanup'");
    const worker = read("../manage-owned-backend.mjs");
    expect(worker).toContain('action === "PilotAccept" &&');
    expect(worker).toContain('process.env.WINESNAP_OWNED_KITCHEN_RECOVERY_ONLY === "1"');
    const browser = read("./owned-pilot-browser.mjs");
    expect(browser).toContain('scope: kitchenRecoveryOnly ? "kitchen-recovery-only" : "full"');
    expect(browser).toContain("if (kitchenRecoveryOnly) assert.equal(liveJourneys, false)");
    expect(browser).toContain('ownedBrowserFixture(keys, "cleanup", fixture');
    expect(browser).toContain("for (const width of pilotViewports)");
    const recovery = read("./owned-kitchen-recovery.mjs");
    expect(recovery).toContain('await page.goto("about:blank")');
    expect(recovery).toContain("assertFixtureOwner(await auth.json(), fixture)");
    expect(recovery).toContain("assert.equal(headers.authorization, verified.authorization)");
    expect(recovery).toContain("assert.equal(headers.apikey, verified.apikey)");
  });
  it("accepts only the exact synthetic owner read", () => {
    expect(() => assertKitchenRecoveryRead(url, "GET", fixture)).not.toThrow();
  });
  it.each(["POST", "DELETE", "PUT", "PATCH"])("denies %s", (method) => {
    expect(() => assertKitchenRecoveryRead(url, method, fixture)).toThrow();
  });
  it.each([
    url.replace("127.0.0.1:54323", "example.invalid"),
    url.replace(fixture.userId, id(9)),
    url.replace("cooking_sessions", "wines"),
    url.split("?")[0],
  ])("denies out-of-scope read %s", (request) => {
    expect(() => assertKitchenRecoveryRead(request, "GET", fixture)).toThrow();
  });
  it("denies a real-account-shaped fixture before reading", () => {
    expect(() =>
      assertKitchenRecoveryRead(url, "GET", { ...fixture, email: "owner@example.invalid" }),
    ).toThrow();
  });
});
