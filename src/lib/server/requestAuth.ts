import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function requireRequestUser(request: Request, rateLimitBucket?: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Response("Server authentication is not configured", { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response("Authentication required", { status: 401 });
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Response("Authentication required", { status: 401 });

  const supabase = createClient<Database>(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Response("Invalid authentication token", { status: 401 });

  if (rateLimitBucket) {
    const { data: allowed, error: rateLimitError } = await supabase.rpc("consume_api_rate_limit", {
      _bucket: rateLimitBucket,
    });
    if (rateLimitError) throw new Response("Rate-limit check failed", { status: 500 });
    if (!allowed) throw new Response("Too many requests", { status: 429 });
  }

  return { supabase, user: data.user };
}

export function routeError(error: unknown) {
  if (error instanceof Response) return error;
  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

export async function readBoundedJson(request: Request, maxBytes: number) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Response("Request body is too large", { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new Response("Request body is too large", { status: 413 });
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Response("Invalid JSON body", { status: 400 });
  }
}
