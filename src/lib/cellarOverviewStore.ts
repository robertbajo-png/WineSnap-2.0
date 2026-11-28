import {
  accountAccessToken,
  accountWriteClient,
  type AccountWriteScope,
} from "./accountWriteScope";
import { readAllPages } from "./readAllPages";
import {
  missingPriceSchema,
  priceRequestSchema,
  priceResponseSchema,
  type PriceRequest,
  type RetailWine,
} from "./retailPrices";
import type { RatedWine } from "./wineRatings";

export type OverviewWine = RetailWine &
  RatedWine & {
    user_id: string;
    region: string | null;
    country: string | null;
    grape_varieties: string[] | null;
    vintage: number | null;
    wine_type: string | null;
    user_rating: number | null;
    purchase_price: number | null;
    purchase_currency: string | null;
    purchased_at: string | null;
    consumed_at: string | null;
    quantity: number | null;
    created_at: string;
    market_price: number | null;
    market_price_currency: string | null;
    market_price_checked_at: string | null;
  };
const LEGACY_COLS =
  "id,user_id,producer,wine_name,region,country,grape_varieties,vintage,wine_type,user_rating,purchase_price,purchase_currency,purchased_at,consumed_at,quantity,created_at,updated_at,systembolaget_id,market_price,market_price_currency,market_price_source,market_price_checked_at,tasting_notes(rating,created_at,user_id)";
const PRICE_COLS = `${LEGACY_COLS},bottle_ml,retail_price_status,retail_price_attempted_at,retail_price_match,retail_price_candidates`;
function active(scope: AccountWriteScope, signal: AbortSignal) {
  if (!scope.current() || signal.aborted) throw new Error("account_scope_changed");
}

export async function loadOverviewWines(
  scope: AccountWriteScope,
  signal: AbortSignal,
  ids?: string[],
  ready = true,
) {
  active(scope, signal);
  const client = await accountWriteClient(scope, 15000, signal);
  active(scope, signal);
  async function load(
    usePriceColumns: boolean,
  ): Promise<{ wines: OverviewWine[]; ready: boolean }> {
    try {
      const rows = await readAllPages(
        (from, to) => {
          active(scope, signal);
          let query = client
            .from("wines")
            .select(usePriceColumns ? PRICE_COLS : LEGACY_COLS)
            .eq("user_id", scope.owner)
            .order("id")
            .range(from, to)
            .abortSignal(signal);
          if (ids) query = query.in("id", ids);
          return query;
        },
        () => !scope.current() || signal.aborted,
      );
      active(scope, signal);
      const wines = rows as unknown as OverviewWine[];
      if (wines.some((row) => row.user_id !== scope.owner || (ids && !ids.includes(row.id))))
        throw new Error("invalid_overview_rows");
      return { wines, ready: usePriceColumns };
    } catch (error) {
      active(scope, signal);
      if (usePriceColumns && missingPriceSchema(error as { code?: string })) return load(false);
      throw error;
    }
  }
  if (ids?.length === 0) return { wines: [], ready };
  return load(ready);
}

export async function requestOverviewPrices(
  scope: AccountWriteScope,
  input: PriceRequest,
  signal: AbortSignal,
) {
  active(scope, signal);
  const body = priceRequestSchema.parse(input);
  const token = await accountAccessToken(scope, 15000, signal);
  active(scope, signal);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 15000);
  try {
    const response = await fetch("/api/public/hooks/refresh-cellar-values", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, timeout.signal]),
    });
    active(scope, signal);
    const json = await response.json();
    active(scope, signal);
    if (timeout.signal.aborted) throw new Error("price_request_timeout");
    if (!response.ok)
      throw new Error(
        json?.error === "migration_required" ? "migration_required" : "price_request_failed",
      );
    return priceResponseSchema.parse(json);
  } finally {
    clearTimeout(timer);
  }
}
