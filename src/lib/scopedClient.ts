import { createClient } from "@supabase/supabase-js";
import { ownedBrowserApiUrl } from "./ownedHosting";

export function scopedClient(token: string, requestTimeoutMs?: number) {
  if (
    requestTimeoutMs !== undefined &&
    (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 75000)
  )
    throw new Error("Invalid account request deadline");
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
      ...(requestTimeoutMs
        ? {
            global: {
              fetch: (input: RequestInfo | URL, init?: RequestInit) =>
                fetch(input, {
                  ...init,
                  redirect: "error",
                  cache: "no-store",
                  signal: init?.signal
                    ? AbortSignal.any([init.signal, AbortSignal.timeout(requestTimeoutMs)])
                    : AbortSignal.timeout(requestTimeoutMs),
                }),
            },
          }
        : {}),
    },
  );
}
