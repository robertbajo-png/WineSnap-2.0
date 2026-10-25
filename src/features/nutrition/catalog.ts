import { z } from "zod";
import snapshot from "./slv-reference.json";
import { forms, referenceSchema, type FoodReference } from "./domain";

const nutrientSchema = z.object({
  euroFIRkod: z.string(),
  enhet: z.literal("g"),
  viktGram: z.literal(100),
  matrisenhetkod: z.literal("W"),
  varde: z.number().finite().min(0).max(100).nullable().optional(),
});
const recordSchema = z
  .object({
    id: z.number().int().positive(),
    form: z.enum(forms),
    food: z.object({ nummer: z.number().int(), namn: z.string(), version: z.string() }),
    nutrients: z.array(nutrientSchema).max(4),
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
      url: `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${r.id}`,
    },
  });
}
export const referenceFoods = snapshot.records
  .map((r) => parseSlvRecord(r, snapshot))
  .sort((a, b) => a.name.localeCompare(b.name, "sv"));
export const referenceAttribution = snapshot.attribution;
export const referenceLicense = snapshot.license.url;
