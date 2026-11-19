import { supabase } from "@/integrations/supabase/client";
import {
  accountWriteClient,
  readSessionWithDeadline,
  type AccountWriteScope,
} from "./accountWriteScope";

export type LocalAiFunction =
  | "analyze-wine"
  | "ask-winesnap"
  | "taste-suggestions"
  | "wine-suggestions"
  | "restaurant-match"
  | "extract-preference-signals";

export async function invokeAi(
  name: LocalAiFunction,
  body: Record<string, unknown>,
  options?: { scope: AccountWriteScope; signal: AbortSignal },
) {
  let captured: Awaited<ReturnType<typeof accountWriteClient>> | undefined;
  if (options) {
    if (options.signal.aborted || !options.scope.current())
      return { data: null, error: { context: new Response(null, { status: 401 }) } };
    try {
      captured = await accountWriteClient(options.scope, 75000, options.signal);
    } catch {
      return { data: null, error: { context: new Response(null, { status: 401 }) } };
    }
    if (options.signal.aborted || !options.scope.current())
      return { data: null, error: { context: new Response(null, { status: 401 }) } };
  }
  if (import.meta.env.VITE_LOCAL_AI_ENABLED !== "true") {
    return (captured ?? supabase).functions.invoke(name, {
      body,
      ...(options ? { signal: options.signal } : {}),
    });
  }
  try {
    const {
      data: { session },
      error,
    } = await readSessionWithDeadline(options?.signal);
    if (error || !session)
      return { data: null, error: { context: new Response(null, { status: 401 }) } };
    if (
      options &&
      (options.signal.aborted ||
        !options.scope.current() ||
        session.user.id !== options.scope.owner)
    )
      return { data: null, error: { context: new Response(null, { status: 401 }) } };
    const response = await fetch(`/api/ai/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: options
        ? AbortSignal.any([options.signal, AbortSignal.timeout(75_000)])
        : AbortSignal.timeout(75_000),
    });
    if (!response.ok) return { data: null, error: { context: response } };
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { context: new Response(null, { status: 503 }) } };
  }
}
