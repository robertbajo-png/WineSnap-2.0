import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { accountWriteClient, readSessionWithDeadline } from "@/lib/accountWriteScope";
import { recipeSchema } from "../kitchen/domain";
import { chefRequestSchema, memoryEntrySchema, signalSchema, type ChefRequest } from "./domain";

const client = supabase as unknown as SupabaseClient;
import { chefEnabled } from "./feature";
export { chefEnabled } from "./feature";
const resultSchema = z.object({
  answer: z.string().optional(),
  draft: recipeSchema.optional(),
  candidateCount: z.number().optional(),
  safety: z.boolean().optional(),
  model: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  durationMs: z.number(),
});
export type ChefResult = z.infer<typeof resultSchema>;
export class ChefError extends Error {
  constructor(
    public status: number,
    code = "",
  ) {
    super(
      status === 429
        ? "Dagens eller periodens AI-gräns är nådd. Försök senare."
        : status === 409
          ? "Underlaget har ändrats eller anropet pågår redan. Hämta på nytt innan ett nytt försök."
          : code === "remove_secret"
            ? "Underlaget verkar innehålla en hemlig nyckel. Ta bort den ur frågan, receptet eller samtalet innan du försöker igen."
            : code === "sensitive_feedback"
              ? "Underlaget verkar innehålla medicinska uppgifter eller allergier och kan inte skickas till AI-kocken eller matminnet."
              : status === 422
                ? "Frågan behöver separat säkerhetsgranskning. AI-förslaget sparades inte."
                : status === 401 || status === 403
                  ? "Logga in igen eller kontrollera att AI-kocken är tillgänglig för ditt konto."
                  : "Anropet kunde inte bekräftas. Hämta aktuella uppgifter före nästa ändring.",
    );
  }
}
async function ownerToken(owner: string, signal?: AbortSignal) {
  if (!chefEnabled) throw new ChefError(503);
  const { data } = await readSessionWithDeadline(signal);
  if (!data.session || data.session.user.id !== owner) throw new ChefError(401);
  return data.session.access_token;
}
export async function askChef(
  input: ChefRequest,
  owner: string,
  signal?: AbortSignal,
): Promise<ChefResult> {
  const token = await ownerToken(owner, signal);
  if (signal?.aborted) throw new ChefError(503);
  const response = await fetch("/api/chef", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(chefRequestSchema.parse(input)),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(65000)])
      : AbortSignal.timeout(65000),
    cache: "no-store",
    redirect: "error",
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ChefError(response.ok ? 502 : response.status);
  }
  if (!response.ok)
    throw new ChefError(
      response.status,
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error
        : "",
    );
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success) throw new ChefError(502);
  return parsed.data;
}
async function ensureOwner(owner: string) {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== owner) throw new ChefError(401);
  const result = await client.rpc("chef_access");
  if (result.error || !result.data) throw new ChefError(403);
}
export type FoodMemoryScope = { signal: AbortSignal; current: () => boolean };
async function memoryClient(owner: string, signal: AbortSignal, current = () => true) {
  if (!chefEnabled) throw new ChefError(503);
  let scoped: SupabaseClient;
  try {
    scoped = await accountWriteClient({ owner, current }, 15000, signal);
  } catch {
    throw new ChefError(signal.aborted ? 503 : 401);
  }
  if (!current() || signal.aborted) throw new ChefError(503);
  const gate = await scoped.rpc("chef_access").abortSignal(signal);
  if (!current() || signal.aborted || gate.error || gate.data !== true) throw new ChefError(403);
  return scoped;
}
export async function foodMemory(owner: string, signal?: AbortSignal) {
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
  const scoped = await memoryClient(owner, bounded);
  const signals = await scoped
    .from("food_signals")
    .select("*")
    .eq("user_id", owner)
    .order("created_at", { ascending: false })
    .limit(501)
    .abortSignal(bounded);
  if (bounded.aborted) throw new ChefError(503);
  const state = await scoped
    .from("food_memory_state")
    .select("reset_at,revision")
    .eq("user_id", owner)
    .abortSignal(bounded)
    .maybeSingle();
  if (signals.error || state.error) throw new ChefError(503);
  if ((signals.data?.length ?? 0) > 500) throw new ChefError(413);
  if (bounded.aborted) throw new ChefError(503);
  const feedback = await scoped
    .from("cooking_feedback")
    .select("id,note,created_at")
    .eq("user_id", owner)
    .gt("created_at", state.data?.reset_at ?? "1970-01-01T00:00:00Z")
    .neq("note", "")
    .order("created_at", { ascending: false })
    .limit(20)
    .abortSignal(bounded);
  if (feedback.error || bounded.aborted) throw new ChefError(503);
  const parsed = (signals.data ?? []).map((s) => signalSchema.parse(s));
  if (parsed.some((s) => s.user_id !== owner)) throw new ChefError(503);
  return {
    signals: parsed,
    feedback: z
      .array(z.object({ id: z.string().uuid(), note: z.string(), created_at: z.string() }))
      .parse(feedback.data),
    revision: state.data?.revision ?? 0,
  };
}
export async function changeFoodMemory(
  owner: string,
  action: "add" | "confirm" | "correct" | "forget" | "reset",
  id: string,
  revision = 0,
  entry?: z.input<typeof memoryEntrySchema>,
  scope?: FoodMemoryScope,
) {
  const signal = scope
    ? AbortSignal.any([scope.signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
  const current = scope?.current ?? (() => true);
  const scoped = await memoryClient(owner, signal, current);
  if (!current() || signal.aborted) throw new ChefError(503);
  const result = await scoped
    .rpc("food_memory_change", {
      _action: action,
      _id: id,
      _revision: revision,
      _entry: entry ? memoryEntrySchema.parse(entry) : null,
    })
    .abortSignal(signal);
  if (result.error)
    throw new ChefError(
      ["40001", "PT409"].includes(result.error.code)
        ? 409
        : result.error.code === "42501"
          ? 403
          : 503,
    );
}
export async function chefConversations(owner: string) {
  await ensureOwner(owner);
  const result = await client
    .from("chef_conversations")
    .select("id,title,revision")
    .eq("user_id", owner)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (result.error) throw new ChefError(503);
  return z
    .array(z.object({ id: z.string().uuid(), title: z.string(), revision: z.number() }))
    .parse(result.data);
}
export async function chefMessages(owner: string, conversation: string) {
  await ensureOwner(owner);
  const result = await client
    .from("chef_messages")
    .select("role,content,turn")
    .eq("user_id", owner)
    .eq("conversation_id", conversation)
    .order("turn", { ascending: false })
    .order("role", { ascending: false })
    .limit(12);
  if (result.error) throw new ChefError(503);
  return z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string(), turn: z.number() }))
    .parse(result.data)
    .reverse();
}
