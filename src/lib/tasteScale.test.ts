import { describe, expect, it } from "vitest";
import { structureScore, validateTaste } from "./labelValidation";
import { computeDrinkingWindow } from "./drinkingWindow";
describe("taste and drinking estimates", () => {
  it.each([null, undefined, "", true, Infinity, -1, 11, 2.5])(
    "rejects unsupported structure score %s without guessing a scale",
    (value) => {
      expect(structureScore(value)).toBeNull();
    },
  );
  it.each([0, 5, 10])("uses the same integer 0-10 scale end-to-end: %s", (value) => {
    expect(validateTaste({ body: value, acidity: value })).toMatchObject({
      body: value,
      acidity: value,
    });
  });
  it("does not treat unknown types as red or sweet aged wines as automatically past peak", () => {
    expect(computeDrinkingWindow(2017, "dessert", 2026)?.status).toBe("great-now");
    expect(computeDrinkingWindow(2017, "fortified", 2026)?.status).toBe("great-now");
    expect(computeDrinkingWindow(2017, null, 2026)).toBeNull();
    expect(computeDrinkingWindow(2027, "red", 2026)).toBeNull();
  });
});
