import { describe, expect, it } from "vitest";
import { tasteContext } from "../../supabase/functions/ask-winesnap/handler";

describe("sommelier computed context minimization", () => {
  it("retains taste evidence but not account IDs, timestamps or future metadata", () => {
    expect(
      tasteContext({
        user_id: "private-account-id",
        id: "private-row-id",
        updated_at: "private-date",
        last_signal_at: "private-date",
        future_private_field: "private",
        avg_body: 4,
        avg_acidity: null,
        favorite_grapes: { Chardonnay: 3 },
        memory_confidence: 0.5,
        signal_count: 4,
      }),
    ).toEqual({
      avg_body: 4,
      avg_acidity: null,
      favorite_grapes: { Chardonnay: 3 },
      memory_confidence: 0.5,
      signal_count: 4,
    });
  });
  it.each([null, undefined, [], "private", 1])("does not invent a profile for %j", (value) => {
    expect(tasteContext(value)).toBe(null);
  });
});
