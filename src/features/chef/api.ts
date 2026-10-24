import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
          : code === "sensitive_feedback"
            ? "Medicinska uppgifter och allergier kan inte läggas i matminnet."
            : status === 422
              ? "Frågan behöver separat säkerhetsgranskning. AI-förslaget sparades inte."
              : status === 401 || status === 403
                ? "Logga in igen eller kontrollera att AI-kocken är aktiverad i testmiljön."
                : "AI-tjänsten kunde inte slutföra anropet. Inget recept eller minne har ändrats.",
    );
  }
}
async function ownerToken(owner: string) {
  if (!chefEnabled) throw new ChefError(503);
  const { data } = await client.auth.getSession();
  if (!data.session || data.session.user.id !== owner) throw new ChefError(401);
  return data.session.access_token;
}
export async function askChef(
  input: ChefRequest,
  owner: string,
  signal?: AbortSignal,
): Promise<ChefResult> {
  const token = await ownerToken(owner);
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
  const result = await response.json();
  if (!response.ok) throw new ChefError(response.status, result.error);
  return resultSchema.parse(result);
}
async function ensureOwner(owner: string) {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== owner) throw new ChefError(401);
  const result = await client.rpc("chef_access");
  if (result.error || !result.data) throw new ChefError(403);
}
export async function foodMemory(owner: string) {
  await ensureOwner(owner);
  const signals = await client
    .from("food_signals")
    .select("*")
    .eq("user_id", owner)
    .order("created_at", { ascending: false })
    .limit(501);
  const state = await client
    .from("food_memory_state")
    .select("reset_at,revision")
    .eq("user_id", owner)
    .maybeSingle();
  if (signals.error || state.error) throw new ChefError(503);
  if ((signals.data?.length ?? 0) > 500) throw new ChefError(413);
  const feedback = await client
    .from("cooking_feedback")
    .select("id,note,created_at")
    .eq("user_id", owner)
    .gt("created_at", state.data?.reset_at ?? "1970-01-01T00:00:00Z")
    .neq("note", "")
    .order("created_at", { ascending: false })
    .limit(20);
  if (feedback.error) throw new ChefError(503);
  return {
    signals: (signals.data ?? []).map((s) => signalSchema.parse(s)),
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
) {
  const token = await ownerToken(owner);
  const scoped = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => token,
    },
  );
  const result = await scoped.rpc("food_memory_change", {
    _action: action,
    _id: id,
    _revision: revision,
    _entry: entry ? memoryEntrySchema.parse(entry) : null,
  });
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
