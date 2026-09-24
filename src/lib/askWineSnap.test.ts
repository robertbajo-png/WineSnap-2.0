import { describe, expect, it } from "vitest";
import { createConversationTitle, sanitizeAskContext, validateAskMessage } from "./askWineSnap";

describe("Ask WineSnap contracts", () => {
  it("keeps only supported, bounded screen context", () => {
    expect(
      sanitizeAskContext({
        source: "wine",
        route: `/wine/${"x".repeat(300)}`,
        wineId: "9c871a9c-5162-4778-9212-5422c3690089",
      }),
    ).toEqual({
      source: "wine",
      route: `/wine/${"x".repeat(300)}`.slice(0, 160),
      wineId: "9c871a9c-5162-4778-9212-5422c3690089",
    });
  });

  it("drops invalid identifiers and routes", () => {
    expect(
      sanitizeAskContext({ source: "other" as "ask", route: "https://example.com", wineId: "1" }),
    ).toEqual({
      source: "ask",
      route: "/ask",
    });
  });

  it("validates user messages and creates compact titles", () => {
    expect(validateAskMessage("  Which wine works with salmon? ")).toEqual({
      valid: true,
      value: "Which wine works with salmon?",
    });
    expect(validateAskMessage("   ")).toEqual({ valid: false, error: "empty" });
    expect(validateAskMessage("x".repeat(2001))).toEqual({ valid: false, error: "too_long" });
    const title = createConversationTitle(`A ${"long ".repeat(20)}question`);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(/\.\.\.$/);
  });
});
