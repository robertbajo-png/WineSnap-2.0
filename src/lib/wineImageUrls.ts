import { supabase } from "@/integrations/supabase/client";

export async function downloadWineImage(path: string, signal: AbortSignal) {
  if (signal.aborted) return null;
  let result: { data: unknown; error: unknown };
  if (import.meta.env.VITE_WINE_IMAGE_PROXY_ENABLED === "true") {
    const { data: auth, error } = await supabase.auth.getSession();
    if (error || signal.aborted) return null;
    result = await supabase.functions.invoke("wine-image", {
      body: { path },
      signal,
      // An anonymous share must not send the publishable key as a user JWT.
      headers: { Authorization: auth.session ? `Bearer ${auth.session.access_token}` : "" },
    });
  } else {
    result = await supabase.storage
      .from("wine-labels")
      .download(path, { cacheNonce: crypto.randomUUID() }, { cache: "no-store", signal });
  }
  const { data, error } = result;
  if (error || !(data instanceof Blob) || signal.aborted) return null;
  const url = URL.createObjectURL(data);
  return { url, release: () => URL.revokeObjectURL(url) };
}
