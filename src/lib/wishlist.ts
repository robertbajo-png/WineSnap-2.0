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
  source?: "manual" | "cellar" | "ai" | "restaurant";
};

/**
 * Insert a wine into the user's wishlist. If a wine_id is provided and already
 * exists in the wishlist, the row is left as-is (idempotent).
 */
export async function addToWishlist(input: WineLike): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    toast.error("Sign in to save to wishlist");
    return false;
  }
  const vintage =
    typeof input.vintage === "string" ? (Number.parseInt(input.vintage, 10) || null) : input.vintage ?? null;

  const row = {
    user_id: user.id,
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

  const { error } = await supabase.from("wishlist").insert(row as never);
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
  return true;
}
