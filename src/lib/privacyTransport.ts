import { supabase } from "@/integrations/supabase/client";

export async function invokePrivacy(
  name: "privacy-controls" | "privacy-export",
  body: Record<string, unknown> = {},
  token?: string,
) {
  if (import.meta.env.VITE_LOCAL_AI_ENABLED !== "true")
    return supabase.functions.invoke(name, {
      body,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
  const session = token ? null : await supabase.auth.getSession();
  const jwt = token ?? session?.data.session?.access_token;
  if (!jwt) return { data: null, error: { context: new Response(null, { status: 401 }) } };
  try {
    const response = await fetch(`/api/privacy/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) return { data: null, error: { context: response } };
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { context: new Response(null, { status: 503 }) } };
  }
}
