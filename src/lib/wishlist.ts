import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logEvent } from "@/lib/analytics";

type WineLike = {
  id?: string | null;
  producer?: string | null;
  wine_name?: string | null;
  vintage?: number | string | null;
  region?: string | null;
  country?: string | null;
  wine_type?: string | null;
  grape_varieties?: string[] | null;
  image_url?: string | null;
  description?: string | null;
  price_range?: string | null;
  target_price?: number | null;
  ai_data?: Record<string, unknown> | null;
  source?: "manual" | "cellar" | "ai" | "restaurant" | "social";
};

const pendingSaves = new Map<string, Promise<boolean>>();

function normalizeVintage(vintage: WineLike["vintage"]): number | null {
  return typeof vintage === "string" ? Number.parseInt(vintage, 10) || null : (vintage ?? null);
}

/**
 * Insert a wine into the user's wishlist. If a wine_id is provided and already
 * exists in the wishlist, the row is left as-is. AI suggestions are checked by
 * producer, name and vintage. Concurrent calls in this client share one request.
 */
export async function addToWishlist(input: WineLike): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    toast.error("Sign in to save to wishlist");
    return false;
  }
  const key = JSON.stringify([
    user.id,
    input.id ?? null,
    input.producer ?? null,
    input.wine_name ?? "Untitled",
    normalizeVintage(input.vintage),
  ]);
  const pending = pendingSaves.get(key);
  if (pending) {
    await pending;
    return false;
  }
  const request = insertWishlistWine(input, user.id);
  pendingSaves.set(key, request);
  try {
    return await request;
  } finally {
    pendingSaves.delete(key);
  }
}

async function insertWishlistWine(input: WineLike, userId: string): Promise<boolean> {
  const vintage = normalizeVintage(input.vintage);

  const row = {
    user_id: userId,
    wine_id: input.id ?? null,
    producer: input.producer ?? null,
    wine_name: input.wine_name ?? "Untitled",
    vintage,
    region: input.region ?? null,
    country: input.country ?? null,
    grape_varieties: input.grape_varieties ?? null,
    wine_type: input.wine_type ?? null,
    image_url: input.image_url ?? null,
    description: input.description ?? null,
    target_price: input.target_price ?? null,
    source: input.source ?? "manual",
    ai_data: (input.ai_data ?? null) as never,
  };

  if (!row.wine_id) {
    let query = supabase
      .from("wishlist")
      .select("id")
      .eq("user_id", userId)
      .eq("wine_name", row.wine_name)
      .limit(1);
    query = row.producer === null ? query.is("producer", null) : query.eq("producer", row.producer);
    query = row.vintage === null ? query.is("vintage", null) : query.eq("vintage", row.vintage);
    const { data: existing, error: lookupError } = await query;
    if (lookupError) {
      toast.error("Could not check your wishlist. Please try again.");
      return false;
    }
    if (existing?.length) {
      toast.info("Already in your wishlist");
      return false;
    }
  }

  const { data: inserted, error } = await supabase
    .from("wishlist")
    .insert(row as never)
    .select("id")
    .single();
  if (error) {
    // Unique violation on (user_id, wine_id) → already saved
    if ((error as { code?: string }).code === "23505") {
      toast.info("Already in your wishlist");
      return false;
    }
    console.error(error);
    toast.error(error.message);
    return false;
  }
  toast.success("Added to wishlist");
  logEvent("wishlist_added", { source: row.source, wine_id: row.wine_id });

  // Fire-and-forget: try to auto-match to a Systembolaget product so price
  // monitoring works immediately without the user pasting a product ID.
  const wishlistId = (inserted as { id?: string } | null)?.id;
  if (wishlistId) {
    void matchAndAttachSystembolaget(wishlistId, {
      producer: row.producer,
      wine_name: row.wine_name,
      vintage: row.vintage,
      region: row.region,
      country: row.country,
      wine_type: row.wine_type,
    });
  }
  return true;
}

async function matchAndAttachSystembolaget(
  wishlistId: string,
  input: {
    producer: string | null;
    wine_name: string;
    vintage: number | null;
    region: string | null;
    country: string | null;
    wine_type: string | null;
  },
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/public/hooks/match-systembolaget", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (!res.ok) return;

    const data = (await res.json()) as {
      match: {
        systembolaget_id: string;
        url: string;
        price: number;
      } | null;
    };
    if (!data.match) return;

    await supabase
      .from("wishlist")
      .update({
        systembolaget_id: data.match.systembolaget_id,
        systembolaget_url: data.match.url,
        last_checked_price: data.match.price,
        last_checked_at: new Date().toISOString(),
        price_source: "systembolaget",
      } as never)
      .eq("id", wishlistId);
    logEvent("wishlist_systembolaget_matched", {
      wishlist_id: wishlistId,
      sb_id: data.match.systembolaget_id,
    });
  } catch (e) {
    console.error("[wishlist] auto-match failed", e);
  }
}
