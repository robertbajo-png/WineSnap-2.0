const DEFAULT_ALLOWED_ORIGINS = [
  "https://wine-scene-snap.lovable.app",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

function isAllowedOrigin(origin: string) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    DEFAULT_ALLOWED_ORIGINS.includes(origin) ||
    configured.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin)
  );
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export async function readJson(req: Request, maxBytes: number) {
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "Request body is too large");
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, "Request body is too large");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export async function enforceRateLimit(req: Request, bucket: string) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication required");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !anonKey) throw new HttpError(500, "Supabase environment is incomplete");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_api_rate_limit`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ _bucket: bucket }),
  });
  if (!response.ok)
    throw new HttpError(response.status === 401 ? 401 : 500, "Rate-limit check failed");
  if ((await response.json()) !== true)
    throw new HttpError(429, "Too many requests, please try again later");
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(req: Request, error: unknown) {
  if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
  if (error instanceof Error && error.name === "ZodError") {
    return json(req, { error: "Request validation failed" }, 400);
  }
  console.error(error);
  return json(req, { error: "Unexpected server error" }, 500);
}
