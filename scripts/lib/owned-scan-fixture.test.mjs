import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verifyOwnedScanFixture } from "./owned-scan-fixture.mjs";
const wine = () => ({
  identity: {
    producer: { value: "Zehn Morgen" },
    wine_name: { value: "Kalk & Sandstein" },
    vintage: { value: "2023" },
    grape_varieties: [{ value: "Chardonnay" }, { value: "Weisser Burgunder" }],
  },
});
describe("manual owned original-label acceptance", () => {
  it("verifies the actual evidence contract and both printed grapes", () => {
    expect(verifyOwnedScanFixture(wine())).toEqual({
      identified: true,
      vintage: 2023,
      bothGrapes: true,
    });
    const german = wine();
    german.identity.grape_varieties[1].value = "Wei\u00dfer Burgunder";
    expect(verifyOwnedScanFixture(german).bothGrapes).toBe(true);
    const short = wine();
    short.identity.vintage.value = "20 / 23";
    expect(verifyOwnedScanFixture(short).vintage).toBe(2023);
  });
  it("rejects wrong identities, lost grapes and unsupported vintages", () => {
    expect(() => verifyOwnedScanFixture(null)).toThrow();
    const other = wine();
    other.identity.producer.value = "Other winery";
    expect(() => verifyOwnedScanFixture(other)).toThrow();
    const old = wine();
    old.identity.vintage.value = "2021";
    expect(() => verifyOwnedScanFixture(old)).toThrow();
    const missing = wine();
    missing.identity.grape_varieties.pop();
    expect(() => verifyOwnedScanFixture(missing)).toThrow();
    const wrongContract = wine();
    wrongContract.identity.grapes = wrongContract.identity.grape_varieties;
    delete wrongContract.identity.grape_varieties;
    expect(() => verifyOwnedScanFixture(wrongContract)).toThrow();
  });
  it("never schedules live scans or confuses provider calls with browser network leaks", () => {
    const watch = readFileSync(new URL("../watch-owned-windows.ps1", import.meta.url), "utf8");
    expect(watch).not.toContain("ScanAccept");
    const acceptance = readFileSync(new URL("./owned-acceptance.mjs", import.meta.url), "utf8");
    expect(acceptance).toContain("report.liveProviderScenarios = 1");
    expect(acceptance).toContain("assert.equal(report.externalRequests, 0)");
  });
});
