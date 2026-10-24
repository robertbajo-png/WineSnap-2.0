import { describe, expect, it } from "vitest";
import { mobileControlIssues } from "./mobile-control-layout.mjs";

describe("mobile control geometry", () => {
  const viewport = { width: 320, height: 568 };
  const control = (name, x, y, width = 48, height = 48) => ({ name, box: { x, y, width, height } });
  it("accepts separated usable controls and fractional browser pixel rounding", () => {
    expect(
      mobileControlIssues(viewport, [
        control("first", 10, 10, 43.995, 44),
        control("second", 70, 10),
      ]),
    ).toEqual([]);
  });
  it("rejects missing and non-finite rectangles", () => {
    expect(
      mobileControlIssues(viewport, [{ name: "missing", box: null }, control("invalid", NaN, 10)]),
    ).toEqual(["missing:missing", "invalid:missing"]);
  });
  it("rejects genuinely undersized controls", () => {
    expect(mobileControlIssues(viewport, [control("small", 10, 10, 32, 40)])).toContain(
      "small:small",
    );
  });
  it("rejects controls clipped by any viewport edge", () => {
    for (const item of [
      control("left", -5, 10),
      control("right", 300, 10),
      control("top", 10, -5),
      control("bottom", 10, 550),
    ]) {
      expect(mobileControlIssues(viewport, [item])).toContain(`${item.name}:outside`);
    }
  });
  it("reports intersecting touch areas once, not adjacent controls", () => {
    expect(
      mobileControlIssues(viewport, [control("first", 10, 10), control("second", 40, 10)]),
    ).toEqual(["first:second:overlap"]);
    expect(
      mobileControlIssues(viewport, [control("first", 10, 10), control("second", 58, 10)]),
    ).toEqual([]);
  });
});
