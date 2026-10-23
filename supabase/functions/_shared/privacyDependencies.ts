import type { SupabaseClient } from "@supabase/supabase-js";
export type PrivacyDependencies = {
  env: (name: string) => string | undefined;
  admin: () => SupabaseClient;
  erase: (admin: SupabaseClient, userId: string) => Promise<{ complete: boolean }>;
};
