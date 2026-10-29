import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiAccessOptions } from "./aiAccess.ts";

// Runtime dependencies are injected; the shared handlers never read process globals.
export type AiRuntime = {
  env: (name: string) => string | undefined;
  createClient: (
    url: string,
    key: string,
    options: {
      auth: { persistSession: false; autoRefreshToken: false };
    },
  ) => SupabaseClient;
  requireAccess: (
    req: Request,
    options: AiAccessOptions,
  ) => Promise<Response | { userId: string; remaining?: number }>;
};
