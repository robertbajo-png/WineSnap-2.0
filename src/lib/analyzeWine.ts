import { supabase } from "@/integrations/supabase/client";

export async function analyzeWine(body: Record<string, unknown>) {
  if (import.meta.env.VITE_LOCAL_AI_ENABLED !== "true") {
    return supabase.functions.invoke("analyze-wine", { body });
  }
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session)
    return { data: null, error: { context: new Response(null, { status: 401 }) } };
  try {
    const response = await fetch("/api/ai/analyze-wine", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(75_000),
    });
    if (!response.ok) return { data: null, error: { context: response } };
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { context: new Response(null, { status: 503 }) } };
  }
}
