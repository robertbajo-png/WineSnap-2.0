import { lstat, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createAiAccessGuard } from "../../supabase/functions/_shared/aiAccess";
import { createLabelReader } from "../../supabase/functions/analyze-wine/handler";

export const localAiProject = "pzniyupmgwvlldvztzqh";
const origin = `https://${localAiProject}.supabase.co`;
const directory = "/tmp/winesnap-ai";
const credentialFile = `${directory}/credentials.json`;
const credentialsSchema = z
  .object({
    version: z.literal(1),
    project: z.literal(localAiProject),
    publishable: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
    secret: z.string().regex(/^sb_secret_[A-Za-z0-9_-]+$/),
    openai: z.string().regex(/^sk-[A-Za-z0-9_-]{20,4093}$/),
  })
  .strict();
const inputSchema = z
  .object({
    text: z.string().trim().min(3).max(12_000).optional(),
    imageBase64: z
      .string()
      .min(4)
      .max(18_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .optional(),
    mimeType: z
      .enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
      .optional(),
    language: z.enum(["sv", "en"]).optional(),
  })
  .strict()
  .refine((input) => input.text || input.imageBase64);
const cacheHeaders = { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" };

async function loadCredentials() {
  for (const path of [directory, credentialFile]) {
    const stat = await lstat(path);
    if (
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      (path === credentialFile && (!stat.isFile() || stat.size > 16_384)) ||
      (path === directory && !stat.isDirectory())
    )
      throw new Error("Private AI storage required");
  }
  return credentialsSchema.parse(JSON.parse(await readFile(credentialFile, "utf8")));
}

async function readInput(request: Request) {
  const limit = 18_100_000;
  if (Number(request.headers.get("content-length")) > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

// This adapter is opt-in and test-only. It does not enable unrelated admin routes.
export async function handleLocalLabelReading(request: Request) {
  const json = (error: string, status: number) =>
    Response.json({ error }, { status, headers: cacheHeaders });
  if (process.env.WINESNAP_LOCAL_AI_ENABLED !== "true" || process.env.SUPABASE_URL !== origin)
    return json("Local AI is not enabled", 503);
  if (request.method !== "POST") return json("Method not allowed", 405);
  if (!/^Bearer \S+$/.test(request.headers.get("authorization") ?? ""))
    return json("Unauthorized", 401);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    return json("JSON required", 415);
  try {
    const keys = await loadCredentials();
    const input = await readInput(request);
    if (!input?.success) return json("Invalid or oversized wine input", 400);
    const environment: Record<string, string> = {
      SUPABASE_URL: origin,
      SUPABASE_ANON_KEY: keys.publishable,
      SUPABASE_SERVICE_ROLE_KEY: keys.secret,
      OPENAI_API_KEY: keys.openai,
      OPENAI_LABEL_MODEL: "gpt-6.1-sol",
    };
    const env = (name: string) => environment[name];
    const guardedFetch: typeof fetch = (url, init) =>
      fetch(url, {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    const access = createAiAccessGuard(env, (url, key, options) =>
      createClient(url, key, {
        ...options,
        global: { fetch: guardedFetch },
      }),
    );
    const response = await createLabelReader({ env, requireAccess: access })(
      new Request(request.url, {
        method: "POST",
        headers: { authorization: request.headers.get("authorization")! },
        body: JSON.stringify(input.data),
      }),
    );
    const headers = new Headers(response.headers);
    headers.delete("access-control-allow-origin");
    headers.delete("access-control-allow-headers");
    for (const [name, value] of Object.entries(cacheHeaders)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return json("Local AI is unavailable", 503);
  }
}
