import { z } from "zod";
import { convertAmount, scaledAmount, units, versionSchema } from "../kitchen/domain";
import {
  ingredientBaseUnits,
  ingredientIdentity,
  normalizeIngredientName,
} from "../kitchen/ingredientIdentity";

export const mealSlots = ["breakfast", "lunch", "dinner", "snack"] as const;
const id = z.uuid().transform((value) => value.toLowerCase());
// Bound the calendar at whole weeks so all seven days have four-digit years.
const day = z.iso.date().refine((value) => value >= "1900-01-01" && value <= "9999-12-26");
const utcDay = (date: string) => new Date(date + "T00:00:00.000Z");
export const weekStartSchema = day.refine(
  (date) => utcDay(date).getUTCDay() === 1,
  "Week must start on Monday",
);
const slot = z.enum(mealSlots);
const name = z.string().trim().min(1).max(120);
const plannedIngredientLimit = 7 * mealSlots.length * 80;
const largestScaledTotal = plannedIngredientLimit * 100_000 * 24 * 1000;

function dateOffset(date: string, days: number) {
  const value = utcDay(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekForDate(value: string) {
  const date = day.parse(value);
  return weekStartSchema.parse(dateOffset(date, -((utcDay(date).getUTCDay() + 6) % 7)));
}

export function weekDates(weekStart: string) {
  const start = weekStartSchema.parse(weekStart);
  return Array.from({ length: 7 }, (_, index) => dateOffset(start, index));
}

export function neighboringWeek(weekStart: string, direction: -1 | 1) {
  const result = weekStartSchema.safeParse(
    dateOffset(weekStartSchema.parse(weekStart), direction * 7),
  );
  return result.success ? result.data : null;
}

const ingredientSource = z
  .object({
    date: day,
    meal: slot,
    recipeVersionId: id,
    servings: z.number().int().min(1).max(24),
  })
  .strict();
export const maxPlanDiners = 24;
const plannedMeal = ingredientSource.extend({
  dinerIds: z
    .array(id)
    .min(1)
    .max(maxPlanDiners)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
});
export type PlannedMeal = z.infer<typeof plannedMeal>;
const mealKey = (meal: Pick<PlannedMeal, "date" | "meal">) =>
  meal.date + ":" + mealSlots.indexOf(meal.meal);

export const purchaseSchema = z
  .object({
    name,
    amount: z.number().positive().max(largestScaledTotal).nullable(),
    unit: z.enum(units).nullable(),
  })
  .strict()
  .refine(({ amount, unit }) => amount === null || unit !== null, "Amount requires a unit");
export type Purchase = z.infer<typeof purchaseSchema>;
const manualItem = z.object({ id, item: purchaseSchema, checked: z.boolean() }).strict();
const basis = z
  .object({
    knownAmount: z.number().positive().max(largestScaledTotal).nullable(),
    unknownAmounts: z.number().int().min(0).max(plannedIngredientLimit),
    sources: z
      .array(ingredientSource)
      .min(1)
      .max(7 * mealSlots.length),
  })
  .strict();
const shoppingEdit = z
  .object({
    key: z.string().min(1).max(400),
    basis,
    checked: z.boolean(),
    excluded: z.boolean(),
    adjustment: purchaseSchema.nullable(),
  })
  .strict();

export const weekPlanSchema = z
  .object({
    weekStart: weekStartSchema,
    meals: z.array(plannedMeal).max(7 * mealSlots.length),
    manualItems: z.array(manualItem).max(100),
    shoppingEdits: z.array(shoppingEdit).max(plannedIngredientLimit),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const unique = (values: string[], field: string) => {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", path: [field], message: "Duplicate entries" });
    };
    unique(plan.meals.map(mealKey), "meals");
    unique(
      plan.manualItems.map((item) => item.id),
      "manualItems",
    );
    unique(
      plan.shoppingEdits.map((edit) => edit.key),
      "shoppingEdits",
    );
    const end = dateOffset(plan.weekStart, 6);
    if (plan.meals.some((meal) => meal.date < plan.weekStart || meal.date > end))
      ctx.addIssue({ code: "custom", path: ["meals"], message: "Meal is outside this week" });
    if (new TextEncoder().encode(JSON.stringify(plan)).length > 384 * 1024)
      ctx.addIssue({ code: "custom", message: "Week plan is too large" });
  });
export type WeekPlan = z.infer<typeof weekPlanSchema>;

const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
type Basis = z.infer<typeof basis>;
type RecipeLine = {
  key: string;
  name: string;
  unit: (typeof ingredientBaseUnits)[keyof typeof ingredientBaseUnits];
  basis: Basis;
};

function sameBasis(left: Basis, right: Basis) {
  return (
    left.knownAmount === right.knownAmount &&
    left.unknownAmounts === right.unknownAmounts &&
    left.sources.length === right.sources.length &&
    left.sources.every((source, index) => {
      const other = right.sources[index];
      return (
        mealKey(source) === mealKey(other) &&
        source.recipeVersionId === other.recipeVersionId &&
        source.servings === other.servings
      );
    })
  );
}

// Do not substitute the current version or expose any part of a foreign recipe.
export function buildShoppingList(
  ownerId: string,
  input: WeekPlan,
  candidateVersions: readonly unknown[],
) {
  const owner = id.parse(ownerId);
  const plan = weekPlanSchema.parse(input);
  const meals = plan.meals.slice().sort((a, b) => compare(mealKey(a), mealKey(b)));
  const expected = new Set(meals.map((meal) => meal.recipeVersionId));
  const versions = new Map<string, ReturnType<typeof versionSchema.parse> | null>();
  for (const value of candidateVersions) {
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string")
      continue;
    const versionId = value.id.toLowerCase();
    if (!expected.has(versionId)) continue;
    const parsed = versionSchema.safeParse(value);
    versions.set(
      versionId,
      !versions.has(versionId) && parsed.success && parsed.data.user_id.toLowerCase() === owner
        ? parsed.data
        : null,
    );
  }
  const resolved = meals.map((meal) => ({ meal, version: versions.get(meal.recipeVersionId) }));
  const missingMeals = resolved
    .filter(({ version }) => !version)
    .map(({ meal }) => ({ date: meal.date, meal: meal.meal }));
  if (missingMeals.length) return { status: "missing_recipes" as const, missingMeals };

  const groups = new Map<string, RecipeLine>();
  for (const { meal, version } of resolved) {
    if (!version) throw new Error("Planned recipe not available");
    const source = {
      date: meal.date,
      meal: meal.meal,
      recipeVersionId: meal.recipeVersionId,
      servings: meal.servings,
    };
    for (const ingredient of version.document.ingredients) {
      const unit = ingredientBaseUnits[ingredient.unit];
      const key = ingredientIdentity(ingredient.name, ingredient.unit);
      let line = groups.get(key);
      if (!line) {
        line = {
          key,
          name: ingredient.name,
          unit,
          basis: { knownAmount: null, unknownAmounts: 0, sources: [] },
        };
        groups.set(key, line);
      }
      if (line.basis.sources.at(-1) !== source) line.basis.sources.push(source);
      // Existing recipes use zero to mean an unspecified quantity.
      if (ingredient.amount === 0) line.basis.unknownAmounts++;
      else {
        const amount = convertAmount(
          scaledAmount(ingredient.amount, version.document.servings, meal.servings),
          ingredient.unit,
          unit,
        );
        line.basis.knownAmount = (line.basis.knownAmount ?? 0) + amount;
      }
    }
  }

  const edits = new Map(plan.shoppingEdits.map((edit) => [edit.key, edit]));
  const recipeItems = Array.from(groups.values())
    .sort(
      (a, b) =>
        compare(normalizeIngredientName(a.name), normalizeIngredientName(b.name)) ||
        compare(a.unit, b.unit),
    )
    .map((line) => {
      if (line.basis.knownAmount !== null)
        line.basis.knownAmount = Number(line.basis.knownAmount.toPrecision(15));
      const edit = edits.get(line.key);
      const active = edit && sameBasis(edit.basis, line.basis) ? edit : undefined;
      return {
        ...line,
        checked: active?.checked ?? false,
        excluded: active?.excluded ?? false,
        adjustment: active?.adjustment ?? null,
      };
    });
  return { status: "ready" as const, recipeItems, manualItems: plan.manualItems };
}
