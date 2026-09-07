import { supabase } from "@/integrations/supabase/client";
import { getWineLabelPath } from "@/lib/wineImages";

const BUCKET = "wine-labels";
export async function createWineLabelUrl(value: string | null | undefined, signal?: AbortSignal) {
  if (!value) return null;
  const path = getWineLabelPath(value);
  if (!path) return { url: value, release: () => {} };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path, {}, { cache: "no-store", signal });
  if (error || signal?.aborted) return null;
  const url = URL.createObjectURL(data);
  return { url, release: () => URL.revokeObjectURL(url) };
}
