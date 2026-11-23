import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { accountWriteClient, type AccountWriteScope } from "@/lib/accountWriteScope";
import { savedSessionSchema, versionSchema } from "../kitchen/domain";
import {
  consumptionItemsSchema,
  consumptionReceiptSchema,
  pantrySnapshotSchema,
  stockInputSchema,
} from "./domain";

const id = z.uuid().transform((value) => value.toLowerCase());
const pantryColumns = "user_id,revision,items,last_request_id,updated_at";
const receiptColumns = "session_id,user_id,pantry_revision,request_id,items,confirmed_at";
const edit = z
  .object({
    itemId: id,
    expectedRevision: z.int().min(0).max(2147483646),
    requestId: id,
    item: stockInputSchema.nullable(),
  })
  .strict();
const confirm = z
  .object({
    sessionId: id,
    sessionRevision: z.int().min(1).max(2147483647),
    expectedRevision: z.int().min(1).max(2147483646),
    requestId: id,
    items: consumptionItemsSchema,
  })
  .strict();
const confirmation = z
  .object({ pantry: pantrySnapshotSchema, receipt: consumptionReceiptSchema })
  .strict();

export class PantryError extends Error {
  constructor(public kind: "unavailable" | "invalid" | "conflict" | "unknown") {
    super("pantry_" + kind);
  }
}

function requireCurrent(scope: AccountWriteScope, signal?: AbortSignal) {
  if (!scope.current() || signal?.aborted) throw new PantryError("unavailable");
}

async function scoped(scope: AccountWriteScope, signal?: AbortSignal) {
  requireCurrent(scope, signal);
  const owner = id.safeParse(scope.owner);
  if (!owner.success) throw new PantryError("unavailable");
  try {
    const client = (await accountWriteClient(scope, 15000, signal)) as unknown as SupabaseClient;
    requireCurrent(scope, signal);
    return { client, owner: owner.data };
  } catch {
    throw new PantryError("unavailable");
  }
}

function mutationError(code?: string): never {
  if (code === "PT409" || code === "40001") throw new PantryError("conflict");
  if (code === "22023" || code === "23514") throw new PantryError("invalid");
  if (code === "42501") throw new PantryError("unavailable");
  throw new PantryError("unknown");
}

export async function loadPantry(scope: AccountWriteScope, signal?: AbortSignal) {
  const { client, owner } = await scoped(scope, signal);
  return readPantry(client, owner, scope, signal);
}

async function readPantry(
  client: SupabaseClient,
  owner: string,
  scope: AccountWriteScope,
  signal?: AbortSignal,
) {
  const query = client.from("kitchen_pantry").select(pantryColumns).eq("user_id", owner);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  requireCurrent(scope, signal);
  if (error) throw new PantryError("unavailable");
  if (data === null) return null;
  const result = pantrySnapshotSchema.safeParse(data);
  if (!result.success || result.data.user_id !== owner) throw new PantryError("unavailable");
  return result.data;
}

export async function loadPantryReceipt(
  scope: AccountWriteScope,
  sessionId: string,
  signal?: AbortSignal,
) {
  const session = id.safeParse(sessionId);
  if (!session.success) throw new PantryError("invalid");
  const { client, owner } = await scoped(scope, signal);
  return readReceipt(client, owner, session.data, scope, signal);
}

