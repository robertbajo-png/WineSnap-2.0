import { z } from "zod";
import {
  convertAmount,
  savedSessionSchema,
  scaledAmount,
  units,
  validState,
  versionSchema,
} from "../kitchen/domain";
import { ingredientBaseUnits, ingredientIdentity } from "../kitchen/ingredientIdentity";
import type { buildShoppingList } from "../planning/domain";

export const stockConfirmationMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const id = z.uuid().transform((value) => value.toLowerCase());
const stockFields = {
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0).max(1_000_000).nullable(),
  unit: z.enum(units),
};
export const stockInputSchema = z
  .object({ ...stockFields, confirmed: z.boolean() })
  .strict()
  .refine(({ amount, confirmed }) => !confirmed || amount !== null);
export const stockItemSchema = z
  .object({ id, ...stockFields, confirmedAt: z.iso.datetime({ offset: true }).nullable() })
  .strict()
  .refine(({ amount, confirmedAt }) => confirmedAt === null || amount !== null);
export const pantrySnapshotSchema = z
  .object({
    user_id: id,
    revision: z.int().min(1).max(2147483647),
    items: z.array(stockItemSchema).max(300),
    last_request_id: id,
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(({ items }) => new Set(items.map((item) => item.id)).size === items.length);
export type StockItem = z.infer<typeof stockItemSchema>;
export type PantrySnapshot = z.infer<typeof pantrySnapshotSchema>;
type ConfirmedStock = StockItem & { amount: number; confirmedAt: string };
const actualAmount = z.number().min(0.000000001).max(1_000_000);
const usedItem = z.object({ itemId: id, amount: actualAmount }).strict();
export const consumptionItemsSchema = z
  .array(usedItem)
  .min(1)
  .max(80)
  .refine((items) => new Set(items.map((item) => item.itemId)).size === items.length);
export type ConsumptionItems = z.infer<typeof consumptionItemsSchema>;
export const consumptionReceiptSchema = z
  .object({
    session_id: id,
    user_id: id,
    pantry_revision: z.int().min(2).max(2147483647),
    request_id: id,
    items: z
      .array(
        usedItem.extend({
          name: stockFields.name,
          unit: stockFields.unit,
        }),
      )
      .min(1)
      .max(80)
      .refine((items) => new Set(items.map((item) => item.itemId)).size === items.length),
    confirmed_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ConsumptionReceipt = z.infer<typeof consumptionReceiptSchema>;

export function stockStatus(item: StockItem, now: number) {
  if (item.amount === null || item.confirmedAt === null) return "unconfirmed";
  const age = now - Date.parse(item.confirmedAt);
  if (!Number.isFinite(age) || age < 0) return "unconfirmed";
  return age <= stockConfirmationMaxAgeMs ? "fresh" : "stale";
}

function confirmedStock(owner: string, snapshot: unknown, now: number) {
  const stock = pantrySnapshotSchema.safeParse(snapshot);
  if (!stock.success || stock.data.user_id !== owner.toLowerCase()) return [];
  return stock.data.items.filter(
    (item): item is ConfirmedStock =>
      item.amount !== null &&
      item.amount > 0 &&
      item.confirmedAt !== null &&
      stockStatus(item, now) === "fresh",
  );
}

const readableAmount = (amount: number) => Number(amount.toPrecision(15));
type ShoppingSuggestion = { needed: number; covered: number; toBuy: number };

// Inventory is advisory. Never replace an edit, mark an item bought, or consume stock here.
export function suggestPantryShopping(
  owner: string,
  shopping: ReturnType<typeof buildShoppingList>,
  snapshot: unknown,
  now: number,
) {
  const suggestions = new Map<string, ShoppingSuggestion>();
  if (shopping.status !== "ready") return suggestions;
  const totals = new Map<string, number>();
  for (const item of confirmedStock(owner, snapshot, now)) {
    const key = ingredientIdentity(item.name, item.unit);
    totals.set(
      key,
      (totals.get(key) ?? 0) +
        convertAmount(item.amount, item.unit, ingredientBaseUnits[item.unit]),
    );
  }
  for (const item of shopping.recipeItems) {
    const needed = item.basis.knownAmount;
    if (item.checked || item.excluded || item.adjustment || item.basis.unknownAmounts || !needed)
      continue;
    const covered = Math.min(needed, readableAmount(totals.get(item.key) ?? 0));
    if (covered > 0)
      suggestions.set(item.key, { needed, covered, toBuy: readableAmount(needed - covered) });
  }
  return suggestions;
}

export type ConsumptionSuggestion = {
  itemId: string;
  name: string;
  unit: StockItem["unit"];
  suggestedAmount: number;
  availableAmount: number;
};

// These amounts are only a review draft; the user must confirm actual consumption.
export function suggestPantryConsumption(
  owner: string,
  candidateSession: unknown,
  candidateVersion: unknown,
  snapshot: unknown,
  now: number,
): ConsumptionSuggestion[] {
  const session = savedSessionSchema.safeParse(candidateSession);
  const version = versionSchema.safeParse(candidateVersion);
  if (
    !session.success ||
    !version.success ||
    session.data.state.status !== "completed" ||
    session.data.user_id.toLowerCase() !== owner.toLowerCase() ||
    version.data.user_id.toLowerCase() !== owner.toLowerCase() ||
    session.data.recipe_version_id.toLowerCase() !== version.data.id.toLowerCase()
  )
    return [];
  const recipe = version.data.document;
  try {
    validState(session.data.state, recipe);
  } catch {
    return [];
  }
  const demands = new Map<string, number>();
  const uncertain = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    const key = ingredientIdentity(ingredient.name, ingredient.unit);
    if (!ingredient.amount) uncertain.add(key);
    else {
      const scaled = scaledAmount(ingredient.amount, recipe.servings, session.data.state.servings);
      const required = convertAmount(scaled, ingredient.unit, ingredientBaseUnits[ingredient.unit]);
      demands.set(key, (demands.get(key) ?? 0) + required);
    }
  }
  const result: ConsumptionSuggestion[] = [];
  const stock = confirmedStock(owner, snapshot, now).sort(
    (a, b) => Date.parse(a.confirmedAt) - Date.parse(b.confirmedAt) || a.id.localeCompare(b.id),
  );
  for (const item of stock) {
    const key = ingredientIdentity(item.name, item.unit);
    const needed = demands.get(key) ?? 0;
    const base = ingredientBaseUnits[item.unit];
    const available = item.amount;
    if (uncertain.has(key) || needed <= 0) continue;
    const used = Math.min(available, readableAmount(convertAmount(needed, base, item.unit)));
    if (used <= 0) continue;
    demands.set(key, Math.max(0, readableAmount(needed - convertAmount(used, item.unit, base))));
    result.push({
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      suggestedAmount: used,
      availableAmount: available,
    });
  }
  return result;
}
