import { createClient } from "npm:@supabase/supabase-js@2.105.1";

type AiAccessOptions = {
  functionName: string;
  limit: number;
  windowSeconds?: number;
  corsHeaders: Record<string, string>;
};

type QuotaRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...extraHeaders, "Content-Type": "application/json" },
  });
}

export async function requireAiAccess(req: Request, options: AiAccessOptions) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401, options.corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("AI security environment is incomplete");
    return json({ error: "Server configuration error" }, 500, options.corsHeaders);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return json({ error: "Unauthorized" }, 401, options.corsHeaders);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const windowSeconds = options.windowSeconds ?? 300;
  const { data, error } = await admin.rpc("consume_ai_quota", {
    _user_id: authData.user.id,
    _function_name: options.functionName,
    _limit: options.limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("AI quota check failed", options.functionName, error.message);
    return json({ error: "Server configuration error" }, 500, options.corsHeaders);
  }

  const quota = (data?.[0] ?? null) as QuotaRow | null;
  if (!quota?.allowed) {
    const resetMs = quota?.reset_at ? new Date(quota.reset_at).getTime() - Date.now() : 1000;
    const retryAfter = String(Math.max(1, Math.ceil(resetMs / 1000)));
    return json(
      { error: "Too many requests, please try again shortly.", retryAfter: Number(retryAfter) },
      429,
      options.corsHeaders,
      { "Retry-After": retryAfter },
    );
  }

  return { userId: authData.user.id, remaining: quota.remaining };
}
