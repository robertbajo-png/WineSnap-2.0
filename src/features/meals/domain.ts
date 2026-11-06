import { z } from "zod";
import type {
  RecommendationCandidate,
  RecommendationPreference,
  ExplicitTasteProfile,
} from "@/lib/recommendationEngine";
import { scorePersonalizedCandidate } from "@/lib/recommendationEngine";
import {
  conflictingIngredients,
  memoryEntrySchema,
  normalizeMemory,
  sensitiveFood,
} from "../chef/domain";
import type { RecipeDocument, RecipeVersion } from "../kitchen/domain";

export const dinerDocumentSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: z.enum(["adult", "child"]),
    preferences: z.array(memoryEntrySchema).max(20),
  })
  .strict()
  .refine(
    (d) =>
      new Set(d.preferences.map((p) => `${p.attribute}:${p.value}`)).size === d.preferences.length,
  );
export type DinerDocument = z.infer<typeof dinerDocumentSchema>;
export const dinerSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  household_id: z.string().uuid().nullable(),
  shared: z.boolean(),
  document: dinerDocumentSchema,
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Diner = z.infer<typeof dinerSchema>;
export const householdSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  revision: z.number().int().positive(),
});
export const memberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  household_id: z.string().uuid(),
  display_name: z.string(),
});
export const inviteSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  household_id: z.string().uuid(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  used_at: z.string().nullable(),
});
export type Household = z.infer<typeof householdSchema>;
export type Member = z.infer<typeof memberSchema>;
export const wineSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  wine_name: z.string().nullable(),
  vintage: z.number().nullable(),
  wine_type: z.string().nullable(),
  quantity: z.number(),
  consumed_at: z.string().nullable(),
  image_url: z.string().nullable(),
  body: z.number().min(0).max(10).nullable(),
  acidity: z.number().min(0).max(10).nullable(),
  tannin: z.number().min(0).max(10).nullable(),
  sweetness: z.number().min(0).max(10).nullable(),
  grape_varieties: z.array(z.string()).nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
});
export type PairingWine = z.infer<typeof wineSchema> & RecommendationCandidate;
export const traits = ["acidic", "rich", "hot", "sweet", "umami", "delicate"] as const;
export type DishTrait = (typeof traits)[number];
export const traitLabels: Record<DishTrait, string> = {
  acidic: "Syrlig",
  rich: "Fyllig",
  hot: "Het",
  sweet: "Söt",
  umami: "Umami",
  delicate: "Mild",
};
const words = (value: string) =>
  normalizeMemory(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export function inferDishTraits(recipe: RecipeDocument): DishTrait[] {
  const text = words(recipe.ingredients.map((i) => i.name).join(" "));
  const result: DishTrait[] = [];
  if (/tomat|citron|lemon|lime|vinager|vinegar/.test(text)) result.push("acidic");
  if (/\b(gradde|cream|smor|butter|ost|cheese|olja|oil|kokosmjolk)\b/.test(text))
    result.push("rich");
  if (/chili|chilli|sambal|jalapeno|sriracha/.test(text)) result.push("hot");
  if (/socker|sugar|honung|honey|sirap|syrup/.test(text)) result.push("sweet");
  if (/svamp|mushroom|soja|soy|parmesan|miso/.test(text)) result.push("umami");
  return result;
}
export type PairingAssessment = {
  rank: number;
  label: string;
  evidence: string[];
  cautions: string[];
  unknown: string[];
};
export function assessPairing(wine: PairingWine, dish: DishTrait[]): PairingAssessment {
  const evidence: string[] = [],
    cautions: string[] = [],
    unknown: string[] = [];
  const fields = new Set<string>();
  let rank = 0;
  function assess(
    field: "body" | "acidity" | "tannin" | "sweetness",
    positive: (v: number) => boolean,
    negative: (v: number) => boolean,
    good: string,
    warning: string,
    missing: string,
  ) {
    const value = wine[field];
    if (value === null || !Number.isFinite(value)) {
      unknown.push(missing);
      return;
    }
    fields.add(field);
    if (positive(value)) {
      rank += 2;
      evidence.push(good);
    } else if (negative(value)) {
      rank -= 3;
      cautions.push(warning);
    }
  }
  if (dish.includes("acidic"))
    assess(
      "acidity",
      (v) => v >= 6,
      (v) => v <= 4,
      "Registrerad frisk syra kan möta rättens syrlighet.",
      "Låg registrerad syra kan kännas platt mot en syrlig rätt.",
      "Vinets syra saknas.",
    );
  if (dish.includes("rich")) {
    assess(
      "acidity",
      (v) => v >= 6,
      () => false,
      "Frisk syra kan balansera en fyllig rätt.",
      "",
      "Vinets syra saknas.",
    );
    assess(
      "body",
      (v) => v >= 5,
      (v) => v <= 2,
      "Vinets registrerade fyllighet ger tyngd till kombinationen.",
      "Ett mycket lätt vin kan hamna i bakgrunden.",
      "Vinets fyllighet saknas.",
    );
  }
  if (dish.includes("hot")) {
    assess(
      "tannin",
      (v) => v <= 3,
      (v) => v >= 6,
      "Låg registrerad strävhet är en försiktig utgångspunkt till hetta.",
      "Hög strävhet kan förstärka känslan av hetta.",
      "Vinets strävhet saknas.",
    );
    assess(
      "sweetness",
      (v) => v >= 3,
      () => false,
      "Lite registrerad sötma kan mildra hetta.",
      "",
      "Vinets sötma saknas.",
    );
    unknown.push("Alkoholhalt bedöms inte i denna matchning.");
  }
  if (dish.includes("sweet"))
    assess(
      "sweetness",
      (v) => v >= 6,
      (v) => v <= 3,
      "Registrerad sötma kan möta en söt rätt.",
      "Ett torrt vin kan upplevas stramt mot söt mat.",
      "Vinets sötma saknas.",
    );
  if (dish.includes("umami"))
    assess(
      "tannin",
      (v) => v <= 3,
      (v) => v >= 6,
      "Lägre registrerad strävhet är en varsam utgångspunkt till umami.",
      "Umami kan framhäva bitterhet och strävhet.",
      "Vinets strävhet saknas.",
    );
  if (dish.includes("delicate"))
    assess(
      "body",
      (v) => v <= 4,
      (v) => v >= 8,
      "Ett lättare vin kan lämna utrymme åt milda smaker.",
      "Ett mycket fylligt vin kan dominera mild mat.",
      "Vinets fyllighet saknas.",
    );
  return {
    rank,
    label: cautions.length
      ? "Kan krocka"
      : fields.size >= 2 && evidence.length >= 2 && !unknown.length
        ? "Bra utgångspunkt"
        : evidence.length
          ? "Möjlig kombination"
          : "Begränsat underlag",
    evidence: [...new Set(evidence)],
    cautions: [...new Set(cautions)],
    unknown: [...new Set(unknown)],
  };
}
export function rankPairingWines(
  wines: PairingWine[],
  owner: string,
  dish: DishTrait[],
  preferences: RecommendationPreference[] = [],
  explicit: ExplicitTasteProfile | null = null,
) {
  return wines
    .filter((w) => w.user_id === owner && w.quantity > 0 && !w.consumed_at)
    .map((wine) => ({
      wine,
      assessment: assessPairing(wine, dish),
      personal: scorePersonalizedCandidate(wine, explicit, preferences).score,
    }))
    .sort(
      (a, b) =>
        b.assessment.rank - a.assessment.rank ||
        b.personal - a.personal ||
        (a.wine.wine_name ?? "").localeCompare(b.wine.wine_name ?? "", "sv"),
    );
}
export type RecipeChoice = { key: string; document: RecipeDocument; version?: RecipeVersion };
export function familyFit(recipe: RecipeDocument, diners: Diner[]) {
  const conflicts: string[] = [],
    likes: string[] = [],
    unknown: string[] = [];
  for (const diner of diners) {
    const preferences = diner.document.preferences;
    for (const p of preferences.filter((p) => p.attribute === "ingredient")) {
      if (!conflictingIngredients(recipe, [p.value]).length) continue;
      (p.direction < 0 ? conflicts : likes).push(
        `${diner.document.name}: ${p.direction < 0 ? "undviker" : "gillar"} ${p.value}`,
      );
    }
    if (preferences.some((p) => p.attribute !== "ingredient"))
      unknown.push(`${diner.document.name}: övriga önskemål behöver bedömas separat.`);
  }
  return { conflicts, likes, unknown };
}
export const mealInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    wineId: z.string().uuid(),
    wineRating: z.number().int().min(1).max(5).nullable(),
    pairingRating: z.number().int().min(1).max(5).nullable(),
    note: z
      .string()
      .max(500)
      .refine((value) => !sensitiveFood.test(value)),
  })
  .strict();
export const mealSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_id: z.string().uuid(),
  wine_id: z.string().uuid(),
  food_rating: z.number().int().min(1).max(5).nullable(),
  wine_rating: z.number().int().min(1).max(5).nullable(),
  pairing_rating: z.number().int().min(1).max(5).nullable(),
  note: z.string(),
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Meal = z.infer<typeof mealSchema>;
