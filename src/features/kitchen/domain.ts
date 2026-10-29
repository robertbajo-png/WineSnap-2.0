import { z } from "zod";

export const units = ["g", "kg", "ml", "dl", "l", "tsp", "tbsp", "pcs", "pinch"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().uuid();
export const recipeSchema = z
  .object({
    title: text(140),
    description: z.string().max(1200),
    servings: z.number().int().min(1).max(24),
    totalMinutes: z.number().int().min(1).max(1440),
    image: z.enum(["cauliflower", "pasta", "salad", "none"]),
    sourceNote: z.string().max(400),
    notes: z.string().max(2000),
    ingredients: z
      .array(
        z
          .object({
            id,
            name: text(120),
            amount: z.number().finite().min(0).max(100000),
            unit: z.enum(units),
          })
          .strict(),
      )
      .min(1)
      .max(80),
    steps: z
      .array(
        z
          .object({
            id,
            title: text(140),
            text: text(2000),
            timerSeconds: z.number().int().min(1).max(21600).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 60 * 1024)
      ctx.addIssue({ code: "custom", message: "Recipe is too large" });
    for (const list of [value.ingredients, value.steps])
      if (new Set(list.map((item) => item.id)).size !== list.length)
        ctx.addIssue({ code: "custom", message: "Duplicate identifiers" });
  });
export type RecipeDocument = z.infer<typeof recipeSchema>;
export const timerSchema = z
  .object({
    id,
    name: text(60),
    durationMs: z.number().int().min(1000).max(21600000),
    deadlineMs: z.number().int().min(0).max(4102444800000).nullable(),
    pausedMs: z.number().int().min(0).max(21600000),
    resumeOnSession: z.boolean(),
  })
  .strict()
  .refine((timer) => timer.pausedMs <= timer.durationMs, "Invalid remaining time");
export type CookingTimer = z.infer<typeof timerSchema>;
export const sessionSchema = z
  .object({
    status: z.enum(["running", "paused", "completed", "abandoned"]),
    activeStep: z.number().int().min(0).max(39),
    servings: z.number().int().min(1).max(24),
    checkedIngredientIds: z.array(id).max(80),
    timers: z.array(timerSchema).max(8),
  })
  .strict();
export type CookingState = z.infer<typeof sessionSchema>;
export const feedbackSchema = z
  .object({ rating: z.number().int().min(1).max(5).nullable(), note: z.string().trim().max(1000) })
  .strict();
export type CookingFeedback = z.infer<typeof feedbackSchema>;
export const versionSchema = z.object({
  id,
  recipe_id: id,
  user_id: id,
  revision: z.number().int().positive(),
  document: recipeSchema,
  created_at: z.string().datetime({ offset: true }),
});
export type RecipeVersion = z.infer<typeof versionSchema>;
export const savedSessionSchema = z.object({
  id,
  user_id: id,
  recipe_version_id: id,
  revision: z.number().int().positive(),
  state: sessionSchema,
  last_request_id: id,
  updated_at: z.string().datetime({ offset: true }),
});
export type SavedSession = z.infer<typeof savedSessionSchema>;
export type LocalSession = {
  id: string;
  version: RecipeVersion;
  state: CookingState;
  feedback: CookingFeedback | null;
  baseRevision: number;
  requestId: string;
  dirty: boolean;
};
export function validState(input: unknown, recipe: RecipeDocument): CookingState {
  const state = sessionSchema.parse(input);
  const ingredients = new Set(recipe.ingredients.map((item) => item.id));
  if (
    state.activeStep >= recipe.steps.length ||
    state.checkedIngredientIds.some((item) => !ingredients.has(item)) ||
    new Set(state.checkedIngredientIds).size !== state.checkedIngredientIds.length ||
    new Set(state.timers.map((timer) => timer.id)).size !== state.timers.length ||
    (state.status !== "running" && state.timers.some((timer) => timer.deadlineMs !== null))
  )
    throw new Error("Invalid cooking state");
  return state;
}
export function scaledAmount(amount: number, sourceServings: number, servings: number) {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 100000 ||
    !Number.isInteger(sourceServings) ||
    sourceServings < 1 ||
    sourceServings > 24 ||
    !Number.isInteger(servings) ||
    servings < 1 ||
    servings > 24
  )
    throw new Error("Invalid quantity");
  return (amount * servings) / sourceServings;
}
export function convertAmount(
  amount: number,
  from: (typeof units)[number],
  to: (typeof units)[number],
) {
  const groups = {
    g: ["mass", 1],
    kg: ["mass", 1000],
    ml: ["volume", 1],
    dl: ["volume", 100],
    l: ["volume", 1000],
    tsp: ["volume", 5],
    tbsp: ["volume", 15],
    pcs: ["count", 1],
    pinch: ["pinch", 1],
  } as const;
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !groups[from] ||
    !groups[to] ||
    groups[from][0] !== groups[to][0]
  )
    throw new Error("Incompatible units");
  return (amount * groups[from][1]) / groups[to][1];
}
export function timerRemaining(timer: CookingTimer, now = Date.now()) {
  return Math.max(
    0,
    Math.min(timer.durationMs, timer.deadlineMs === null ? timer.pausedMs : timer.deadlineMs - now),
  );
}
export function formatTimer(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function newTimer(
  name: string,
  seconds: number,
  now = Date.now(),
  timerId = crypto.randomUUID(),
): CookingTimer {
  return timerSchema.parse({
    id: timerId,
    name: name.trim(),
    durationMs: seconds * 1000,
    deadlineMs: now + seconds * 1000,
    pausedMs: seconds * 1000,
    resumeOnSession: false,
  });
}
export function toggleCookingTimer(timer: CookingTimer, now = Date.now()): CookingTimer {
  return timer.deadlineMs === null
    ? { ...timer, deadlineMs: now + timer.pausedMs, resumeOnSession: false }
    : { ...timer, pausedMs: timerRemaining(timer, now), deadlineMs: null, resumeOnSession: false };
}
export function changeSessionStatus(
  state: CookingState,
  status: CookingState["status"],
  now = Date.now(),
): CookingState {
  if (["completed", "abandoned"].includes(state.status)) throw new Error("Session is finished");
  return {
    ...state,
    status,
    timers: state.timers.map((timer) => {
      if (status === "completed" || status === "abandoned")
        return { ...timer, deadlineMs: null, pausedMs: 0, resumeOnSession: false };
      if (status === "paused")
        return {
          ...timer,
          pausedMs: timerRemaining(timer, now),
          deadlineMs: null,
          resumeOnSession: timer.deadlineMs !== null,
        };
      return timer.resumeOnSession
        ? { ...timer, deadlineMs: now + timer.pausedMs, resumeOnSession: false }
        : timer;
    }),
  };
}
export function initialCookingState(
  recipe: RecipeDocument,
  servings = recipe.servings,
): CookingState {
  return validState(
    { status: "running", activeStep: 0, servings, checkedIngredientIds: [], timers: [] },
    recipe,
  );
}
