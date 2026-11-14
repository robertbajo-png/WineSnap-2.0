import {
  createWineImageHandler,
  wineImageError,
} from "../../supabase/functions/wine-image/handler";
import { approvedLocalBackend, ownedBackendOrigin } from "./backendScope";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOperationsAdmin, localOperationsEnabled } from "./localCredentials.server";

export async function handleOwnedWineImage(request: Request) {
  if (approvedLocalBackend(process.env) !== ownedBackendOrigin || !localOperationsEnabled())
    return wineImageError(404);
  try {
    const admin = (await getOperationsAdmin()) as unknown as SupabaseClient;
    const handler = createWineImageHandler({
      authenticate: async (token) => {
        const { data, error } = await admin.auth.getUser(token);
        return error ? null : data.user;
      },
      active: async (id) => {
        const { data, error } = await admin.rpc("privacy_account_active", { _user_id: id });
        if (error) throw error;
        return data === true;
      },
      shared: async (path) => {
        const { data, error } = await admin.rpc("is_public_wine_photo", { _storage_path: path });
        if (error) throw error;
        return data === true;
      },
      download: async (path) => {
        const { data, error } = await admin.storage.from("wine-labels").download(path);
        if (error) throw error;
        return data;
      },
    });
    const response = await handler(request);
    const headers = new Headers(response.headers);
    headers.delete("access-control-allow-origin");
    headers.delete("access-control-allow-headers");
    headers.delete("access-control-allow-methods");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return wineImageError(503);
  }
}
