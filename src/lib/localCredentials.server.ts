import { lstat, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

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
    cronSecret: z.string().min(32).max(128).optional(),
    privacyCronSecret: z.string().min(32).max(128).optional(),
    gemini: z
      .string()
      .regex(/^[A-Za-z0-9_-]{20,4096}$/)
      .optional(),
  })
  .strict();

export const localOperationsEnabled = () =>
  process.env.WINESNAP_LOCAL_OPERATIONS_ENABLED === "true" &&
  process.env.WINESNAP_LOCAL_AI_ENABLED === "true" &&
  process.env.SUPABASE_URL === origin;

export async function loadCredentials() {
  if (process.env.WINESNAP_LOCAL_AI_ENABLED !== "true" || process.env.SUPABASE_URL !== origin)
    throw new Error("Only the approved local test runtime is allowed");
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

// No inherited admin key can override the pinned local destination.
export async function operationsCredentials() {
  if (!localOperationsEnabled()) throw new Error("Local operations disabled");
  const keys = await loadCredentials();
  if (!keys.cronSecret || !keys.privacyCronSecret)
    throw new Error("Local operations not provisioned");
  return keys;
}

export const localBackendFetch: typeof fetch = (url, init) => {
  if (new URL(url instanceof Request ? url.url : String(url)).origin !== origin)
    throw new Error("Unexpected local backend destination");
  return fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
};

export async function getOperationsAdmin() {
  if (process.env.WINESNAP_LOCAL_OPERATIONS_ENABLED === "true") {
    const keys = await operationsCredentials();
    return createClient(origin, keys.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: localBackendFetch },
    });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
