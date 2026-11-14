import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type PublicWine = {
  id: string;
  image_url: string | null;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  grape_varieties: string[] | null;
  region: string | null;
  country: string | null;
  wine_type: string | null;
  description: string | null;
  fruit: number | null;
  tannin: number | null;
  acidity: number | null;
  oak: number | null;
  sweetness: number | null;
  body: number | null;
  primary_notes: string[] | null;
  secondary_notes: string[] | null;
  tertiary_notes: string[] | null;
  serving_temp: string | null;
  glass_type: string | null;
};

// This hosted view predates the generated source types; keep its read contract local.
type PublicViewDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: { public_wines: { Row: PublicWine & { share_id: string }; Relationships: [] } };
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

const columns =
  "id,image_url,producer,wine_name,vintage,grape_varieties,region,country,wine_type,description,fruit,tannin,acidity,oak,sweetness,body,primary_notes,secondary_notes,tertiary_notes,serving_temp,glass_type";

export async function loadPublicWine(shareId: string) {
  const publicClient = supabase as unknown as SupabaseClient<PublicViewDatabase>;
  const result = await publicClient
    .from("public_wines")
    .select(columns)
    .eq("share_id", shareId)
    .maybeSingle();
  const missingView =
    result.error &&
    ["PGRST205", "42P01"].includes(result.error.code) &&
    result.error.message.includes("public_wines");
  if (!missingView) return { data: result.data as PublicWine | null, error: result.error };

  // Source-only installations still expose public rows via the original RLS policy.
  const legacy = await supabase
    .from("wines")
    .select(columns)
    .eq("share_id", shareId)
    .eq("is_public", true)
    .maybeSingle();
  return { data: legacy.data as PublicWine | null, error: legacy.error };
}
