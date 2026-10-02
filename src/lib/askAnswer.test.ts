import { describe, expect, it } from "vitest";
import { completedAskAnswer } from "../../supabase/functions/_shared/askAnswer";

describe("completed sommelier answers", () => {
  it("accepts complete nonempty text", () => {
    expect(
      completedAskAnswer({
        choices: [{ finish_reason: "stop", message: { content: " Answer. " } }],
      }),
    ).toBe("Answer.");
  });
  it("rejects token-limited partial answers before persistence", () => {
    expect(() =>
      completedAskAnswer({
        choices: [{ finish_reason: "length", message: { content: "A wine that" } }],
      }),
    ).toThrow("output budget");
  });
  it.each([null, {}, { choices: [] }, { choices: [{ message: { content: " " } }] }])(
    "rejects empty or invalid responses",
    (payload) => {
      expect(() => completedAskAnswer(payload)).toThrow();
    },
  );
});
