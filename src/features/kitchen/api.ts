import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  recipeSchema,
  savedSessionSchema,
  versionSchema,
  validState,
  feedbackSchema,
  type LocalSession,
  type RecipeDocument,
  type RecipeVersion,
} from "./domain";

// Additive contracts are kept separate from the generated legacy database types.
const client = supabase as unknown as SupabaseClient;
export class KitchenError extends Error {
  constructor(public kind: "conflict" | "unavailable" | "network" | "invalid") {
    super(kind);
  }
}
function failed(error: { code?: string; message?: string }): never {
  if (
    error.code === "23505" ||
    ["kitchen_conflict", "kitchen_finished"].includes(error.message ?? "")
  )
    throw new KitchenError("conflict");
  if (["42501", "PGRST202", "42P01"].includes(error.code ?? ""))
    throw new KitchenError("unavailable");
  throw new KitchenError(error.message?.startsWith("kitchen_") ? "invalid" : "network");
}
export async function verifyKitchenOwner(owner: string) {
  const { data, error } = await client.auth.getUser();
  if (error)
    throw new KitchenError(
      error.status === 401 || error.status === 403 ? "unavailable" : "network",
    );
  if (data.user?.id !== owner) throw new KitchenError("unavailable");
  const result = await client.rpc("kitchen_access");
  if (result.error) failed(result.error);
  if (result.data !== true) throw new KitchenError("unavailable");
}
export async function loadKitchen(owner: string) {
  await verifyKitchenOwner(owner);
  const headers = await client
    .from("kitchen_recipes")
    .select("id,current_version_id,revision")
    .eq("user_id", owner)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (headers.error) failed(headers.error);
  const ids = (headers.data ?? []).map((row) => row.current_version_id).filter(Boolean);
  const versions = ids.length
    ? await client.from("kitchen_recipe_versions").select("*").eq("user_id", owner).in("id", ids)
    : { data: [], error: null };
  if (versions.error) failed(versions.error);
  const sessions = await client
    .from("cooking_sessions")
    .select("*")
    .eq("user_id", owner)
    .in("state->>status", ["running", "paused"])
    .limit(1);
  if (sessions.error) failed(sessions.error);
  let active: LocalSession | null = null;
  if (sessions.data?.[0]) active = await hydrateSession(sessions.data[0], owner);
  return {
    versions: (versions.data ?? []).map((value) => versionSchema.parse(value)),
    active,
    history: await cookingHistory(owner),
  };
}
export async function cookingHistory(owner: string): Promise<LocalSession[]> {
  const rows = await client
    .from("cooking_sessions")
    .select("*")
    .eq("user_id", owner)
    .in("state->>status", ["completed", "abandoned"])
    .order("updated_at", { ascending: false })
    .limit(20);
  if (rows.error) failed(rows.error);
  if (!rows.data?.length) return [];
  const versions = await client
    .from("kitchen_recipe_versions")
    .select("*")
    .eq("user_id", owner)
    .in(
      "id",
      rows.data.map((row) => row.recipe_version_id),
    );
  const feedback = await client
    .from("cooking_feedback")
    .select("*")
    .eq("user_id", owner)
    .in(
      "session_id",
      rows.data.map((row) => row.id),
    );
  if (versions.error) failed(versions.error);
  if (feedback.error) failed(feedback.error);
  return rows.data.map((row) => {
    const saved = savedSessionSchema.parse(row);
    const version = versionSchema.parse(
      versions.data?.find((item) => item.id === saved.recipe_version_id),
    );
    if (saved.user_id !== owner || version.user_id !== owner) throw new KitchenError("unavailable");
    const note = feedback.data?.find((item) => item.session_id === saved.id);
    return {
      id: saved.id,
      version,
      state: validState(saved.state, version.document),
      baseRevision: saved.revision,
      requestId: saved.last_request_id,
      dirty: false,
      feedback: note ? feedbackSchema.parse({ rating: note.rating, note: note.note }) : null,
    };
  });
}
export async function hydrateSession(value: unknown, owner: string): Promise<LocalSession> {
  const saved = savedSessionSchema.parse(value);
  if (saved.user_id !== owner) throw new KitchenError("unavailable");
  const result = await client
    .from("kitchen_recipe_versions")
    .select("*")
    .eq("id", saved.recipe_version_id)
    .eq("user_id", owner)
    .single();
  if (result.error) failed(result.error);
  const version = versionSchema.parse(result.data);
  return {
    id: saved.id,
    version,
    state: validState(saved.state, version.document),
    baseRevision: saved.revision,
    requestId: saved.last_request_id,
    dirty: false,
    feedback: null,
  };
}
export async function saveRecipe(
  recipeId: string,
  versionId: string,
  expectedRevision: number,
  document: RecipeDocument,
): Promise<RecipeVersion> {
  const result = await client.rpc("kitchen_save_recipe", {
    _recipe_id: recipeId,
    _version_id: versionId,
    _expected_revision: expectedRevision,
    _document: recipeSchema.parse(document),
  });
  if (result.error) failed(result.error);
  return versionSchema.parse(result.data);
}
export async function saveCookingSession(session: LocalSession) {
  const result = await client.rpc("kitchen_save_session", {
    _id: session.id,
    _version_id: session.version.id,
    _expected_revision: session.baseRevision,
    _request_id: session.requestId,
    _state: validState(session.state, session.version.document),
    _feedback: session.feedback,
  });
  if (result.error) failed(result.error);
  return savedSessionSchema.parse(result.data);
}
export async function serverSession(owner: string, sessionId: string) {
  const result = await client
    .from("cooking_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", owner)
    .maybeSingle();
  if (result.error) failed(result.error);
  return result.data ? hydrateSession(result.data, owner) : null;
}
export async function recipeHistory(owner: string, recipeId: string) {
  const result = await client
    .from("kitchen_recipe_versions")
    .select("*")
    .eq("recipe_id", recipeId)
    .eq("user_id", owner)
    .order("revision", { ascending: false })
    .limit(100);
  if (result.error) failed(result.error);
  return (result.data ?? []).map((value) => versionSchema.parse(value));
}
export async function archiveRecipe(recipeId: string, revision: number) {
  const result = await client.rpc("kitchen_archive_recipe", {
    _id: recipeId,
    _expected_revision: revision,
  });
  if (result.error) failed(result.error);
}
