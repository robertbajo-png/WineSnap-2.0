import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { createWineImageHandler, readWineImage, wineImageError } from "./handler.ts";

Deno.serve(async (req) => {
  if (Deno.env.get("WINE_IMAGE_PROXY_ENABLED") !== "true") return wineImageError(503);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return wineImageError(503);
  try {
    const origin = new URL(url);
    if (
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/" ||
      (origin.protocol !== "https:" &&
        !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
    ) {
      return wineImageError(503);
    }
    const admin = createClient(origin.origin, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(20000), redirect: "error" }),
      },
    });
    return await createWineImageHandler({
      authenticate: async (token) => {
        const { data, error } = await admin.auth.getUser(token);
        return error ? null : data.user;
      },
      active: async (userId) => {
        const { data, error } = await admin.rpc("privacy_account_active", { _user_id: userId });
        if (error) throw new Error("privacy_error");
        return data === true;
      },
      shared: async (path) => {
        const { data, error } = await admin.rpc("is_public_wine_photo", { _storage_path: path });
        if (error) throw new Error("sharing_error");
        return data === true;
      },
      download: async (path, signal) => {
        const target = new URL(
          `/storage/v1/object/wine-labels/${path.split("/").map(encodeURIComponent).join("/")}`,
          origin,
        );
        target.searchParams.set("cacheNonce", crypto.randomUUID());
        return readWineImage(
          await fetch(target, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
          }),
        );
      },
    })(req);
  } catch {
    return wineImageError(503);
  }
});
