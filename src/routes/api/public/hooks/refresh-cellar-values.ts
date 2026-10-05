import { createFileRoute } from "@tanstack/react-router";
import { createRetailPriceHandler } from "@/lib/retailPriceService.server";
import { lookupRetailCandidates } from "@/lib/retailCatalog.server";
import type { RetailWine } from "@/lib/retailPrices";

const handler = createRetailPriceHandler({
  async authenticate(request) {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return null;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Server not configured");
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data, error } = await client.auth.getClaims(auth.slice("Bearer ".length));
    return error ? null : ((data?.claims?.sub as string | undefined) ?? null);
  },
  async load(userId, ids) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wines")
      .select(
        "id,producer,wine_name,vintage,country,bottle_ml,quantity,consumed_at,updated_at,systembolaget_id,market_price,market_price_currency,market_price_source,market_price_checked_at,retail_price_status,retail_price_attempted_at,retail_price_match,retail_price_candidates,purchase_price,purchase_currency",
      )
      .eq("user_id", userId)
      .in("id", ids)
      .is("consumed_at", null)
      .gt("quantity", 0);
    if (error) throw error;
    return (data ?? []) as unknown as RetailWine[];
  },
  lookup: lookupRetailCandidates,
  async save(userId, wine, patch) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Do not overwrite an edit, consumption or another quote made during lookup.
    const { data, error } = await supabaseAdmin
      .from("wines")
      .update(patch as never)
      .eq("user_id", userId)
      .eq("id", wine.id)
      .eq("updated_at", wine.updated_at)
      .is("consumed_at", null)
      .gt("quantity", 0)
      .select("id");
    if (error) throw error;
    return data?.length === 1;
  },
});

export const Route = createFileRoute("/api/public/hooks/refresh-cellar-values")({
  server: {
    handlers: {
      POST: ({ request }) => handler(request),
    },
  },
});
