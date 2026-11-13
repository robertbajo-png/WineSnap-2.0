import { supabase } from "@/integrations/supabase/client";
import { scopedClient } from "./scopedClient";

export type AccountWriteScope = { owner: string; current: () => boolean };

async function bounded<T>(request: () => Promise<T>, milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("account_scope_changed");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const interrupted = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("account_verification_timeout")), milliseconds);
      abort = () => reject(new Error("account_scope_changed"));
      signal?.addEventListener("abort", abort, { once: true });
    });
    return await Promise.race([
      Promise.resolve().then(() => {
        if (signal?.aborted) throw new Error("account_scope_changed");
        return request();
      }),
      interrupted,
    ]);
  } finally {
    clearTimeout(timeout);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

// A bounded cached-session read, not server verification or write authorization.
export function readSessionWithDeadline(signal?: AbortSignal) {
  return bounded(() => supabase.auth.getSession(), 15000, signal);
}

export async function accountAccessToken(
  scope: AccountWriteScope,
  requestTimeoutMs = 15000,
  signal?: AbortSignal,
) {
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 75000)
    throw new Error("Invalid account request deadline");
  if (!scope.current()) throw new Error("account_scope_changed");
  const { data, error } = await bounded(() => supabase.auth.getSession(), requestTimeoutMs, signal);
  if (error || data.session?.user.id !== scope.owner) throw new Error("account_unavailable");
  if (!scope.current()) throw new Error("account_scope_changed");
  const token = data.session.access_token;
  const verified = await bounded(() => supabase.auth.getUser(token), requestTimeoutMs, signal);
  if (
    verified.error ||
    verified.data.user?.id !== scope.owner ||
    !scope.current() ||
    signal?.aborted
  )
    throw new Error("account_unavailable");
  return token;
}

export async function accountWriteClient(
  scope: AccountWriteScope,
  requestTimeoutMs = 15000,
  signal?: AbortSignal,
) {
  const token = await accountAccessToken(scope, requestTimeoutMs, signal);
  if (!scope.current() || signal?.aborted) throw new Error("account_scope_changed");
  return scopedClient(token, requestTimeoutMs) as unknown as typeof supabase;
}
