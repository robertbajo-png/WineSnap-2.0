import { describe, it, expect } from "vitest";
import { countryDisplayName, summarizeWineOrigins } from "./wineOrigins";

describe("cellar origin grouping", () => {
  it("combines country aliases, preserves regions and counts bottles, not wines", () => {
    const groups = summarizeWineOrigins([
      { country: "France", region: "Bordeaux", count: 3 },
      { country: "Frankrike", region: "Champagne", count: 1 },
      { country: "IT", region: "Toscana", count: 3 },
      { country: "Chile", region: null, count: 2 },
      { country: null, region: "Tokaji", count: 1 },
    ]);
    expect(groups.map((group) => [group.code, group.count, group.pct])).toEqual([
      ["FR", 4, 40],
      ["IT", 3, 30],
      ["CL", 2, 20],
      ["HU", 1, 10],
    ]);
    expect(groups[0].regions.map((region) => region.count)).toEqual([3, 1]);
    expect(countryDisplayName(groups[0], "sv", "Unknown")).toBe("Frankrike");
    expect(groups[3].regions[0].name).toBe("Tokaji");
  });
  it("keeps all bottles with missing or unrecognized origins", () => {
    const groups = summarizeWineOrigins([
      { country: null, region: "Mystery valley", count: 2 },
      { country: "Atlantis", region: null, count: 1 },
      { country: "France", region: null, count: 4 },
    ]);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(7);
    const unknown = groups.find((group) => group.key === "unknown")!;
    expect(unknown.regions[0].name).toBe("Mystery valley");
    expect(unknown.points[0].region).toBeNull();
    expect(groups.find((group) => group.name === "Atlantis")?.count).toBe(1);
  });
  it("does not locate a contradictory Bordeaux record in France when country is Chile", () => {
    const [group] = summarizeWineOrigins([{ country: "Chile", region: "Bordeaux", count: 1 }]);
    expect(group.code).toBe("CL");
    expect(group.regions[0].name).toBe("Bordeaux");
    expect(group.points[0].region).toBeNull();
  });
  it("does not turn a country recorded in the region field into a region row", () => {
    const [group] = summarizeWineOrigins([{ country: null, region: "FRANCE", count: 2 }]);
    expect(group.code).toBe("FR");
    expect(group.regions[0].name).toBeNull();
  });
  it("uses a total of 100% and ignores nonpositive or invalid counts", () => {
    const groups = summarizeWineOrigins(
      ["France", "Italy", "Chile"].map((country) => ({ country, region: null, count: 1 })),
    );
    expect(groups.reduce((sum, group) => sum + group.pct, 0)).toBe(100);
    expect(
      summarizeWineOrigins([
        { country: "France", region: null, count: 0 },
        { country: "Italy", region: null, count: NaN },
      ]),
    ).toEqual([]);
  });
  it("keeps US states as regions instead of treating them as country names", () => {
    const [group] = summarizeWineOrigins([{ country: null, region: "California", count: 2 }]);
    expect(group.code).toBe("US");
    expect(group.regions[0].name).toBe("California");
  });
});
