import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectorForm, parseCollectorForm, type CollectorLot } from "./collectorLots";
const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("./accountWriteScope", () => ({ accountWriteClient: mocks.capture }));
import {
  createCollectorAttempt,
  loadCollectorAccount,
  saveCollectorAttempt,
  CollectorStoreError,
} from "./collectorStore";

const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  peer = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-11-01T12:00:00.000Z";
const input = () => {
  const parsed = parseCollectorForm({ ...collectorForm(), wine_id: id(1), unit_cost: "100" });
  if (!parsed.success) throw new Error("Invalid synthetic collector input");
  return parsed.data;
};
const lot = (): CollectorLot => ({
  ...input(),
  id: id(2),
  user_id: owner,
  created_at: stamp,
  updated_at: stamp,
});
let current: boolean, records: CollectorLot[], wines: { id: string; user_id: string }[];
let writes: { action: string; filters: Record<string, string>; payload: Record<string, unknown> }[];
let ranges: { table: string; from: number; to: number }[];
let lost: boolean, readFailure: boolean, throwRead: boolean;
let duringWrite: (() => void) | undefined;
const scope = { owner, current: () => current };
const signal = () => new AbortController().signal;
function client() {
  return {
    from(table: string) {
      const filters: Record<string, string> = {};
      let action = "read",
        payload: Record<string, unknown> = {},
        from = 0,
        to = 999;
      async function run(single = false) {
        const rows = (table === "collector_lots" ? records : wines).filter((r) =>
          Object.entries(filters).every(
            ([key, value]) => (r as unknown as Record<string, unknown>)[key] === value,
          ),
        );
        if (action === "read") {
          if (table === "collector_lots" && filters.id && readFailure) {
            readFailure = false;
            if (throwRead) throw new Error("synthetic_read_lost");
            return { data: null, error: { code: "synthetic_read_lost" } };
          }
          ranges.push({ table, from, to });
          return { data: single ? (rows[0] ?? null) : rows.slice(from, to + 1), error: null };
        }
        writes.push({ action, filters: { ...filters }, payload: { ...payload } });
        let saved: CollectorLot;
        if (action === "insert") {
          saved = { ...payload, created_at: stamp, updated_at: stamp } as CollectorLot;
          records.push(saved);
        } else {
          if (!rows[0]) return { data: null, error: { code: "PGRST116" } };
          saved = {
            ...rows[0],
            ...payload,
            updated_at: "2026-11-13T12:00:00.000Z",
          } as CollectorLot;
          records[records.findIndex((r) => r.id === saved.id)] = saved;
        }
        duringWrite?.();
        if (lost) {
          lost = false;
          return { data: null, error: { code: "synthetic_lost_reply" } };
        }
        return { data: saved, error: null };
      }
      const query = {
        select: () => query,
        order: () => query,
        abortSignal: () => query,
        eq: (key: string, value: string) => {
          filters[key] = value;
          return query;
        },
        range: (start: number, end: number) => {
          from = start;
          to = end;
          return query;
        },
        insert: (data: Record<string, unknown>) => {
          action = "insert";
          payload = data;
          return query;
        },
        update: (data: Record<string, unknown>) => {
          action = "update";
          payload = data;
          return query;
        },
        maybeSingle: () => run(true),
        single: () => run(true),
        then: <T>(
          resolve: (value: Awaited<ReturnType<typeof run>>) => T,
          reject?: (cause: unknown) => T,
        ) => run().then(resolve, reject),
      };
      return query;
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  current = true;
  records = [];
  wines = [];
  writes = [];
  ranges = [];
  lost = false;
  readFailure = false;
  throwRead = false;
  duringWrite = undefined;
  mocks.capture.mockResolvedValue(client());
});
describe("collector account reads", () => {
  it("loads both complete paginated inventories, not only the first thousand rows", async () => {
    records = Array.from({ length: 1001 }, (_, i) => ({ ...lot(), id: id(i + 10) }));
    wines = Array.from({ length: 1001 }, (_, i) => ({ id: id(i + 2000), user_id: owner }));
    const result = await loadCollectorAccount(scope, signal());
    expect(result.lots).toHaveLength(1001);
    expect(result.wines).toHaveLength(1001);
    expect(ranges.filter((r) => r.table === "collector_lots").map((r) => r.from)).toEqual([
      0, 500, 1000,
    ]);
    expect(ranges.filter((r) => r.table === "wines").map((r) => r.from)).toEqual([0, 500, 1000]);
  });
  it("never starts account reads from an invalidated view", async () => {
    current = false;
    await expect(loadCollectorAccount(scope, signal())).rejects.toMatchObject({ kind: "changed" });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
describe("stable collector writes", () => {
  it("retains manual valuation source, date and currency, including a zero estimate", async () => {
    const attempt = createCollectorAttempt(owner, {
      ...input(),
      currency: "USD",
      estimate_price: 0,
      estimate_currency: "EUR",
      estimate_source: "Synthetic user-entered reference",
      estimate_date: "2026-11-01",
      estimate_confidence: "low",
    });
    const saved = await saveCollectorAttempt(attempt, scope, signal());
    expect(saved).toMatchObject({
      currency: "USD",
      estimate_price: 0,
      estimate_currency: "EUR",
      estimate_source: "Synthetic user-entered reference",
      estimate_date: "2026-11-01",
      estimate_confidence: "low",
    });
  });
  it("captures a validated immutable payload, owner and stable acquisition ID", () => {
    const data = input(),
      attempt = createCollectorAttempt(owner, data);
    data.unit_cost = 999;
    expect(attempt.input.unit_cost).toBe(100);
    expect(Object.isFrozen(attempt.input)).toBe(true);
    expect(attempt.owner).toBe(owner);
    expect(attempt.originalUpdatedAt).toBeNull();
  });
  it("reconciles a lost insert response with the same ID without another insert", async () => {
    const attempt = createCollectorAttempt(owner, input());
    lost = true;
    expect((await saveCollectorAttempt(attempt, scope, signal())).id).toBe(attempt.id);
    await saveCollectorAttempt(attempt, scope, signal());
    expect(writes).toHaveLength(1);
    expect(writes[0].payload.user_id).toBe(owner);
    expect(writes[0].payload.id).toBe(attempt.id);
  });
  it.each([false, true])(
    "does not retry an insert when the reconciliation read fails (throw=%s)",
    async (throws) => {
      const attempt = createCollectorAttempt(owner, input());
      lost = true;
      readFailure = true;
      throwRead = throws;
      await expect(saveCollectorAttempt(attempt, scope, signal())).rejects.toMatchObject({
        kind: "uncertain",
      });
      expect(writes).toHaveLength(1);
      expect(attempt.started).toBe(true);
      expect((await saveCollectorAttempt(attempt, scope, signal())).id).toBe(attempt.id);
      expect(writes).toHaveLength(1);
    },
  );
  it("requires a successful read before retrying an already-started missing insert", async () => {
    const attempt = createCollectorAttempt(owner, input());
    attempt.started = true;
    readFailure = true;
    await expect(saveCollectorAttempt(attempt, scope, signal())).rejects.toMatchObject({
      kind: "uncertain",
    });
    expect(writes).toHaveLength(0);
  });
  it("rejects a different owner or an already-cancelled operation before writes", async () => {
    const attempt = createCollectorAttempt(owner, input());
    await expect(
      saveCollectorAttempt(attempt, { ...scope, owner: peer }, signal()),
    ).rejects.toMatchObject({ kind: "changed" });
    const controller = new AbortController();
    controller.abort();
    await expect(saveCollectorAttempt(attempt, scope, controller.signal)).rejects.toMatchObject({
      kind: "changed",
    });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
  it("rejects an account switch during a write without reconciliation or a second write", async () => {
    const attempt = createCollectorAttempt(owner, input());
    duringWrite = () => {
      current = false;
    };
    await expect(saveCollectorAttempt(attempt, scope, signal())).rejects.toMatchObject({
      kind: "changed",
    });
    expect(writes).toHaveLength(1);
    expect(ranges).toHaveLength(0);
  });
  it("uses the original revision and owner to reject a conflicting update", async () => {
    const original = lot(),
      attempt = createCollectorAttempt(owner, { ...input(), unit_cost: 150 }, original);
    records = [{ ...original, unit_cost: 777, updated_at: "2026-11-13T12:00:01.000Z" }];
    await expect(saveCollectorAttempt(attempt, scope, signal())).rejects.toMatchObject({
      kind: "conflict",
    });
    expect(records[0].unit_cost).toBe(777);
    expect(writes[0].filters).toMatchObject({ id: original.id, user_id: owner, updated_at: stamp });
  });
  it("reconciles a committed update without overwriting a later revision", async () => {
    const original = lot(),
      attempt = createCollectorAttempt(owner, { ...input(), unit_cost: 150 }, original);
    records = [original];
    lost = true;
    expect((await saveCollectorAttempt(attempt, scope, signal())).unit_cost).toBe(150);
    await saveCollectorAttempt(attempt, scope, signal());
    expect(writes).toHaveLength(1);
  });
  it("keeps an uncertain attempt read-only if account verification later fails", async () => {
    const attempt = createCollectorAttempt(owner, input());
    attempt.started = true;
    mocks.capture.mockRejectedValue(new Error("synthetic_auth_failure"));
    await expect(saveCollectorAttempt(attempt, scope, signal())).rejects.toBeInstanceOf(
      CollectorStoreError,
    );
    await expect(saveCollectorAttempt(attempt, scope, signal())).rejects.toMatchObject({
      kind: "uncertain",
    });
    expect(writes).toHaveLength(0);
  });
});
