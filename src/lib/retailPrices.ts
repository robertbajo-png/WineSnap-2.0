import { z } from "zod";
import type { CellarPrice } from "./cellarValue";
import { countryCode } from "./wineOrigins";

export const PRICE_BATCH_SIZE = 3;
export const PRICE_FRESH_DAYS = 30;
export const retailCandidateSchema = z.object({
  productNumber: z.string().regex(/^\d{1,20}$/),
  name: z.string().trim().min(1).max(400),
  producer: z.string().max(300).nullable(),
  vintage: z.number().int().min(1800).max(2200).nullable(),
  volumeMl: z.number().int().min(50).max(30000).nullable(),
  packaging: z.string().max(100).nullable(),
  country: z.string().max(100).nullable(),
  price: z.number().finite().positive().max(999999999),
  currency: z.literal("SEK"),
});
export type RetailCandidate = z.infer<typeof retailCandidateSchema>;
const identitySchema = z.object({
  wineId: z.string().uuid(),
  producer: z.string().nullable(),
  wineName: z.string().nullable(),
  vintage: z.number().int().nullable(),
  bottleMl: z.number().int().nullable(),
  country: z.string().nullable(),
});
export const retailQuoteSchema = retailCandidateSchema.extend({
  identity: identitySchema,
  verification: z.enum(["automatic", "manual"]),
});
const proposalSchema = z.object({
  identity: identitySchema,
  candidates: z.array(retailCandidateSchema).max(5),
});
export type RetailWine = CellarPrice & {
  id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  country: string | null;
  bottle_ml?: number | null;
  systembolaget_id?: string | null;
  market_price_source?: string | null;
  market_price_checked_at: string | null;
  retail_price_status?: string;
  retail_price_attempted_at?: string | null;
  retail_price_match?: unknown;
  retail_price_candidates?: unknown;
  updated_at: string;
};

export const priceRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("refresh"),
      wineIds: z.array(z.string().uuid()).min(1).max(PRICE_BATCH_SIZE),
    })
    .strict(),
  z
    .object({
      action: z.literal("confirm"),
      wineId: z.string().uuid(),
      productNumber: retailCandidateSchema.shape.productNumber,
      acknowledged: z.literal(true),
    })
    .strict(),
]);
export const priceResponseSchema = z.object({
  results: z
    .array(
      z.object({
        wineId: z.string().uuid(),
        status: z.enum(["matched", "review", "missing", "error", "changed", "skipped"]),
      }),
    )
    .max(PRICE_BATCH_SIZE),
});
export type PriceRequest = z.infer<typeof priceRequestSchema>;
export type PriceResult = z.infer<typeof priceResponseSchema>["results"][number];

