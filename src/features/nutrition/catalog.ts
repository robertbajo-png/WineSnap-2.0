import { z } from "zod";
import snapshot from "./slv-reference.json";
import {
  availableCarbs,
  energyMaxKcal,
  forms,
  referenceSchema,
  type FoodReference,
} from "./domain";

const edibleBasis = {
  viktGram: z.literal(100),
  matrisenhetkod: z.literal("W"),
};
const nutrientSchema = z.union([
  z.object({
    ...edibleBasis,
    euroFIRkod: z.enum(["CHO", "FIBT", "PROT", "FAT"]),
    enhet: z.literal("g"),
    varde: z.number().finite().min(0).max(100).nullable().optional(),
  }),
  z.object({
    ...edibleBasis,
    euroFIRkod: z.literal("ENERC"),
    enhet: z.literal("kcal"),
    varde: z.number().finite().min(0).max(energyMaxKcal).nullable().optional(),
  }),
]);
const recordSchema = z
  .object({
    id: z.number().int().positive(),
    form: z.enum(forms),
    food: z.object({ nummer: z.number().int(), namn: z.string(), version: z.string() }),
    nutrients: z.array(nutrientSchema).max(5),
  })
  .refine(
    (r) =>
      r.id === r.food.nummer &&
      new Set(r.nutrients.map((n) => n.euroFIRkod)).size === r.nutrients.length,
  );
export function parseSlvRecord(
  value: unknown,
  metadata: { datasetVersion: string; retrievedAt: string },
): FoodReference {
  const r = recordSchema.parse(value);
  const find = (code: string) => r.nutrients.find((n) => n.euroFIRkod === code)?.varde ?? null;
  return referenceSchema.parse({
    id: `slv:${r.id}`,
    name: r.food.namn,
    form: r.form,
    convention: "EU",
    energyKcal: find("ENERC"),
    carbs: find("CHO"),
    fiber: find("FIBT"),
    protein: find("PROT"),
    fat: find("FAT"),
    source: {
      kind: "slv",
      recordId: r.id,
      recordVersion: r.food.version,
      datasetVersion: metadata.datasetVersion,
      retrievedAt: metadata.retrievedAt,
      url: `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${r.id}/naringsvarden?sprak=1`,
    },
  });
}
export const referenceFoods = snapshot.records
  .map((r) => parseSlvRecord(r, snapshot))
  .sort((a, b) => a.name.localeCompare(b.name, "sv"));
export const referenceAttribution = snapshot.attribution;
export const referenceLicense = snapshot.license.url;

const swapReferences: Readonly<Record<string, string>> = {
  "slv:845": "slv:362", // Dry pasta to raw squash.
  "slv:846": "slv:362", // Cooked pasta, separately weighed from the squash.
  "slv:2481": "slv:322", // Dry rice to raw cauliflower.
  "slv:2515": "slv:434", // Cooked rice to cooked cauliflower.
  "slv:4457": "slv:322", // Raw potato to raw cauliflower.
  "slv:5153": "slv:434", // Cooked potato to cooked cauliflower.
};

export function suggestedSwap(reference: FoodReference | null | undefined): FoodReference | null {
  if (reference?.source.kind !== "slv") return null;
  const target = referenceFoods.find((item) => item.id === swapReferences[reference.id]);
  if (!target) return null;
  const originalCarbs = availableCarbs(reference),
    targetCarbs = availableCarbs(target);
  return originalCarbs !== null && targetCarbs !== null && targetCarbs < originalCarbs
    ? target
    : null;
}
