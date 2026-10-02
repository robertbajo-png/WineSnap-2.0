import { supabase } from "@/integrations/supabase/client";

export async function downloadWineImage(path: string, signal: AbortSignal) {
  const { data, error } = await supabase.storage
    .from("wine-labels")
    .download(path, { cacheNonce: crypto.randomUUID() }, { cache: "no-store", signal });
  if (error || !data || signal.aborted) return null;
  const url = URL.createObjectURL(data);
  return { url, release: () => URL.revokeObjectURL(url) };
}
