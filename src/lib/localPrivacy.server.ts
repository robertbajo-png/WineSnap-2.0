import { z } from "zod";
import { createHandler as controls } from "../../supabase/functions/privacy-controls/handler";
import { createHandler as exportData } from "../../supabase/functions/privacy-export/handler";
import { createHandler as maintenance } from "../../supabase/functions/privacy-maintenance/handler";
import { runAccountErasure } from "../../supabase/functions/_shared/privacyErasure";
import {
  getOperationsAdmin,
  localOperationsEnabled,
  operationsCredentials,
} from "./localCredentials.server";

export type LocalPrivacyFunction = "privacy-controls" | "privacy-export" | "privacy-maintenance";
const schemas = {
  "privacy-controls": z
    .object({
      action: z.enum(["reset_memory", "delete_account"]),
      confirm: z.enum(["reset_memory", "delete_account"]),
    })
    .strict(),
  "privacy-export": z.object({}).strict(),
  "privacy-maintenance": z.object({ execute: z.boolean().optional() }).strict(),
};
const cache = { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" };
export async function handleLocalPrivacy(request: Request, name: LocalPrivacyFunction) {
  const json = (error: string, status: number) =>
    Response.json({ error }, { status, headers: cache });
  if (!localOperationsEnabled()) return json("Local operations disabled", 503);
  if (request.method !== "POST") return json("Method not allowed", 405);
  if (!/^Bearer \S+$/.test(request.headers.get("authorization") ?? ""))
    return json("Unauthorized", 401);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return json("JSON required", 415);
  try {
    // Stream-bound input even if the caller omits Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json("Invalid request", 400);
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return json("Invalid request", 400);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json("Invalid request", 400);
    }
    const input = schemas[name].safeParse(body);
    if (!input.success) return json("Invalid request", 400);
    const keys = await operationsCredentials();
    const admin = await getOperationsAdmin();
    const handler = {
      "privacy-controls": controls,
      "privacy-export": exportData,
      "privacy-maintenance": maintenance,
    }[name]({
      admin: () => admin,
      erase: runAccountErasure,
      env: (key) =>
        ({
          PRIVACY_DELETION_ENABLED: "true",
          PRIVACY_MAINTENANCE_ENABLED: "true",
          PRIVACY_CRON_SECRET: keys.privacyCronSecret,
          KITCHEN_CORE_ENABLED:
            process.env.WINESNAP_COOKING_CORE_ENABLED === "true" ? "true" : "false",
          AI_CHEF_ENABLED: process.env.WINESNAP_AI_CHEF_ENABLED === "true" ? "true" : "false",
        })[key],
    });
    const response = await handler(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(input.data),
      }),
    );
    const headers = new Headers(response.headers);
    headers.delete("access-control-allow-origin");
    headers.delete("access-control-allow-headers");
    for (const [key, value] of Object.entries(cache)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return json("Local privacy service unavailable", 503);
  }
}