export function priceIdentity(wine: RetailWine) {
  return {
    wineId: wine.id,
    producer: wine.producer,
    wineName: wine.wine_name,
    vintage: wine.vintage,
    bottleMl: wine.bottle_ml ?? null,
    country: wine.country,
  };
}
export function samePriceIdentity(wine: RetailWine, identity: z.infer<typeof identitySchema>) {
  const current = priceIdentity(wine);
  return (Object.keys(current) as Array<keyof typeof current>).every(
    (key) => current[key] === identity[key],
  );
}
function normalized(value: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function cuvee(value: string | null, producer: string | null, vintage: number | null) {
  let name = normalized(value);
  if (vintage)
    name = name
      .split(" ")
      .filter((part) => part !== String(vintage))
      .join(" ");
  const prefix = normalized(producer);
  if (prefix && name.startsWith(`${prefix} `)) name = name.slice(prefix.length + 1);
  return name;
}
export function canConfirmPrice(wine: RetailWine, candidate: RetailCandidate) {
  return (
    candidate.volumeMl !== null &&
    !/box|bag|can\b|burk|multipack|\d+\s*[x×]/i.test(candidate.packaging ?? "") &&
    (wine.vintage === null || candidate.vintage === wine.vintage) &&
    (wine.bottle_ml == null || candidate.volumeMl === wine.bottle_ml) &&
    (!wine.country ||
      !candidate.country ||
      (countryCode(wine.country) ?? normalized(wine.country)) ===
        (countryCode(candidate.country) ?? normalized(candidate.country)))
  );
}
export function exactRetailMatch(wine: RetailWine, candidate: RetailCandidate) {
  const producer = normalized(wine.producer);
  const name = cuvee(wine.wine_name, wine.producer, wine.vintage);
  return (
    canConfirmPrice(wine, candidate) &&
    wine.vintage !== null &&
    wine.bottle_ml != null &&
    Boolean(producer && name) &&
    producer === normalized(candidate.producer) &&
    name === cuvee(candidate.name, candidate.producer, candidate.vintage)
  );
}
export function sameCatalogProduct(a: RetailCandidate, b: RetailCandidate) {
  return (
    a.productNumber === b.productNumber &&
    a.name === b.name &&
    a.producer === b.producer &&
    a.vintage === b.vintage &&
    a.volumeMl === b.volumeMl &&
    a.packaging === b.packaging &&
    a.country === b.country
  );
}
export function acceptedRetailMatch(wine: RetailWine, candidate: RetailCandidate) {
  if (exactRetailMatch(wine, candidate)) return true;
  const quote = retailQuoteSchema.safeParse(wine.retail_price_match);
  return (
    quote.success &&
    quote.data.verification === "manual" &&
    samePriceIdentity(wine, quote.data.identity) &&
    canConfirmPrice(wine, candidate) &&
    sameCatalogProduct(quote.data, candidate)
  );
}
export function priceCandidates(wine: RetailWine) {
  const proposal = proposalSchema.safeParse(wine.retail_price_candidates);
  return proposal.success && samePriceIdentity(wine, proposal.data.identity)
    ? proposal.data.candidates
    : [];
}
export function priceFreshness(
  wine: RetailWine,
  now = Date.now(),
): "fresh" | "old" | "unverified" | "missing" {
  if (!wine.market_price || !Number.isFinite(wine.market_price) || wine.market_price <= 0)
    return "missing";
  const quote = retailQuoteSchema.safeParse(wine.retail_price_match);
  if (
    !quote.success ||
    !samePriceIdentity(wine, quote.data.identity) ||
    !canConfirmPrice(wine, quote.data) ||
    (quote.data.verification === "automatic" && !exactRetailMatch(wine, quote.data)) ||
    quote.data.price !== wine.market_price ||
    wine.market_price_currency !== "SEK" ||
    wine.market_price_source !== "bolaget.io"
  )
    return "unverified";
  const age = now - Date.parse(wine.market_price_checked_at ?? "");
  return wine.retail_price_status === "matched" && age >= 0 && age <= PRICE_FRESH_DAYS * 86400000
    ? "fresh"
    : "old";
}
export function missingPriceSchema(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export type PriceProgress = {
  total: number;
  checked: number;
  matched: number;
  review: number;
  missing: number;
  failed: number;
  skipped: number;
  remaining: string[];
};
export function initialPriceProgress(ids: string[]): PriceProgress {
  const remaining = [...new Set(ids)];
  return {
    total: remaining.length,
    checked: 0,
    matched: 0,
    review: 0,
    missing: 0,
    failed: 0,
    skipped: 0,
    remaining,
  };
}
export async function runPriceBatches(
  initial: PriceProgress,
  request: (ids: string[]) => Promise<unknown>,
  onProgress: (progress: PriceProgress, results: PriceResult[]) => void | Promise<void>,
  shouldStop: () => boolean,
) {
  let progress = { ...initial, remaining: [...initial.remaining] };
  while (progress.remaining.length && !shouldStop()) {
    const ids = progress.remaining.slice(0, PRICE_BATCH_SIZE);
    const { results } = priceResponseSchema.parse(await request(ids));
    if (
      results.length !== ids.length ||
      new Set(results.map((r) => r.wineId)).size !== ids.length ||
      results.some((r) => !ids.includes(r.wineId))
    )
      throw new Error("Incomplete price batch");
    progress = {
      ...progress,
      checked: progress.checked + ids.length,
      remaining: progress.remaining.slice(ids.length),
    };
    for (const result of results) {
      if (result.status === "error") progress.failed++;
      else if (result.status === "changed" || result.status === "skipped") progress.skipped++;
      else progress[result.status]++;
    }
    await onProgress(progress, results);
  }
  return progress;
}
