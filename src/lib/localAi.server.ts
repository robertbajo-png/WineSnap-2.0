import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createAiAccessGuard } from "../../supabase/functions/_shared/aiAccess";
import { createLabelReader } from "../../supabase/functions/analyze-wine/handler";
import { createHandler as createAsk } from "../../supabase/functions/ask-winesnap/handler";
import { createHandler as createTasteSuggestions } from "../../supabase/functions/taste-suggestions/handler";
import { createHandler as createWineSuggestions } from "../../supabase/functions/wine-suggestions/handler";
import { createHandler as createRestaurantMatch } from "../../supabase/functions/restaurant-match/handler";
import { createHandler as createPreferenceSignals } from "../../supabase/functions/extract-preference-signals/handler";
import type { LocalAiFunction } from "./aiTransport";

import { loadCredentials, localAiProject } from "./localCredentials.server";
export { localAiProject } from "./localCredentials.server";
const origin = `https://${localAiProject}.supabase.co`;
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
const language = z.enum(["sv", "en"]).optional();
const schemas = {
  "analyze-wine": inputSchema,
  "ask-winesnap": z
    .object({
      message: z.string().trim().min(1).max(2000),
      conversationId: z.string().uuid().nullable().optional(),
      language,
      context: z
        .object({
          source: z.enum(["ask", "wine", "recommendation", "cellar"]),
          route: z.string().max(160).startsWith("/"),
          wineId: z.string().uuid().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  "taste-suggestions": z.object({ language }).strict(),
  "wine-suggestions": z.object({ language, wineId: z.string().uuid() }).strict(),
  "restaurant-match": z
    .object({
      text: z.string().trim().max(30_000).optional(),
      image: z
        .string()
        .max(8_388_650)
        .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
        .optional(),
      constraints: z
        .object({
          source: z.enum(["text", "camera"]).optional(),
          dish: z.string().trim().max(160).optional(),
          maxPrice: z.number().positive().max(1_000_000).nullable().optional(),
          mode: z.enum(["familiar", "balanced", "adventurous"]).optional(),
        })
        .strict()
        .optional(),
      language,
    })
    .strict()
    .refine((input) => input.text || input.image),
  "extract-preference-signals": z.object({ tastingNoteId: z.string().uuid() }).strict(),
};

async function readInput(request: Request, name: LocalAiFunction) {
  const limit =
    name === "analyze-wine" ? 18_100_000 : name === "restaurant-match" ? 8_500_000 : 32_000;
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
    return schemas[name].safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

// This adapter is opt-in and test-only. It does not enable unrelated admin routes.
export async function handleLocalAi(request: Request, name: LocalAiFunction) {
  const json = (error: string, status: number) =>
    Response.json({ error }, { status, headers: cacheHeaders });
  if (process.env.WINESNAP_LOCAL_AI_ENABLED !== "true" || process.env.SUPABASE_URL !== origin)
    return json("Local AI is not enabled", 503);
  if (!Object.hasOwn(schemas, name)) return json("Unknown AI function", 404);
  if (request.method !== "POST") return json("Method not allowed", 405);
  if (!/^Bearer \S+$/.test(request.headers.get("authorization") ?? ""))
    return json("Unauthorized", 401);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    return json("JSON required", 415);
  try {
    const keys = await loadCredentials();
    const input = await readInput(request, name);
    if (!input?.success) return json("Invalid or oversized wine input", 400);
    const environment: Record<string, string> = {
      SUPABASE_URL: origin,
      SUPABASE_ANON_KEY: keys.publishable,
      SUPABASE_SERVICE_ROLE_KEY: keys.secret,
      OPENAI_API_KEY: keys.openai,
      OPENAI_LABEL_MODEL: "gpt-6.1-sol",
      GEMINI_FAST_MODEL: "gemini-3.8-flash",
      ...(keys.gemini ? { GEMINI_API_KEY: keys.gemini } : {}),
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
    const dependencies = {
      env,
      requireAccess: access,
      createClient: (
        url: string,
        key: string,
        options: { auth: { persistSession: false; autoRefreshToken: false } },
      ) => createClient(url, key, { ...options, global: { fetch: guardedFetch } }),
    };
    const handler = {
      "analyze-wine": createLabelReader,
      "ask-winesnap": createAsk,
      "taste-suggestions": createTasteSuggestions,
      "wine-suggestions": createWineSuggestions,
      "restaurant-match": createRestaurantMatch,
      "extract-preference-signals": createPreferenceSignals,
    }[name](dependencies);
    const response = await handler(
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

export const handleLocalLabelReading = (request: Request) => handleLocalAi(request, "analyze-wine");
