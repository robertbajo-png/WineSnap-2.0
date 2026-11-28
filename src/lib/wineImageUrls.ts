import { supabase } from "@/integrations/supabase/client";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxImageBytes = 10 * 1024 * 1024;

export async function downloadWineImage(path: string, signal: AbortSignal) {
  if (signal.aborted) return null;
  let result: { data: unknown; error: unknown };
  if (import.meta.env.VITE_WINE_IMAGE_PROXY_ENABLED === "true") {
    const { data: auth, error } = await supabase.auth.getSession();
    if (error || signal.aborted) return null;
    // FunctionsClient decodes image/* responses as text; preserve the binary body.
    const response = await fetch(
      import.meta.env.VITE_OWNED_BACKEND_ENABLED === "true"
        ? new URL("/api/wine-image", window.location.origin)
        : new URL("/functions/v1/wine-image", import.meta.env.VITE_SUPABASE_URL),
      {
        method: "POST",
        body: JSON.stringify({ path }),
        signal,
        cache: "no-store",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(auth.session ? { Authorization: `Bearer ${auth.session.access_token}` } : {}),
        },
      },
    );
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (
      !response.ok ||
      !type ||
      !imageTypes.has(type) ||
      Number(response.headers.get("content-length")) > maxImageBytes
    ) {
      await response.body?.cancel();
      return null;
    }
    const data = await response.blob();
    result = { data: data.size > 0 && data.size <= maxImageBytes ? data : null, error: null };
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
