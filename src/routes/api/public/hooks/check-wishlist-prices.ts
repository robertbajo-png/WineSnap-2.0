import { createFileRoute } from "@tanstack/react-router";
import { requireRequestUser, routeError } from "@/lib/server/requestAuth";
import { fetchSystembolagetPrice } from "@/lib/server/systembolaget";

/**
 * Authenticated on-demand endpoint: checks the current user's Systembolaget
 * wishlist entries. The global daily job has a separate signed cron route.
 * If the current price
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
      POST: async ({ request }) => {
        try {
          const { supabase, user } = await requireRequestUser(request, "wishlist-price-check");
          const { data: rows, error } = await supabase
            .from("wishlist")
            .select("id,producer,wine_name,vintage,target_price,systembolaget_id,notify_on_drop")
            .eq("user_id", user.id)
            .eq("notify_on_drop", true)
            .not("target_price", "is", null)
            .limit(20);

          if (error) throw error;

          let checked = 0;
          let triggered = 0;

          for (const row of rows ?? []) {
            try {
              const query = [row.producer, row.wine_name].filter(Boolean).join(" ").trim();
              if (!query && !row.systembolaget_id) continue;

              const hit = await fetchSystembolagetPrice({
                query,
                systembolagetId: row.systembolaget_id,
              });
              checked += 1;
              if (!hit) continue;

              const patch: {
                last_checked_price: number;
                last_checked_at: string;
                price_source: string;
                systembolaget_id: string | null;
                systembolaget_url: string | null;
                price_alert_triggered_at?: string;
                price_alert_seen_at?: null;
              } = {
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

              const { error: updateError } = await supabase
                .from("wishlist")
                .update(patch)
                .eq("id", row.id);
              if (updateError) throw updateError;
            } catch (error) {
              console.error("[wishlist-prices] row failed", row.id, error);
            }
          }

          return Response.json({ ok: true, checked, triggered, total: rows?.length ?? 0 });
        } catch (error) {
          return routeError(error);
        }
      },
    },
  },
});
