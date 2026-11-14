import { z } from "zod";
import { recipeSchema, type RecipeDocument } from "../kitchen/domain";

export const forms = ["raw", "cooked", "dry", "as_sold"] as const;
export type FoodForm = (typeof forms)[number];
export const formLabels: Record<FoodForm, string> = {
  raw: "Rå, ätlig del",
  cooked: "Tillagad, ätlig del",
  dry: "Torr/okokt",
  as_sold: "Som såld, ätlig del",
};
const nutrient = z.number().finite().min(0).max(100).nullable();
export const referenceSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(180),
    form: z.enum(forms),
    convention: z.enum(["EU", "US"]),
    carbs: nutrient,
    fiber: nutrient,
    protein: nutrient,
    fat: nutrient,
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("slv"),
          recordId: z.number().int().positive(),
          recordVersion: z.string().min(1),
          datasetVersion: z.string().min(1),
          retrievedAt: z.string().datetime(),
          url: z
            .string()
            .startsWith("https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/"),
        })
        .strict(),
      z.object({ kind: z.literal("label"), label: z.string().trim().min(1).max(120) }).strict(),
    ]),
  })
  .strict()
  .refine(
    (r) => r.convention !== "US" || r.carbs === null || r.fiber === null || r.fiber <= r.carbs,
    "Fiber cannot exceed US total carbohydrate",
  );
export type FoodReference = z.infer<typeof referenceSchema>;
export type Binding = {
  reference: FoodReference | null;
  grams: number | null;
  weighedForm: FoodForm | "unknown";
  confirmed: boolean;
};
export type Bindings = Record<string, Binding>;
export function emptyBinding(ingredient: RecipeDocument["ingredients"][number]): Binding {
  const grams =
    ingredient.unit === "g"
      ? ingredient.amount
      : ingredient.unit === "kg"
        ? ingredient.amount * 1000
        : null;
  return {
    reference: null,
    grams: grams !== null && grams <= 100000 ? grams : null,
    weighedForm: "unknown",
    confirmed: false,
  };
}
export function availableCarbs(reference: FoodReference): number | null {
  const r = referenceSchema.parse(reference);
  if (r.carbs === null || (r.convention === "US" && r.fiber === null)) return null;
  return r.carbs - (r.convention === "US" ? r.fiber! : 0);
}
type Macros = {
  carbs: number | null;
  fiber: number | null;
  protein: number | null;
  fat: number | null;
};
export function resolveBinding(binding: Binding | undefined): {
  macros: Macros | null;
  reason: string | null;
} {
  if (!binding?.reference)
    return { macros: null, reason: "Välj en referens eller ange en etikett." };
  const parsed = referenceSchema.safeParse(binding.reference);
  if (!parsed.success)
    return { macros: null, reason: "Referensens värden eller källa behöver kontrolleras." };
  if (
    binding.grams === null ||
    !Number.isFinite(binding.grams) ||
    binding.grams <= 0 ||
    binding.grams > 100000
  )
    return { macros: null, reason: "Ange en vägd mängd i gram för hela grundreceptet." };
  if (binding.weighedForm !== parsed.data.form)
    return {
      macros: null,
      reason: "Referensen och gramvikten måste avse samma råa, torra eller tillagade form.",
    };
  if (!binding.confirmed) return { macros: null, reason: "Bekräfta referens och ätlig gramvikt." };
  const r = parsed.data,
    scale = binding.grams / 100;
  const carbs = availableCarbs(r);
  return {
    macros: {
      carbs: carbs === null ? null : carbs * scale,
      fiber: r.fiber === null ? null : r.fiber * scale,
      protein: r.protein === null ? null : r.protein * scale,
      fat: r.fat === null ? null : r.fat * scale,
    },
    reason:
      carbs === null ? "Kolhydratunderlaget är ofullständigt; US total kräver även fiber." : null,
  };
}
// Aggregate at full precision; only the presentation layer rounds.
export function estimateRecipe(document: RecipeDocument, bindings: Bindings, servings: number) {
  const recipe = recipeSchema.parse(document);
  z.number().int().min(1).max(24).parse(servings);
  const rows = recipe.ingredients.map((ingredient) => ({
    ingredient,
    ...(ingredient.amount === 0
      ? { macros: { carbs: 0, fiber: 0, protein: 0, fat: 0 }, reason: null }
      : resolveBinding(bindings[ingredient.id])),
  }));
  const total: Macros = { carbs: 0, fiber: 0, protein: 0, fat: 0 },
    perServing: Macros = { carbs: 0, fiber: 0, protein: 0, fat: 0 };
  for (const key of ["carbs", "fiber", "protein", "fat"] as const) {
    if (rows.some((row) => row.macros?.[key] === null || row.macros?.[key] === undefined)) {
      total[key] = null;
      perServing[key] = null;
    } else {
      const base = rows.reduce((sum, row) => sum + row.macros![key]!, 0);
      total[key] = (base * servings) / recipe.servings;
      perServing[key] = base / recipe.servings;
    }
  }
  return {
    rows,
    total,
    perServing,
    known: rows.filter((r) => r.macros?.carbs !== null && r.macros?.carbs !== undefined).length,
    complete: perServing.carbs !== null,
  };
}
export function compareLimit(
  carbs: number | null,
  limit: number | null,
): "unknown" | "unset" | "within" | "above" {
  if (carbs === null || !Number.isFinite(carbs)) return "unknown";
  if (limit === null || !Number.isFinite(limit) || limit <= 0 || limit > 250) return "unset";
  return carbs <= limit ? "within" : "above";
}
export function substitutionPrompt(
  ingredient: string,
  replacement: string,
  grams: number,
  servings: number,
) {
  z.number().finite().positive().max(100000).parse(grams);
  z.number().int().min(1).max(24).parse(servings);
  return `Föreslå en receptvariant: byt ${ingredient.slice(0, 120)} mot ${replacement.slice(0, 180)}, ${grams} g för grundreceptets ${servings} portioner. Anpassa alla berörda mängder och tillagningssteg. Gör inga närings- eller säkerhetsgarantier.`;
}
