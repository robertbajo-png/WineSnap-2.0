import { describe, expect, it } from "vitest";
import {
  chefRequestSchema,
  completionContent,
  deriveFoodMemory,
  emptyChefContext,
  extractionSchema,
  memoryEntrySchema,
  needsSafetyResponse,
  providerMemory,
  recipeDraft,
  conflictingIngredients,
  type FoodSignal,
} from "./domain";

const owner = "00000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-10-24T12:00:00Z");
function signal(patch: Partial<FoodSignal> = {}): FoodSignal {
  return {
    id: crypto.randomUUID(),
    user_id: owner,
    source_kind: "feedback",
    source_key: crypto.randomUUID(),
    source_feedback_id: crypto.randomUUID(),
    attribute: "ingredient",
    value: "tomat",
    direction: 1,
    source_excerpt: "Jag gillar tomat",
    source_title: "Soppa",
    confidence: 0.6,
    status: "confirmed",
    revision: 1,
    created_at: new Date(now).toISOString(),
    ...patch,
  };
}
describe("evidence-backed Food Memory", () => {
  it("does not turn pending, foreign or clinical data into memory", () => {
    expect(
      deriveFoodMemory(
        [
          signal({ status: "pending" }),
          signal({ user_id: crypto.randomUUID() }),
          signal({ value: "allergi" }),
        ],
        owner,
        now,
      ),
    ).toEqual([]);
  });
  it("marks one inference as weak and two supporting sources as more credible", () => {
    expect(deriveFoodMemory([signal()], owner, now)[0].confidence).toBeLessThan(0.35);
    expect(deriveFoodMemory([signal(), signal()], owner, now)[0].confidence).toBeGreaterThan(0.35);
  });
  it("reduces conflicting and aging evidence", () => {
    expect(deriveFoodMemory([signal(), signal({ direction: -1 })], owner, now)[0].confidence).toBe(
      0,
    );
    expect(
      deriveFoodMemory([signal({ created_at: "2024-10-24T12:00:00Z" })], owner, now)[0].confidence,
    ).toBeLessThan(0.02);
  });
  it("deduplicates sources and normalizes groups", () => {
    const a = signal({ source_key: "same" });
    const preferences = deriveFoodMemory(
      [a, signal({ source_key: "same", value: " TOMAT " })],
      owner,
      now,
    );
    expect(preferences).toHaveLength(1);
    expect(preferences[0].evidenceCount).toBe(1);
  });
  it("lets the latest explicit correction override stronger inference", () => {
    const prefs = deriveFoodMemory(
      [signal(), signal(), signal({ direction: -1, source_kind: "correction", confidence: 1 })],
      owner,
      now,
    );
    expect(prefs[0]).toMatchObject({ direction: -1, confidence: 1, explicit: true });
  });
  it("never passes sources or user IDs into provider memory", () => {
    const data = providerMemory([signal({ source_kind: "statement", confidence: 1 })], owner);
    expect(data).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(owner);
    expect(data[0]).not.toHaveProperty("sources");
  });
  it.each(["allergi mot nötter", "diabetes", "celiaki", "pregnant", "insulin"])(
    "rejects sensitive memory %s",
    (value) =>
      expect(
        memoryEntrySchema.safeParse({ attribute: "ingredient", value, direction: -1 }).success,
      ).toBe(false),
  );
  it.each([
    "Är rå kyckling säkert att äta?",
    "What internal temperature?",
    "Jag är gravid",
    "Mögel på maten",
  ])("intercepts safety questions: %s", (value) => expect(needsSafetyResponse(value)).toBe(true));
  it("accepts ordinary culinary statements and no clinical attribute", () => {
    expect(
      memoryEntrySchema.parse({ attribute: "ingredient", value: "  VITA   BÖNOR  ", direction: 1 })
        .value,
    ).toBe("vita bönor");
    expect(
      memoryEntrySchema.safeParse({ attribute: "medical", value: "x", direction: 1 }).success,
    ).toBe(false);
  });
});
describe("strict Chef contracts", () => {
  it("requires synchronized, scoped context and no invented tools", () => {
    const input = {
      action: "chat",
      message: "Hjälp mig",
      conversationId: crypto.randomUUID(),
      conversationRevision: 0,
      requestId: crypto.randomUUID(),
      context: emptyChefContext,
    };
    expect(chefRequestSchema.safeParse(input).success).toBe(true);
    expect(chefRequestSchema.safeParse({ ...input, tool: "save_recipe" }).success).toBe(false);
    expect(
      chefRequestSchema.safeParse({
        ...input,
        context: { ...emptyChefContext, sessionId: crypto.randomUUID() },
      }).success,
    ).toBe(false);
  });
  it("rejects refusal, truncation, no content and multiple candidates", () => {
    for (const value of [
      { choices: [{ finish_reason: "length", message: { content: "half" } }] },
      { choices: [{ finish_reason: "stop", message: { content: "no", refusal: "denied" } }] },
      { choices: [] },
      { choices: [{ finish_reason: "stop", message: { content: "" } }] },
    ])
      expect(() => completionContent(value)).toThrow();
  });
  it("assigns server-generated IDs and provenance, never accepts model IDs", () => {
    const generated = {
      title: "Soppa",
      description: "Tomatsoppa",
      servings: 2,
      totalMinutes: 20,
      ingredients: [{ name: "Tomat", amount: 400, unit: "g" }],
      steps: [{ title: "Koka", text: "Koka upp soppan.", timerSeconds: 600 }],
    };
    const draft = recipeDraft(generated, "gemini-test", () => crypto.randomUUID());
    expect(draft.sourceNote).toContain("AI-förslag");
    expect(draft.image).toBe("none");
    expect(draft.ingredients[0].id).toMatch(/-/);
    expect(conflictingIngredients(draft, ["tomato"])).toEqual(["tomato"]);
    expect(conflictingIngredients(draft, ["lök"])).toEqual([]);
    expect(() =>
      recipeDraft({ ...generated, recipeId: owner }, "test", crypto.randomUUID),
    ).toThrow();
    expect(() =>
      recipeDraft(
        { ...generated, ingredients: [{ name: "X", amount: -1, unit: "handful" }] },
        "test",
        crypto.randomUUID,
      ),
    ).toThrow();
  });
  it("requires quoted, bounded extraction without health fields", () => {
    expect(
      extractionSchema.safeParse({
        candidates: [
          { attribute: "ingredient", value: "tomat", direction: 1, quote: "Jag gillar tomat" },
        ],
      }).success,
    ).toBe(true);
    expect(
      extractionSchema.safeParse({
        candidates: [{ attribute: "ingredient", value: "tomat", direction: 1 }],
      }).success,
    ).toBe(false);
    expect(
      extractionSchema.safeParse({
        candidates: Array(11).fill({
          attribute: "ingredient",
          value: "tomat",
          direction: 1,
          quote: "x",
        }),
      }).success,
    ).toBe(false);
  });
});