async function readReceipt(
  client: SupabaseClient,
  owner: string,
  sessionId: string,
  scope: AccountWriteScope,
  signal?: AbortSignal,
) {
  const query = client
    .from("kitchen_pantry_consumption")
    .select(receiptColumns)
    .eq("user_id", owner)
    .eq("session_id", sessionId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  requireCurrent(scope, signal);
  if (error) throw new PantryError("unavailable");
  if (data === null) return null;
  const result = consumptionReceiptSchema.safeParse(data);
  if (!result.success || result.data.user_id !== owner || result.data.session_id !== sessionId)
    throw new PantryError("unavailable");
  return result.data;
}

export async function loadConsumptionReview(
  scope: AccountWriteScope,
  sessionId: string,
  signal: AbortSignal,
) {
  const expected = id.safeParse(sessionId);
  if (!expected.success) throw new PantryError("invalid");
  const { client, owner } = await scoped(scope, signal);
  const query = client
    .from("cooking_sessions")
    .select("id,user_id,recipe_version_id,revision,state,last_request_id,updated_at")
    .eq("user_id", owner)
    .eq("id", expected.data);
  const { data, error } = await query.abortSignal(signal).maybeSingle();
  requireCurrent(scope, signal);
  const session = savedSessionSchema.safeParse(data);
  if (
    error ||
    !session.success ||
    session.data.user_id !== owner ||
    session.data.id !== expected.data ||
    session.data.state.status !== "completed"
  )
    throw new PantryError("unavailable");
  const [pantry, receipt, recipe] = await Promise.all([
    readPantry(client, owner, scope, signal),
    readReceipt(client, owner, expected.data, scope, signal),
    client
      .from("kitchen_recipe_versions")
      .select("id,user_id,recipe_id,revision,document,created_at")
      .eq("user_id", owner)
      .eq("id", session.data.recipe_version_id)
      .abortSignal(signal)
      .maybeSingle(),
  ]);
  requireCurrent(scope, signal);
  const version = versionSchema.safeParse(recipe.data);
  if (
    recipe.error ||
    !version.success ||
    version.data.user_id !== owner ||
    version.data.id !== session.data.recipe_version_id
  )
    throw new PantryError("unavailable");
  return { pantry, receipt, session: session.data, version: version.data };
}

export async function savePantryItem(
  scope: AccountWriteScope,
  input: z.input<typeof edit>,
  signal?: AbortSignal,
) {
  const parsed = edit.safeParse(input);
  if (!parsed.success) throw new PantryError("invalid");
  const { itemId, expectedRevision, item, requestId } = parsed.data;
  const { client, owner } = await scoped(scope, signal);
  const query = client.rpc("kitchen_save_pantry_item", {
    _item_id: itemId,
    _expected_revision: expectedRevision,
    _request_id: requestId,
    _item: item,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  requireCurrent(scope, signal);
  if (error) mutationError(error.code);
  const snapshot = pantrySnapshotSchema.safeParse(data);
  if (
    !snapshot.success ||
    snapshot.data.user_id !== owner ||
    snapshot.data.revision !== expectedRevision + 1 ||
    snapshot.data.last_request_id !== requestId
  )
    throw new PantryError("unknown");
  const result = snapshot.data.items.find(({ id }) => id === itemId);
  if (
    item
      ? !result ||
        result.name !== item.name ||
        result.amount !== item.amount ||
        result.unit !== item.unit ||
        (result.confirmedAt !== null) !== item.confirmed
      : result
  )
    throw new PantryError("unknown");
  return snapshot.data;
}

export async function confirmPantryConsumption(
  scope: AccountWriteScope,
  input: z.input<typeof confirm>,
  signal?: AbortSignal,
) {
  const parsed = confirm.safeParse(input);
  if (!parsed.success) throw new PantryError("invalid");
  const { sessionId, sessionRevision, expectedRevision, requestId, items } = parsed.data;
  const { client, owner } = await scoped(scope, signal);
  const query = client.rpc("kitchen_confirm_pantry_consumption", {
    _session_id: sessionId,
    _session_revision: sessionRevision,
    _expected_revision: expectedRevision,
    _request_id: requestId,
    _used: items,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  requireCurrent(scope, signal);
  if (error) mutationError(error.code);
  const result = confirmation.safeParse(data);
  if (!result.success) throw new PantryError("unknown");
  const { pantry, receipt } = result.data;
  if (
    pantry.user_id !== owner ||
    receipt.user_id !== owner ||
    receipt.session_id !== sessionId ||
    receipt.request_id !== requestId ||
    receipt.pantry_revision !== expectedRevision + 1 ||
    pantry.revision < receipt.pantry_revision ||
    receipt.items.length !== items.length ||
    receipt.items.some(
      ({ itemId, amount }, index) =>
        itemId !== items[index].itemId || amount !== items[index].amount,
    )
  )
    throw new PantryError("unknown");
  return result.data;
}
