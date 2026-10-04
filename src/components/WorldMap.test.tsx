import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorldMap } from "./WorldMap";
import { lookup } from "@/lib/wineOriginCoordinates";

describe("wine origin map", () => {
  it("locates appellations before country centroids", () => {
    expect(lookup("AOP Bordeaux", "France")).toEqual([-0.6, 44.8]);
    expect(lookup("Tokaji", null)).toEqual([21.4, 48.1]);
    expect(lookup(null, "Chile")).toEqual([-71, -33]);
    expect(lookup(null, "New Zealand")).toEqual([172, -41]);
  });
  it("does not guess countries from arbitrary substrings", () => {
    expect(lookup("Unknown", "Belarus")).toBeNull();
    expect(lookup(null, "Unknown")).toBeNull();
    expect(lookup(null, "__proto__")).toBeNull();
    expect(lookup(null, "constructor")).toBeNull();
  });
  it("aggregates bottles at the same location and discloses missing locations", () => {
    const html = renderToStaticMarkup(
      <WorldMap
        points={[
          { region: null, country: "France", count: 2 },
          { region: null, country: "France", count: 3 },
          { region: null, country: null, count: 4 },
          { region: null, country: "Chile", count: 0 },
        ]}
      />,
    );
    expect(html).toContain("France: 5 bottles");
    expect(html).toContain("Unknown location");
    expect(html).not.toContain("dotGlow");
    expect(html).toContain("Natural Earth");
    expect(html).toContain('aria-pressed="false"');
  });
  it("renders an honest empty state", () => {
    expect(renderToStaticMarkup(<WorldMap points={[]} />)).toContain("No mapped origins yet");
  });
  it("uses detailed geographical outlines rather than hand-drawn polygons", () => {
    const html = renderToStaticMarkup(<WorldMap points={[]} />);
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain('viewBox="0 0 1000 520"');
  });
});
