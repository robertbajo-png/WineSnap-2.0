import { supabase } from "@/integrations/supabase/client";
import { scopedClient } from "./scopedClient";

export type AccountWriteScope = { owner: string; current: () => boolean };

async function bounded<T>(request: Promise<T>, milliseconds: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("account_verification_timeout")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function accountWriteClient(scope: AccountWriteScope, requestTimeoutMs = 15000) {
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 75000)
    throw new Error("Invalid account request deadline");
  if (!scope.current()) throw new Error("account_scope_changed");
  const { data, error } = await bounded(supabase.auth.getSession(), requestTimeoutMs);
  if (error || data.session?.user.id !== scope.owner) throw new Error("account_unavailable");
  if (!scope.current()) throw new Error("account_scope_changed");
  const token = data.session.access_token;
  const verified = await bounded(supabase.auth.getUser(token), requestTimeoutMs);
  if (verified.error || verified.data.user?.id !== scope.owner || !scope.current())
    throw new Error("account_unavailable");
  return scopedClient(token, requestTimeoutMs) as unknown as typeof supabase;
}
