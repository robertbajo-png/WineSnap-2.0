import { lstat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import { z } from "zod";
import { approvedLocalBackend, ownedBackendOrigin, ownedBackendProject } from "./backendScope";
import {
  getOperationsAdmin,
  loadCredentials,
  localBackendFetch,
  localOperationsEnabled,
} from "./localCredentials.server";

export const deviceAccessOrigin = "https://winesnap.boleoai.se";
const bindingSchema = z
  .object({
    version: z.literal(1),
    project: z.literal(ownedBackendProject),
    hostname: z.literal("winesnap.boleoai.se"),
    enabled: z.boolean(),
    ownerId: z.uuid().nullable(),
  })
  .strict();
type Binding = z.infer<typeof bindingSchema>;
type GateState = { username?: string; authentication_level?: number };
type Dependencies = {
  enabled(): boolean;
  binding(): Promise<Binding | null>;
  gateState(cookie: string): Promise<GateState | null>;
  openSession(ownerId: string): Promise<Session | null>;
};
const reply = (status: number, body: object) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      Vary: "Cookie, Origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });

function gateCookie(header: string | null) {
  if (!header || header.length > 16384) return null;
  const values = header
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith("__Secure-winesnap_gate="));
  if (values.length !== 1 || !/^[\x21-\x3A\x3C-\x7E]+$/.test(values[0])) return null;
  return values[0];
}

async function emptyIntent(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return false;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return !!body && typeof body === "object" && !Array.isArray(body) && !Object.keys(body).length;
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export function createOwnedDeviceSessionHandler(deps: Dependencies) {
  const attempts = new Map<string, { until: number; count: number }>();
  return async (request: Request) => {
    if (!deps.enabled()) return reply(404, { error: "not_available" });
    if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
    const url = new URL(request.url);
    if (
      url.hostname !== "winesnap.boleoai.se" ||
      request.headers.get("origin") !== deviceAccessOrigin ||
      request.headers.get("x-winesnap-device") !== "sign-in" ||
      request.headers.get("content-type") !== "application/json"
    )
      return reply(403, { error: "not_authorized" });
    try {
      if (!(await emptyIntent(request))) return reply(400, { error: "invalid_request" });
      const savedBinding = await deps.binding();
      if (!savedBinding) return reply(404, { error: "not_available" });
      const binding = bindingSchema.parse(savedBinding);
      if (!binding.enabled || !binding.ownerId) return reply(404, { error: "not_available" });
      const cookie = gateCookie(request.headers.get("cookie"));
      if (!cookie) return reply(403, { error: "not_authorized" });
      // Never trust client-supplied identity headers. Ask the installed session engine.
      const state = await deps.gateState(cookie);
      if (state?.username !== "robert" || ![1, 2].includes(state.authentication_level ?? 0))
        return reply(403, { error: "not_authorized" });
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      const fingerprint = createHash("sha256").update(cookie).digest("hex");
      const attempt = attempts.get(fingerprint) ?? { until: now + 60000, count: 0 };
      if (attempt.count >= 8 || (!attempts.has(fingerprint) && attempts.size >= 256))
        return reply(429, { error: "try_again_later" });
      attempt.count++;
      attempts.set(fingerprint, attempt);
      const session = await deps.openSession(binding.ownerId);
      if (!session || session.user.id !== binding.ownerId || session.user.role !== "authenticated")
        return reply(403, { error: "not_authorized" });
      return reply(200, { session });
    } catch {
      return reply(503, { error: "device_sign_in_unavailable" });
    }
  };
}

const enabled = () =>
  process.env.WINESNAP_OWNED_BACKEND_ENABLED === "true" &&
  approvedLocalBackend(process.env) === ownedBackendOrigin &&
  localOperationsEnabled();

async function binding() {
  const path = "/tmp/winesnap-ai/device-access.json";
  try {
    for (const name of ["/tmp/winesnap-ai", path]) {
      const stat = await lstat(name);
      if (
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        stat.mode & 0o077 ||
        (name === path && (!stat.isFile() || stat.size > 4096))
      )
        throw new Error("Private device binding required");
    }
    return bindingSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

async function gateState(cookie: string) {
  const response = await fetch("http://winesnap-owned-internet:8080/gate/api/state", {
    headers: { Host: "winesnap.boleoai.se", Origin: deviceAccessOrigin, Cookie: cookie },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const result = await response.json();
  return result.status === "OK" ? (result.data as GateState) : null;
}

async function openSession(ownerId: string) {
  const admin = await getOperationsAdmin();
  const found = await admin.auth.admin.getUserById(ownerId);
  const owner = found.data.user;
  if (
    found.error ||
    !owner ||
    owner.id !== ownerId ||
    !owner.email_confirmed_at ||
    !owner.email ||
    owner.is_anonymous
  )
    return null;
  const active = await admin.rpc("privacy_account_active", { _user_id: ownerId });
  if (active.error || active.data !== true) return null;
  // A recovery grant requires an existing account: unlike magiclink generation,
  // it cannot create an account during a concurrent deletion. No password changes.
  const grant = await admin.auth.admin.generateLink({
    type: "recovery",
    email: owner.email,
    options: { redirectTo: deviceAccessOrigin + "/" },
  });
  if (grant.error || grant.data.user?.id !== ownerId || !grant.data.properties?.hashed_token)
    return null;
  const credentials = await loadCredentials();
  const verifier = createClient(ownedBackendOrigin, credentials.publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: localBackendFetch },
  });
  const exchanged = await verifier.auth.verifyOtp({
    token_hash: grant.data.properties.hashed_token,
    type: "recovery",
  });
  return exchanged.error ? null : exchanged.data.session;
}

export const handleOwnedDeviceSession = createOwnedDeviceSessionHandler({
  enabled,
  binding,
  gateState,
  openSession,
});
