import { z } from "zod";

export const mealPhotoFrameSideLimit = 1024;

const maxItems = 20;
const foodName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((name) => /^[^\p{Cc}]+$/u.test(name));
const grams = z.number().int().min(1).max(10_000);
const gramsRange = z
  .strictObject({ minGrams: grams, maxGrams: grams })
  .refine(({ minGrams, maxGrams }) => minGrams < maxGrams);

const photoEstimateItem = z.strictObject({
  name: foodName,
  confidence: z.enum(["low", "medium", "high"]),
  portion: gramsRange.nullable(),
});

export const mealPhotoEstimateSchema = z.strictObject({
  items: z.array(photoEstimateItem).max(maxItems),
});

const reviewedPortion = z
  .discriminatedUnion("source", [
    z.strictObject({ source: z.literal("photo_estimate"), range: gramsRange }),
    z.strictObject({ source: z.literal("manual"), grams }),
  ])
  .nullable();

const reviewItemSchema = z.strictObject({ name: foodName, portion: reviewedPortion });
const reviewedItems = z.array(reviewItemSchema).min(1).max(maxItems);

export const confirmedPhotoMealSchema = z.strictObject({
  items: reviewedItems,
  keepPhoto: z.boolean(),
});

export const mealPhotoStateSchema = z.enum(["none", "pending", "ready", "removing", "removed"]);
export const mealPhotoDigestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const savedPhotoMealSchema = z
  .strictObject({
    id: z.uuid(),
    user_id: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
    items: reviewedItems,
    keep_photo: z.boolean(),
    photo_state: mealPhotoStateSchema,
    photo_sha256: mealPhotoDigestSchema.nullable(),
  })
  .refine(
    (record) =>
      record.keep_photo === (record.photo_state !== "none") &&
      (record.photo_state !== "ready" || record.photo_sha256 !== null) &&
      (record.photo_sha256 === null ||
        ["pending", "ready", "removing"].includes(record.photo_state)),
  );

export type MealPhotoEstimate = z.infer<typeof mealPhotoEstimateSchema>;
export type PhotoMealReviewItem = z.infer<typeof reviewItemSchema>;
export type ConfirmedPhotoMeal = z.infer<typeof confirmedPhotoMealSchema>;

export function openPhotoMealReview(estimate: MealPhotoEstimate) {
  const items: PhotoMealReviewItem[] = estimate.items.map(({ name, portion }) => ({
    name,
    portion: portion ? { source: "photo_estimate", range: { ...portion } } : null,
  }));
  return { items, keepPhoto: false };
}

export function renamePhotoMealItem(item: PhotoMealReviewItem, name: string): PhotoMealReviewItem {
  return {
    name,
    portion:
      item.portion?.source === "photo_estimate" && name.trim() !== item.name.trim()
        ? null
        : item.portion,
  };
}
