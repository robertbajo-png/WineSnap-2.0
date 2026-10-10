import { z } from "zod";
import {
  retailQuoteSchema,
  samePriceIdentity,
  exactRetailMatch,
  type RetailWine,
} from "./retailPrices";
export const wishlistPriceResponse = z.object({
  ok: z.boolean(),
  checked: z.number().int().nonnegative(),
  triggered: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export function wishlistRetailWine(row: {
  id: string;
  producer: string | null;
  wine_name: string;
  vintage: number | null;
  country: string | null;
  bottle_ml?: number | null;
  systembolaget_id?: string | null;
}): RetailWine {
  return {
    ...row,
    bottle_ml: row.bottle_ml ?? null,
    updated_at: "",
    market_price_checked_at: null,
    consumed_at: null,
    quantity: 1,
    purchase_price: null,
    purchase_currency: null,
    market_price: null,
    market_price_currency: null,
  };
}

export function verifiedWishlistQuote(
  row: Parameters<typeof wishlistRetailWine>[0] & {
    retail_price_match?: unknown;
    last_checked_price: number | null;
    last_checked_currency: string | null;
  },
) {
  const quote = retailQuoteSchema.safeParse(row.retail_price_match);
  const wine = wishlistRetailWine(row);
  return (
    quote.success &&
    samePriceIdentity(wine, quote.data.identity) &&
    exactRetailMatch(wine, quote.data) &&
    quote.data.price === row.last_checked_price &&
    row.last_checked_currency === "SEK"
  );
}
