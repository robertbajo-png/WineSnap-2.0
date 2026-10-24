import { z } from "zod";
import { recipeSchema, units, type RecipeDocument } from "../kitchen/domain";

export const attributes = ["ingredient", "cuisine", "method", "texture", "equipment"] as const;
export const attributeLabels: Record<(typeof attributes)[number], string> = {
  ingredient: "Ingrediens",
  cuisine: "Kök",
  method: "Tillagning",
  texture: "Konsistens",
  equipment: "Utrustning",
};
export const normalizeMemory = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("sv-SE").replace(/\s+/g, " ");
export const sensitiveFood =
  /allerg|anafyl|anaphyl|diabet|gravid|pregnan|insulin|diagnos|medicin|medical|celiak|celiac|njursjuk|kidney disease/i;
const safetyQuestion =
  /rå kyckling|raw chicken|matförgift|food poison|mögel|mould|mold|säkert att äta|safe to eat|innertemperatur|internal temperature|hållbarhet|shelf life/i;
export const needsSafetyResponse = (text: string) =>
  sensitiveFood.test(text) || safetyQuestion.test(text);
export const safetyAnswer =
  "Jag kan hjälpa med smak och matlagning, men inte bedöma allergensäkerhet, medicinska kostbehov eller om mat är säker att äta. Använd inte en timer eller ett AI-svar som säkerhetskontroll. Följ aktuell vägledning om hygien, separation, tillagning och kylning från [FoodSafety.gov](https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety). Vid allergi behöver ingredienser och korskontaminering kontrolleras separat.";
export const memoryEntrySchema = z
  .object({
    attribute: z.enum(attributes),
    value: z
      .string()
      .min(1)
      .max(80)
      .transform(normalizeMemory)
      .refine((s) => s.length > 0 && !sensitiveFood.test(s)),
    direction: z.union([z.literal(1), z.literal(-1)]),
  })
  .strict();
export const signalSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  source_kind: z.enum(["statement", "correction", "feedback"]),
  source_key: z.string(),
  source_feedback_id: z.string().uuid().nullable(),
  attribute: z.enum(attributes),
  value: z.string(),
  direction: z.union([z.literal(1), z.literal(-1)]),
  source_excerpt: z.string(),
  source_title: z.string(),
  confidence: z.number().min(0).max(1),
  status: z.enum(["pending", "confirmed", "corrected"]),
  revision: z.number().int().positive(),
  created_at: z.string(),
});
export type FoodSignal = z.infer<typeof signalSchema>;
export function deriveFoodMemory(signals: FoodSignal[], owner: string, now = Date.now()) {
  const groups = new Map<string, FoodSignal[]>();
  for (const signal of signals) {
    if (
      signal.user_id !== owner ||
      signal.status !== "confirmed" ||
      sensitiveFood.test(signal.value)
    )
      continue;
    const key = `${signal.attribute}:${normalizeMemory(signal.value)}`;
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  }
  return [...groups.values()].map((sources) => {
    sources.sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id),
    );
    const explicit = sources.find((s) => s.source_kind !== "feedback");
    const unique = [...new Map(sources.map((s) => [s.source_key, s])).values()];
    let total = 0,
      score = 0;
    for (const source of unique) {
      const age = Math.max(0, now - Date.parse(source.created_at)) / 86400000;
      const weight = source.confidence * 2 ** (-age / 180);
      total += weight;
      score += weight * source.direction;
    }
    return {
      attribute: sources[0].attribute,
      value: normalizeMemory(sources[0].value),
      direction: explicit?.direction ?? (score >= 0 ? 1 : -1),
      confidence: explicit
        ? 1
        : Math.min(0.9, (1 - Math.exp(-total / 2)) * Math.abs(score / (total || 1))),
      evidenceCount: unique.length,
      explicit: !!explicit,
      sources,
    };
  });
}

export const chefContextSchema = z
  .object({
    recipeVersionId: z.string().uuid().nullable().default(null),
    sessionId: z.string().uuid().nullable().default(null),
    sessionRevision: z.number().int().positive().nullable().default(null),
  })
  .strict()
  .refine((c) => !!c.sessionId === !!c.sessionRevision);
