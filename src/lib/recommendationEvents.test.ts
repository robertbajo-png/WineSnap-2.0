import { describe, expect, it } from "vitest";
import { recommendationKey } from "./recommendationEvents";

describe("recommendation events", () => {
  it("creates a stable candidate key", () => {
    expect(
      recommendationKey({
        producer: "  Schloss Johannisberg ",
        wine_name: "Gelblack",
        vintage: 2022,
      }),
    ).toBe("schloss johannisberg|gelblack|2022");
  });

  it("rejects empty candidates", () => {
    expect(recommendationKey({})).toBe("");
  });
});
