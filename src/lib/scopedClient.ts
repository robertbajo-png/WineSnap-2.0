import { createClient } from "@supabase/supabase-js";
import { ownedBrowserApiUrl } from "./ownedHosting";

export function scopedClient(token: string) {
  return createClient(
    ownedBrowserApiUrl(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_OWNED_BACKEND_ENABLED,
      import.meta.env.VITE_OWNED_PUBLIC_ORIGIN,
      typeof window === "undefined" ? undefined : window.location.origin,
    )!,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => token,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
