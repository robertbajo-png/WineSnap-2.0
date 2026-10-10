import { lookupRetailCandidates } from "./retailCatalog.server";
import type { WishlistPriceRow } from "./wishlistPrices.server";

export const wishlistPriceDependencies = {
  secret: () => process.env.CRON_SECRET,
  async authenticate(request: Request) {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Server not configured");
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(auth.slice(7));
    return error ? null : ((data?.claims?.sub as string | undefined) ?? null);
  },
  async load(userId: string | null, ids?: string[]): Promise<WishlistPriceRow[]> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin.from("wishlist").select("*");
    if (userId && ids) query = query.eq("user_id", userId).in("id", ids);
    else query = query.eq("notify_on_drop", true).not("target_price", "is", null);
    const { data, error } = await query
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(userId ? 3 : 2000);
    if (error) throw error;
    return (data ?? []) as unknown as WishlistPriceRow[];
  },
  lookup: lookupRetailCandidates,
  async save(row: WishlistPriceRow, patch: Record<string, unknown>) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("wishlist")
      .update(patch as never)
      .eq("id", row.id)
      .eq("user_id", row.user_id)
      .eq("notify_on_drop", row.notify_on_drop);
    // Overlapping jobs must not duplicate alerts or overwrite newer quotes.
    query = row.last_checked_at
      ? query.eq("last_checked_at", row.last_checked_at)
      : query.is("last_checked_at", null);
    query = row.price_alert_triggered_at
      ? query.eq("price_alert_triggered_at", row.price_alert_triggered_at)
      : query.is("price_alert_triggered_at", null);
    query =
      row.target_price === null
        ? query.is("target_price", null)
        : query.eq("target_price", row.target_price);
    query =
      row.bottle_ml === null
        ? query.is("bottle_ml", null)
        : query.filter("bottle_ml", "eq", row.bottle_ml);
    query = query.eq("wine_name", row.wine_name);
    query =
      row.price_currency === null
        ? query.is("price_currency", null)
        : query.eq("price_currency", row.price_currency);
    query = row.producer === null ? query.is("producer", null) : query.eq("producer", row.producer);
    query = row.vintage === null ? query.is("vintage", null) : query.eq("vintage", row.vintage);
    const { data, error } = await query.select("id");
    if (error) throw error;
    return data?.length === 1;
  },
};
