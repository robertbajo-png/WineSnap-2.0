import { z } from "zod";

export const journalConsentVersion = 1;
export const journalDays = 90;
export const journalLimit = 600;
export const readingMethods = ["blood", "breath", "urine"] as const;
export const urineCategories = ["negative", "trace", "small", "moderate", "large"] as const;
export const urineScale = "ketostix-acetoacetate";
export const uuid = z.uuid();
const feature = z.enum(["goal", "readings"]);
const decimal = z.string().regex(/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,3})?$/);
const instant = z.iso.datetime({ offset: true, precision: 0 }).refine((value) => {
  return !value.endsWith("-00:00") && Number.isFinite(Date.parse(value));
});

export const mealGoal = z.strictObject({
  period: z.enum(["meal", "day"]),
  grams: decimal.refine((grams) => Number(grams) > 0 && Number(grams) < 10000),
});

export const reading = z.discriminatedUnion("method", [
  z.strictObject({
    method: z.literal("blood"),
    unit: z.literal("mmol/L"),
    value: decimal,
    at: instant,
  }),
  z.strictObject({
    method: z.literal("breath"),
    unit: z.literal("ppm"),
    value: decimal,
    at: instant,
  }),
  z.strictObject({
    method: z.literal("urine"),
    unit: z.literal("category"),
    scale: z.literal(urineScale),
    value: z.enum(urineCategories),
    at: instant,
  }),
]);

export function readingInWindow(value: Reading, now = Date.now()) {
  const at = Date.parse(value.at);
  return at <= now && at > now - journalDays * 86_400_000;
}

const revision = { revision: uuid };
export const journalCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("read") }),
  z.strictObject({
    action: z.literal("enable"),
    feature,
    ...revision,
    notice: z.literal(journalConsentVersion),
  }),
  z.strictObject({ action: z.literal("disable"), feature, ...revision }),
  z.strictObject({ action: z.literal("setGoal"), ...revision, goal: mealGoal }),
  z.strictObject({ action: z.literal("deleteGoal"), ...revision }),
  z.strictObject({ action: z.literal("addReading"), ...revision, reading }),
  z.strictObject({
    action: z.literal("editReading"),
    ...revision,
    reading,
    id: uuid,
    entryRevision: uuid,
  }),
  z.strictObject({
    action: z.literal("deleteReading"),
    ...revision,
    id: uuid,
    entryRevision: uuid,
  }),
]);

const choice = z.strictObject({ enabled: z.boolean(), revision: uuid });
const storedReading = z.strictObject({ id: uuid, revision: uuid, reading });
export const journalState = z.strictObject({
  goalChoice: choice,
  readingsChoice: choice,
  goal: mealGoal.nullable(),
  readings: z.array(storedReading).max(journalLimit),
});
export const journalReply = z.strictObject({
  state: journalState,
  validUntil: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)))
    .nullable(),
});

export const journalSnapshot = z.strictObject({
  version: z.literal(1),
  goal: mealGoal.nullable(),
  readings: z.array(z.strictObject({ id: uuid, reading })).max(journalLimit),
});

export type JournalCommand = z.infer<typeof journalCommand>;
export type JournalState = z.infer<typeof journalState>;
export type StoredReading = z.infer<typeof storedReading>;
export type Reading = z.infer<typeof reading>;
export type MealGoal = z.infer<typeof mealGoal>;

export function compareMealGoal(
  goal: MealGoal,
  estimate: { carbsPerServing: number | null; allAmountsKnown: boolean } | null,
) {
  if (goal.period === "day") return "daily-unverified";
  if (
    !estimate?.allAmountsKnown ||
    estimate.carbsPerServing === null ||
    !Number.isFinite(estimate.carbsPerServing) ||
    estimate.carbsPerServing < 0
  )
    return "incomplete";
  return estimate.carbsPerServing <= Number(goal.grams) ? "within" : "above";
}
