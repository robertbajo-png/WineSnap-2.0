import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/hooks/refresh-cellar-values
 *
 * Fetches the current retail price for the signed-in user's un-consumed wines
 * from the Systembolaget catalog (community bolaget.io mirror) and stores it as
 * an estimated market value on each wine.
 *
 * Requires a Supabase bearer token; only the caller's own wines are touched.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_WINES = 200;

export const Route = createFileRoute("/api/public/hooks/refresh-cellar-values")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return Response.json({ error: "Server not configured" }, { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: claims, error: claimsError } = await authClient.auth.getClaims(
          auth.slice("Bearer ".length),
        );
        const userId = claims?.claims?.sub as string | undefined;
        if (claimsError || !userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("wines")
          .select("id,producer,wine_name,vintage,systembolaget_id")
          .eq("user_id", userId)
          .is("consumed_at", null)
          .order("created_at", { ascending: false })
          .limit(MAX_WINES);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        let updated = 0;
        let missing = 0;
        const failures: Array<{ id: string; message: string }> = [];

        for (const row of rows ?? []) {
          try {
            const query = [row.producer, row.wine_name].filter(Boolean).join(" ").trim();
            if (!query && !row.systembolaget_id) {
              missing += 1;
              continue;
            }
            const hit = await fetchPrice({
              query: row.vintage ? `${query} ${row.vintage}` : query,
              fallbackQuery: query,
              systembolagetId: row.systembolaget_id,
            });
            if (!hit) {
              missing += 1;
              continue;
            }
            const { error: updateError } = await supabaseAdmin
              .from("wines")
              .update({
                market_price: hit.price,
                market_price_currency: "SEK",
                market_price_source: "systembolaget",
                market_price_checked_at: new Date().toISOString(),
                systembolaget_id: hit.productNumber ?? row.systembolaget_id ?? null,
                systembolaget_url: hit.url ?? null,
              } as never)
              .eq("id", row.id)
              .eq("user_id", userId);
            if (updateError) failures.push({ id: row.id, message: updateError.message });
            else updated += 1;
          } catch (e) {
            failures.push({ id: row.id, message: e instanceof Error ? e.message : "Unknown error" });
          }
        }

        return Response.json({
          ok: failures.length === 0,
          total: rows?.length ?? 0,
          updated,
          missing,
          failed: failures.length,
        });
      },
    },
  },
});

type PriceHit = { price: number; productNumber?: string; url?: string };

async function fetchPrice(args: {
  query: string;
  fallbackQuery?: string;
  systembolagetId?: string | null;
}): Promise<PriceHit | null> {
  const base = "https://api.bolaget.io/v1";

  const urls: string[] = [];
  if (args.systembolagetId) {
    urls.push(`${base}/products/${encodeURIComponent(args.systembolagetId)}`);
  }
  if (args.query) urls.push(`${base}/products?query=${encodeURIComponent(args.query)}&limit=1`);
  if (args.fallbackQuery && args.fallbackQuery !== args.query) {
    urls.push(`${base}/products?query=${encodeURIComponent(args.fallbackQuery)}&limit=1`);
  }

  for (const url of urls) {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) continue;
    const json = (await res.json()) as unknown;
    const product = Array.isArray(json)
      ? (json[0] as Record<string, unknown> | undefined)
      : (json as Record<string, unknown> | undefined);
    if (!product) continue;

    const price = Number(
      (product.price as number | undefined) ??
        (product.priceInclVat as number | undefined) ??
        (product.salesPrice as number | undefined),
    );
    if (!Number.isFinite(price) || price <= 0) continue;

    const productNumber =
      (product.productNumber as string | undefined) ??
      (product.productId as string | undefined) ??
      (product.nr as string | undefined);

    return {
      price,
      productNumber,
      url: productNumber
        ? `https://www.systembolaget.se/produkt/vin/${productNumber}`
        : undefined,
    };
  }
  return null;
}
