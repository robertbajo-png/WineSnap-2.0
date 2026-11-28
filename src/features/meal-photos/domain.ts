import { z } from "zod";

export const mealPhotoFrameSideLimit = 1024;

const maxItems = 20;
const foodName = z.string().trim().min(1).max(100);
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

export const confirmedPhotoMealSchema = z.strictObject({
  items: z.array(reviewItemSchema).min(1).max(maxItems),
  keepPhoto: z.boolean(),
});

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
