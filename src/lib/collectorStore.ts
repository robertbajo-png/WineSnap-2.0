import { accountWriteClient, type AccountWriteScope } from "./accountWriteScope";
import {
  collectorLotSchema,
  collectorLotRowSchema,
  type CollectorLot,
  type CollectorLotInput,
} from "./collectorLots";
import { readAllPages } from "./readAllPages";

export type CollectorWine = {
  id: string;
  user_id: string;
  producer: string | null;
  wine_name: string | null;
  vintage: number | null;
  quantity: number | null;
  consumed_at: string | null;
};
export class CollectorStoreError extends Error {
  constructor(public kind: "unavailable" | "uncertain" | "conflict" | "stock" | "changed") {
    super("collector_" + kind);
  }
}
function active(scope: AccountWriteScope, signal: AbortSignal) {
  if (!scope.current() || signal.aborted) throw new CollectorStoreError("changed");
}
export async function loadCollectorAccount(scope: AccountWriteScope, signal: AbortSignal) {
  active(scope, signal);
  const client = await accountWriteClient(scope, 15000, signal);
  active(scope, signal);
  const cancelled = () => !scope.current() || signal.aborted;
  const [rawLots, wines] = await Promise.all([
    readAllPages(
      (from, to) =>
        client
          .from("collector_lots")
          .select("*")
          .eq("user_id", scope.owner)
          .order("purchased_at", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      cancelled,
    ),
    readAllPages(
      (from, to) =>
        client
          .from("wines")
          .select("id,user_id,producer,wine_name,vintage,quantity,consumed_at")
          .eq("user_id", scope.owner)
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      cancelled,
    ),
  ]);
  active(scope, signal);
  const lots = rawLots.map((row) => collectorLotRowSchema.parse(row));
  if (
    lots.some((row) => row.user_id !== scope.owner) ||
    wines.some((row) => row.user_id !== scope.owner)
  )
    throw new CollectorStoreError("unavailable");
  return { lots, wines: wines as CollectorWine[] };
}

export type CollectorSaveAttempt = {
  readonly id: string;
  readonly owner: string;
  readonly input: Readonly<CollectorLotInput>;
  readonly originalUpdatedAt: string | null;
  started: boolean;
};
export function createCollectorAttempt(
  owner: string,
  input: CollectorLotInput,
  original?: CollectorLot | null,
): CollectorSaveAttempt {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(owner))
    throw new CollectorStoreError("unavailable");
  const parsed = collectorLotSchema.parse(input);
  if (
    original &&
    (collectorLotRowSchema.parse(original).user_id !== owner || original.wine_id !== parsed.wine_id)
  )
    throw new CollectorStoreError("unavailable");
  return {
    id: original?.id ?? crypto.randomUUID(),
    owner,
    input: Object.freeze(parsed),
    originalUpdatedAt: original?.updated_at ?? null,
    started: false,
  };
}

export async function saveCollectorAttempt(
  attempt: CollectorSaveAttempt,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  active(scope, signal);
  if (attempt.owner !== scope.owner) throw new CollectorStoreError("changed");
  let client: Awaited<ReturnType<typeof accountWriteClient>>;
  try {
    client = await accountWriteClient(scope, 15000, signal);
  } catch {
    active(scope, signal);
    throw new CollectorStoreError(attempt.started ? "uncertain" : "unavailable");
  }
  active(scope, signal);
  const checked = (raw: unknown) => {
    const row = collectorLotRowSchema.parse(raw);
    if (row.id !== attempt.id || row.user_id !== attempt.owner)
      throw new CollectorStoreError("uncertain");
    return row;
  };
  const same = (row: CollectorLot) =>
    (Object.keys(attempt.input) as (keyof CollectorLotInput)[]).every(
      (key) => row[key] === attempt.input[key],
    );
  const find = async () => {
    try {
      active(scope, signal);
      const result = await client
        .from("collector_lots")
        .select("*")
        .eq("id", attempt.id)
        .eq("user_id", attempt.owner)
        .abortSignal(signal)
        .maybeSingle();
      active(scope, signal);
      if (result.error) throw result.error;
      return result.data ? checked(result.data) : null;
    } catch {
      active(scope, signal);
      throw new CollectorStoreError("uncertain");
    }
  };
  const conflict = (row: CollectorLot | null) =>
    attempt.originalUpdatedAt ? !row || row.updated_at !== attempt.originalUpdatedAt : Boolean(row);
  if (attempt.started) {
    const row = await find();
    if (row && same(row)) return row;
    if (conflict(row)) throw new CollectorStoreError("conflict");
  }
  active(scope, signal);
  attempt.started = true;
  try {
    const query = attempt.originalUpdatedAt
      ? client
          .from("collector_lots")
          .update(attempt.input)
          .eq("id", attempt.id)
          .eq("user_id", attempt.owner)
          .eq("updated_at", attempt.originalUpdatedAt)
      : client
          .from("collector_lots")
          .insert({ ...attempt.input, id: attempt.id, user_id: attempt.owner });
    const result = await query.select("*").abortSignal(signal).single();
    active(scope, signal);
    if (result.error) throw result.error;
    const row = checked(result.data);
    if (!same(row)) throw new CollectorStoreError("uncertain");
    return row;
  } catch (cause) {
    active(scope, signal);
    // A failed read never proves an earlier write failed. Keep the same attempt.
    const row = await find();
    if (row && same(row)) return row;
    if (conflict(row)) throw new CollectorStoreError("conflict");
    const error = cause as { code?: unknown; message?: unknown } | null;
    if (
      error?.code === "P0001" &&
      typeof error.message === "string" &&
      error.message.includes("exceeds cellar stock")
    )
      throw new CollectorStoreError("stock");
    if (
      typeof error?.code === "string" &&
      error.code !== "23505" &&
      /^(22|23|42)[0-9A-Z]{3}$/.test(error.code)
    )
      throw new CollectorStoreError("unavailable");
    throw new CollectorStoreError("uncertain");
  }
}
