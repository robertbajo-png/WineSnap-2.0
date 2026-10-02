import { describe, expect, it } from "vitest";
import {
  askErrorKey,
  createConversationTitle,
  sanitizeAskContext,
  validateAskMessage,
} from "./askWineSnap";

describe("Ask WineSnap contracts", () => {
  it("maps HTTP failures to localized keys without exposing server errors", () => {
    expect(askErrorKey({ context: new Response(null, { status: 429 }) })).toBe(
      "ask.error.rateLimit",
    );
    expect(askErrorKey({ context: { status: 401 } })).toBe("ask.error.auth");
    expect(askErrorKey({ context: { status: 403 } })).toBe("ask.error.auth");
    expect(askErrorKey({ context: { status: 402 } })).toBe("ask.error.unavailable");
    expect(askErrorKey(new Error("internal provider details"))).toBe("ask.error.generic");
    expect(askErrorKey(null)).toBe("ask.error.generic");
  });
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
