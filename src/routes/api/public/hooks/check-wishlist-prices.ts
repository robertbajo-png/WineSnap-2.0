import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily cron endpoint: fetches the current Systembolaget price for each wishlist
 * entry with notify_on_drop = true and target_price set. If the current price
 * has dropped at/under the user's target, marks price_alert_triggered_at so
 * the app can show an in-app alert.
 *
 * Hardening:
 * - Optional shared-secret header (CRON_SECRET) so only the scheduler can run it.
 * - Paginates through the whole wishlist instead of relying on the default limit.
 * - Per-row error collection so one bad row never aborts the run.
 * - Never re-triggers an alert that is still unseen, or one already triggered
 *   for the same (or a higher) price — no repeated notifications.
 *
 * Uses the community "bolaget.io" API which mirrors Systembolaget's product
 * catalog (no auth key required). If that endpoint ever changes, swap the
 * fetchPrice() implementation below.
 */

const PAGE_SIZE = 200;
const FETCH_TIMEOUT_MS = 8000;
const MAX_ROWS_PER_RUN = 2000;

export const Route = createFileRoute("/api/public/hooks/check-wishlist-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret && request.headers.get("x-cron-secret") !== secret) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const startedAt = Date.now();
        let checked = 0;
        let triggered = 0;
        let total = 0;
        const errors: Array<{ id: string; message: string }> = [];

        for (let page = 0; page * PAGE_SIZE < MAX_ROWS_PER_RUN; page += 1) {
          const from = page * PAGE_SIZE;
          const { data: rows, error } = await supabaseAdmin
            .from("wishlist")
            .select(
              "id,producer,wine_name,vintage,target_price,systembolaget_id,notify_on_drop,last_checked_price,price_alert_triggered_at,price_alert_seen_at",
            )
            .eq("notify_on_drop", true)
            .not("target_price", "is", null)
            .order("created_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (error) {
            console.error("[wishlist-prices] load error", error);
            return Response.json(
              { ok: false, error: error.message, checked, triggered, total },
              { status: 500 },
            );
          }

          const batch = rows ?? [];
          if (!batch.length) break;
          total += batch.length;

          for (const row of batch) {
            try {
              const query = [row.producer, row.wine_name].filter(Boolean).join(" ").trim();
              if (!query && !row.systembolaget_id) continue;

              const hit = await fetchPrice({
                query,
                systembolagetId: row.systembolaget_id,
              });
              checked += 1;
              if (!hit) continue;

              const patch: Record<string, unknown> = {
                last_checked_price: hit.price,
                last_checked_at: new Date().toISOString(),
                price_source: "systembolaget",
                systembolaget_id: hit.productNumber ?? row.systembolaget_id ?? null,
                systembolaget_url: hit.url ?? null,
              };

              const target = row.target_price != null ? Number(row.target_price) : null;
              const belowTarget = target != null && hit.price <= target;

              // Only raise a new alert when there is no pending (unseen) alert and
              // the price actually improved since the last alert we sent.
              const pendingAlert =
                row.price_alert_triggered_at != null &&
                (row.price_alert_seen_at == null ||
                  new Date(row.price_alert_seen_at) < new Date(row.price_alert_triggered_at));
              const lastPrice =
                row.last_checked_price != null ? Number(row.last_checked_price) : null;
              const priceImproved = lastPrice == null || hit.price < lastPrice;

              if (belowTarget && !pendingAlert && (row.price_alert_triggered_at == null || priceImproved)) {
                patch.price_alert_triggered_at = new Date().toISOString();
                patch.price_alert_seen_at = null;
                triggered += 1;
              }

              const { error: updateError } = await supabaseAdmin
                .from("wishlist")
                .update(patch as never)
                .eq("id", row.id);
              if (updateError) {
                errors.push({ id: row.id, message: updateError.message });
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : "Unknown error";
              console.error("[wishlist-prices] row failed", row.id, message);
              errors.push({ id: row.id, message });
            }
          }

          if (batch.length < PAGE_SIZE) break;
        }

        const result = {
          ok: errors.length === 0,
          checked,
          triggered,
          total,
          failed: errors.length,
          errors: errors.slice(0, 20),
          durationMs: Date.now() - startedAt,
        };
        console.log("[wishlist-prices] run complete", JSON.stringify(result));
        return Response.json(result);
      },
    },
  },
});

type PriceHit = { price: number; productNumber?: string; url?: string };

async function fetchPrice(args: {
  query: string;
  systembolagetId?: string | null;
}): Promise<PriceHit | null> {
  const base = "https://api.bolaget.io/v1";
  const url = args.systembolagetId
    ? `${base}/products/${encodeURIComponent(args.systembolagetId)}`
    : `${base}/products?query=${encodeURIComponent(args.query)}&limit=1`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as unknown;

  const product = Array.isArray(json)
    ? (json[0] as Record<string, unknown> | undefined)
    : (json as Record<string, unknown>);
  if (!product) return null;

  const price = Number(
    (product.price as number | undefined) ??
      (product.priceInclVat as number | undefined) ??
      (product.salesPrice as number | undefined),
  );
  if (!Number.isFinite(price) || price <= 0) return null;

  const productNumber =
    (product.productNumber as string | undefined) ??
    (product.productId as string | undefined) ??
    (product.nr as string | undefined);

  const slug = productNumber ? `${productNumber}` : "";
  return {
    price,
    productNumber,
    url: slug ? `https://www.systembolaget.se/produkt/vin/${slug}` : undefined,
  };
}
