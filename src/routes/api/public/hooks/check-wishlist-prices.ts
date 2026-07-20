import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily cron endpoint: fetches current Systembolaget price for each wishlist
 * entry with notify_on_drop = true and target_price set. If the current price
 * has dropped at/under the user's target, marks price_alert_triggered_at so
 * the app can show an in-app alert.
 *
 * Uses the community "bolaget.io" API which mirrors Systembolaget's product
 * catalog (no auth key required). If that endpoint ever changes, swap the
 * fetchPrice() implementation below.
 */
export const Route = createFileRoute("/api/public/hooks/check-wishlist-prices")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("wishlist")
          .select("id,producer,wine_name,vintage,target_price,systembolaget_id,notify_on_drop")
          .eq("notify_on_drop", true)
          .not("target_price", "is", null);

        if (error) {
          console.error("[wishlist-prices] load error", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let checked = 0;
        let triggered = 0;

        for (const row of rows ?? []) {
          try {
            const query = [row.producer, row.wine_name].filter(Boolean).join(" ").trim();
            if (!query && !row.systembolaget_id) continue;

            const hit = await fetchPrice({ query, systembolagetId: row.systembolaget_id });
            checked += 1;
            if (!hit) continue;

            const patch: Record<string, unknown> = {
              last_checked_price: hit.price,
              last_checked_at: new Date().toISOString(),
              price_source: "systembolaget",
              systembolaget_id: hit.productNumber ?? row.systembolaget_id ?? null,
              systembolaget_url: hit.url ?? null,
            };

            if (row.target_price != null && hit.price <= Number(row.target_price)) {
              patch.price_alert_triggered_at = new Date().toISOString();
              patch.price_alert_seen_at = null;
              triggered += 1;
            }

            await supabaseAdmin.from("wishlist").update(patch as never).eq("id", row.id);
          } catch (e) {
            console.error("[wishlist-prices] row failed", row.id, e);
          }
        }

        return Response.json({ ok: true, checked, triggered, total: rows?.length ?? 0 });
      },
    },
  },
});

type PriceHit = { price: number; productNumber?: string; url?: string };

async function fetchPrice(args: { query: string; systembolagetId?: string | null }): Promise<PriceHit | null> {
  const base = "https://api.bolaget.io/v1";
  const url = args.systembolagetId
    ? `${base}/products/${encodeURIComponent(args.systembolagetId)}`
    : `${base}/products?query=${encodeURIComponent(args.query)}&limit=1`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
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