export type ChefContext = z.infer<typeof chefContextSchema>;
export const emptyChefContext: ChefContext = {
  recipeVersionId: null,
  sessionId: null,
  sessionRevision: null,
};
const common = {
  requestId: z.string().uuid(),
  context: chefContextSchema.default(emptyChefContext),
};
export const chefRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("chat"),
      message: z.string().trim().min(1).max(2000),
      conversationId: z.string().uuid(),
      conversationRevision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("generate"),
      prompt: z.string().trim().min(1).max(2000),
      servings: z.number().int().min(1).max(24),
      maxMinutes: z.number().int().min(5).max(240),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("adapt"),
      prompt: z.string().trim().min(1).max(2000),
      servings: z.number().int().min(1).max(24),
      maxMinutes: z.number().int().min(5).max(240),
    })
    .strict(),
  z.object({ ...common, action: z.literal("extract"), feedbackId: z.string().uuid() }).strict(),
]);
export type ChefRequest = z.infer<typeof chefRequestSchema>;
export const generatedRecipeSchema = z
  .object({
    title: z.string().trim().min(1).max(140),
    description: z.string().max(1200),
    servings: z.number().int().min(1).max(24),
    totalMinutes: z.number().int().min(1).max(240),
    ingredients: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            amount: z.number().finite().min(0).max(100000),
            unit: z.enum(units),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    steps: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(140),
            text: z.string().trim().min(1).max(2000),
            timerSeconds: z.number().int().min(1).max(21600).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const extractionSchema = z
  .object({
    candidates: z
      .array(memoryEntrySchema.extend({ quote: z.string().min(1).max(400) }).strict())
      .max(10),
  })
  .strict();
export function recipeDraft(value: unknown, model: string, uuid: () => string): RecipeDocument {
  const document = generatedRecipeSchema.parse(value);
  return recipeSchema.parse({
    ...document,
    image: "none",
    notes: "",
    sourceNote: `AI-förslag (${model}). Granskat och sparat av dig.`,
    ingredients: document.ingredients.map((i) => ({ ...i, id: uuid() })),
    steps: document.steps.map((s) => ({ ...s, id: uuid() })),
  });
}
export function completionContent(value: unknown) {
  const envelope = z
    .object({
      choices: z
        .array(
          z.object({
            finish_reason: z.literal("stop"),
            message: z.object({
              content: z.string().min(1).max(60000),
              refusal: z.string().nullable().optional(),
            }),
          }),
        )
        .length(1),
      usage: z
        .object({
          prompt_tokens: z.number().int().nonnegative(),
          completion_tokens: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .parse(value);
  if (envelope.choices[0].message.refusal) throw new Error("chef_refusal");
  return { content: envelope.choices[0].message.content, usage: envelope.usage };
}
export function providerMemory(signals: FoodSignal[], owner: string) {
  return deriveFoodMemory(signals, owner)
    .filter((p) => p.confidence >= 0.35)
    .slice(0, 24)
    .map(({ attribute, value, direction, confidence, evidenceCount, explicit }) => ({
      attribute,
      value,
      direction,
      confidence: Math.round(confidence * 100) / 100,
      evidenceCount,
      explicit,
    }));
}

// Culinary dislikes only. This is not an allergen or cross-contamination check.
export function conflictingIngredients(document: RecipeDocument, dislikes: string[]) {
  const aliases: Record<string, string[]> = {
    lök: ["lök", "onion"],
    onion: ["lök", "onion"],
    tomat: ["tomat", "tomato"],
    tomato: ["tomat", "tomato"],
    svamp: ["svamp", "mushroom"],
    mushroom: ["svamp", "mushroom"],
  };
  return dislikes.filter((value) =>
    document.ingredients.some((ingredient) =>
      (aliases[value] ?? [value]).some((term) => normalizeMemory(ingredient.name).includes(term)),
    ),
  );
}
