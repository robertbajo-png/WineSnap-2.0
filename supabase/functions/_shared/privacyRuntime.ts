import { createClient } from "npm:@supabase/supabase-js@2.105.1";
export { runAccountErasure } from "./privacyErasure.ts";

export function privacyAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("configuration_error");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
