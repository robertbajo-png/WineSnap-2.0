import { createFileRoute } from "@tanstack/react-router";
import { fetchSystembolagetPrice } from "@/lib/server/systembolaget";

export const Route = createFileRoute("/api/internal/cron/check-wishlist-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.WISHLIST_CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!expected || !provided || !(await secretsMatch(expected, provided))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("wishlist")
          .select("id,producer,wine_name,target_price,systembolaget_id")
          .eq("notify_on_drop", true)
          .not("target_price", "is", null)
          .limit(500);
        if (error)
          return Response.json({ error: "Could not load wishlist entries" }, { status: 500 });

        let checked = 0;
        let triggered = 0;
        let failed = 0;
        const queue = [...(rows ?? [])];

        const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
          while (queue.length) {
            const row = queue.shift();
            if (!row) return;
            try {
              const query = [row.producer, row.wine_name].filter(Boolean).join(" ").trim();
              const hit = await fetchSystembolagetPrice({
                query,
                systembolagetId: row.systembolaget_id,
              });
              checked += 1;
              if (!hit) continue;

              const reachedTarget = hit.price <= Number(row.target_price);
              const { error: updateError } = await supabaseAdmin
                .from("wishlist")
                .update({
                  last_checked_price: hit.price,
                  last_checked_at: new Date().toISOString(),
                  price_source: "systembolaget",
                  systembolaget_id: hit.productNumber ?? row.systembolaget_id ?? null,
                  systembolaget_url: hit.url ?? null,
                  ...(reachedTarget
                    ? {
                        price_alert_triggered_at: new Date().toISOString(),
                        price_alert_seen_at: null,
                      }
                    : {}),
                })
                .eq("id", row.id);
              if (updateError) throw updateError;
              if (reachedTarget) triggered += 1;
            } catch (error) {
              failed += 1;
              console.error("[wishlist-price-cron] row failed", row.id, error);
            }
          }
        });
        await Promise.all(workers);

        return Response.json(
          { ok: true, checked, triggered, failed, total: rows?.length ?? 0 },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});

async function secretsMatch(expected: string, provided: string) {
  const encoder = new TextEncoder();
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const a = new Uint8Array(expectedHash);
  const b = new Uint8Array(providedHash);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
