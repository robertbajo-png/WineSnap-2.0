import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { accountWriteClient, type AccountWriteScope } from "@/lib/accountWriteScope";
import { versionSchema } from "../kitchen/domain";
import { weekPlanSchema, weekStartSchema, type WeekPlan } from "./domain";

const identifier = z.uuid().transform((value) => value.toLowerCase());
const savedWeekPlanSchema = z
  .object({
    user_id: identifier,
    week_start: weekStartSchema,
    revision: z.number().int().min(1).max(2147483647),
    document: weekPlanSchema,
    last_request_id: identifier,
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();
const weekPlanColumns = "user_id,week_start,revision,document,last_request_id,updated_at";
const saveInput = z
  .object({
    document: weekPlanSchema,
    expectedRevision: z.number().int().min(0).max(2147483646),
    requestId: identifier,
  })
  .strict();

export type SavedWeekPlan = z.infer<typeof savedWeekPlanSchema>;
export class WeekPlanError extends Error {
  constructor(public kind: "unavailable" | "invalid" | "conflict" | "unknown") {
    super("week_plan_" + kind);
  }
}

function requireCurrent(scope: AccountWriteScope, signal?: AbortSignal) {
  if (!scope.current() || signal?.aborted) throw new WeekPlanError("unavailable");
}

async function scoped(scope: AccountWriteScope, signal?: AbortSignal) {
  requireCurrent(scope, signal);
  if (!identifier.safeParse(scope.owner).success) throw new WeekPlanError("unavailable");
  try {
    return (await accountWriteClient(scope, 15000, signal)) as unknown as SupabaseClient;
  } catch {
    throw new WeekPlanError("unavailable");
  }
}

function receipt(value: unknown, owner: string, weekStart: string) {
  const row = savedWeekPlanSchema.safeParse(value);
  if (
    !row.success ||
    row.data.user_id !== owner.toLowerCase() ||
    row.data.week_start !== weekStart ||
    row.data.document.weekStart !== weekStart
  )
    throw new WeekPlanError("unknown");
  return row.data;
}

export async function loadWeekPlan(
  scope: AccountWriteScope,
  weekStart: string,
  signal?: AbortSignal,
): Promise<SavedWeekPlan | null> {
  if (!weekStartSchema.safeParse(weekStart).success) throw new WeekPlanError("invalid");
  const client = await scoped(scope, signal);
  return readWeekPlan(client, scope, weekStart, signal);
}

async function readWeekPlan(
  client: SupabaseClient,
  scope: AccountWriteScope,
  weekStart: string,
  signal?: AbortSignal,
) {
  requireCurrent(scope, signal);
  const query = client
    .from("kitchen_week_plans")
    .select(weekPlanColumns)
    .eq("user_id", scope.owner)
    .eq("week_start", weekStart);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  requireCurrent(scope, signal);
  if (error) throw new WeekPlanError("unavailable");
  return data === null ? null : receipt(data, scope.owner, weekStart);
}

export async function saveWeekPlan(
  scope: AccountWriteScope,
  input: z.input<typeof saveInput>,
  signal?: AbortSignal,
): Promise<SavedWeekPlan> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) throw new WeekPlanError("invalid");
  const { document, expectedRevision, requestId } = parsed.data;
  const client = await scoped(scope, signal);
  requireCurrent(scope, signal);
  const query = client.rpc("kitchen_save_week_plan", {
    _week_start: document.weekStart,
    _expected_revision: expectedRevision,
    _request_id: requestId,
    _document: document,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  requireCurrent(scope, signal);
  if (error) {
    if (error.code === "PT409" || error.code === "40001") throw new WeekPlanError("conflict");
    if (error.code === "22023") throw new WeekPlanError("invalid");
    if (error.code === "42501") throw new WeekPlanError("unavailable");
    throw new WeekPlanError("unknown");
  }
  const saved = receipt(data, scope.owner, document.weekStart);
  if (
    saved.revision !== expectedRevision + 1 ||
    saved.last_request_id !== requestId ||
    JSON.stringify(saved.document) !== JSON.stringify(document)
  )
    throw new WeekPlanError("unknown");
  return saved;
}

export async function loadPlannedRecipeVersions(
  scope: AccountWriteScope,
  plan: WeekPlan,
  signal?: AbortSignal,
) {
  const parsed = weekPlanSchema.safeParse(plan);
  if (!parsed.success) throw new WeekPlanError("invalid");
  requireCurrent(scope, signal);
  const ids = [...new Set(parsed.data.meals.map((meal) => meal.recipeVersionId))];
  if (!ids.length) return [];
  const client = await scoped(scope, signal);
  return readPlannedVersions(client, scope, ids, signal);
}

async function readPlannedVersions(
  client: SupabaseClient,
  scope: AccountWriteScope,
  ids: string[],
  signal?: AbortSignal,
) {
  requireCurrent(scope, signal);
  const query = client
    .from("kitchen_recipe_versions")
    .select("id,recipe_id,user_id,revision,document,created_at")
    .eq("user_id", scope.owner)
    .in("id", ids);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  requireCurrent(scope, signal);
  if (error) throw new WeekPlanError("unavailable");
  const versions = z.array(versionSchema).max(ids.length).safeParse(data);
  if (
    !versions.success ||
    versions.data.some(
      (version) =>
        version.user_id.toLowerCase() !== scope.owner.toLowerCase() ||
        !ids.includes(version.id.toLowerCase()),
    ) ||
    new Set(versions.data.map((version) => version.id.toLowerCase())).size !== versions.data.length
  )
    throw new WeekPlanError("unknown");
  return versions.data;
}

export async function loadWeekPlanSnapshot(
  scope: AccountWriteScope,
  weekStart: string,
  signal?: AbortSignal,
) {
  if (!weekStartSchema.safeParse(weekStart).success) throw new WeekPlanError("invalid");
  const client = await scoped(scope, signal);
  const saved = await readWeekPlan(client, scope, weekStart, signal);
  const ids = [...new Set(saved?.document.meals.map((meal) => meal.recipeVersionId) ?? [])];
  const versions = ids.length ? await readPlannedVersions(client, scope, ids, signal) : [];
  return { saved, versions };
}
