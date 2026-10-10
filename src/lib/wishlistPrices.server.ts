import {
  exactRetailMatch,
  priceIdentity,
  type RetailCandidate,
  type RetailWine,
} from "./retailPrices";
import { z } from "zod";
import { wishlistRetailWine } from "./wishlistPriceContract";

export type WishlistPriceRow = {
  id: string;
  user_id: string;
  producer: string | null;
  wine_name: string;
  vintage: number | null;
  country: string | null;
  bottle_ml: number | null;
  systembolaget_id: string | null;
  price_currency: string | null;
  notify_on_drop: boolean;
  target_price: number | null;
  last_checked_price: number | null;
  last_checked_at: string | null;
  price_alert_triggered_at: string | null;
  price_alert_seen_at: string | null;
};
const inputSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(3) }).strict();
type Dependencies = {
  secret: () => string | undefined;
  authenticate: (request: Request) => Promise<string | null>;
  load: (userId: string | null, ids?: string[]) => Promise<WishlistPriceRow[]>;
  lookup: (wine: RetailWine) => Promise<RetailCandidate[]>;
  save: (row: WishlistPriceRow, patch: Record<string, unknown>) => Promise<boolean>;
  now?: () => number;
};
export function createWishlistPriceHandler(deps: Dependencies, mode: "cron" | "manual") {
  return async (request: Request) => {
    try {
      let userId: string | null = null;
      let ids: string[] | undefined;
      if (mode === "cron") {
        const secret = deps.secret();
        if (!secret) return Response.json({ error: "Scheduler not configured" }, { status: 503 });
        if (request.headers.get("x-cron-secret") !== secret)
          return Response.json({ error: "Unauthorized" }, { status: 401 });
      } else {
        userId = await deps.authenticate(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const input = inputSchema.safeParse(await request.json().catch(() => null));
        if (!input.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        ids = [...new Set(input.data.ids)];
      }
      const rows = await deps.load(userId, ids);
      if (userId && rows.some((row) => row.user_id !== userId || !ids?.includes(row.id)))
        throw new Error("Invalid owner scope");
      const clock = deps.now ?? Date.now;
      const start = clock();
      let checked = 0,
        triggered = 0,
        failed = 0,
        unmatched = 0;
      for (let from = 0; from < rows.length && clock() - start < 18000; from += 3) {
        await Promise.all(
          rows.slice(from, from + 3).map(async (row) => {
            checked++;
            try {
              const wine = wishlistRetailWine(row);
              if (wine.bottle_ml === null || wine.vintage === null) {
                unmatched++;
                return;
              }
              const matches = (await deps.lookup(wine)).filter((candidate) =>
                exactRetailMatch(wine, candidate),
              );
              if (matches.length !== 1) {
                unmatched++;
                return;
              }
              const hit = matches[0];
              const pending =
                row.price_alert_triggered_at !== null &&
                (!row.price_alert_seen_at ||
                  row.price_alert_seen_at < row.price_alert_triggered_at);
              const alert =
                row.notify_on_drop &&
                row.price_currency === "SEK" &&
                row.target_price !== null &&
                hit.price <= row.target_price &&
                !pending &&
                (!row.price_alert_triggered_at ||
                  row.last_checked_price === null ||
                  hit.price < row.last_checked_price);
              const at = new Date(clock()).toISOString();
              const saved = await deps.save(row, {
                last_checked_price: hit.price,
                last_checked_at: at,
                price_source: "bolaget.io",
                last_checked_currency: "SEK",
                retail_price_match: {
                  ...hit,
                  identity: priceIdentity(wine),
                  verification: "automatic",
                },
                systembolaget_id: hit.productNumber,
                systembolaget_url: `https://www.systembolaget.se/produkt/vin/${hit.productNumber}`,
                ...(alert ? { price_alert_triggered_at: at, price_alert_seen_at: null } : {}),
              });
              if (!saved) failed++;
              else if (alert) triggered++;
            } catch {
              failed++;
            }
          }),
        );
      }
      const remaining = rows.length - checked;
      return Response.json({
        ok: failed === 0 && remaining === 0,
        checked,
        triggered,
        failed,
        unmatched,
        remaining,
      });
    } catch {
      return Response.json({ error: "Price service unavailable" }, { status: 503 });
    }
  };
}
