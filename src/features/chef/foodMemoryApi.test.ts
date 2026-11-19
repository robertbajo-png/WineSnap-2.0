import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeFoodMemory, foodMemory } from "./api";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  scoped: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.session, getUser: mocks.user },
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));
vi.mock("@/lib/scopedClient", () => ({ scopedClient: mocks.scoped }));
vi.mock("./feature", () => ({ chefEnabled: true }));
const owner = "10000000-0000-4000-8000-000000000001";
let queries: ReturnType<typeof query>[];
function query(data: unknown) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    gt: vi.fn(),
    neq: vi.fn(),
    maybeSingle: vi.fn(),
    abortSignal: vi.fn(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  for (const key of [
    "select",
    "eq",
    "order",
    "limit",
    "gt",
    "neq",
    "maybeSingle",
    "abortSignal",
  ] as const)
    value[key].mockReturnValue(value);
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  queries = [];
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: owner }, access_token: "synthetic-memory-token" } },
    error: null,
  });
  mocks.user.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  mocks.rpc.mockImplementation(() => query(true));
  mocks.from.mockImplementation((table: string) => {
    const value = query(
      table === "food_memory_state" ? { revision: 2, reset_at: "2026-11-01T00:00:00Z" } : [],
    );
    queries.push(value);
    return value;
  });
  mocks.scoped.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
});
afterEach(() => vi.useRealTimers());
describe("bounded owner-scoped food memory reads", () => {
  it("pins reads to a server-verified token and passes one abort signal through every query", async () => {
    const controller = new AbortController();
    await foodMemory(owner, controller.signal);
    expect(mocks.user).toHaveBeenCalledWith("synthetic-memory-token");
    expect(mocks.scoped).toHaveBeenCalledWith("synthetic-memory-token", 15000);
    expect(queries).toHaveLength(3);
    for (const value of queries)
      expect(value.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    controller.abort();
    for (const value of queries) expect(value.abortSignal.mock.calls[0][0].aborted).toBe(true);
  });
  it("refuses a stale cached account before any scoped client or table read", async () => {
    mocks.session.mockResolvedValue({
      data: { session: { user: { id: "synthetic-peer" }, access_token: "other" } },
      error: null,
    });
    await expect(foodMemory(owner)).rejects.toMatchObject({ status: 401 });
    expect(mocks.scoped).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("refuses a cached token whose server verification belongs to another account", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: "synthetic-peer" } }, error: null });
    await expect(foodMemory(owner)).rejects.toMatchObject({ status: 401 });
    expect(mocks.scoped).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not read private tables when the independent Chef gate is denied", async () => {
    mocks.rpc.mockReturnValue(query(false));
    await expect(foodMemory(owner)).rejects.toMatchObject({ status: 403 });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not start Auth or queries with an already-aborted scope", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(foodMemory(owner, controller.signal)).rejects.toMatchObject({ status: 503 });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("stops while Auth verification is pending rather than later issuing a table read", async () => {
    const controller = new AbortController();
    let verify!: (value: unknown) => void;
    mocks.user.mockImplementation(
      () =>
        new Promise((r) => {
          verify = r;
        }),
    );
    const result = foodMemory(owner, controller.signal);
    const checked = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.waitFor(() => expect(mocks.user).toHaveBeenCalledOnce());
    controller.abort();
    await checked;
    verify({ data: { user: { id: owner } }, error: null });
    await Promise.resolve();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("bounds a stalled cached-session lookup without sending a late query", async () => {
    vi.useFakeTimers();
    mocks.session.mockReturnValue(new Promise(() => {}));
    const result = foodMemory(owner);
    const checked = expect(result).rejects.toMatchObject({ status: 401 });
    await vi.advanceTimersByTimeAsync(15000);
    await checked;
    expect(mocks.scoped).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("passes the same deadline to gate and table reads and keeps owner filters", async () => {
    const gate = query(true);
    mocks.rpc.mockReturnValue(gate);
    await foodMemory(owner);
    const signal = gate.abortSignal.mock.calls[0][0];
    for (const value of queries) {
      expect(value.abortSignal).toHaveBeenCalledWith(signal);
      expect(value.eq).toHaveBeenCalledWith("user_id", owner);
    }
    expect(queries[0].limit).toHaveBeenCalledWith(501);
    expect(queries[2].limit).toHaveBeenCalledWith(20);
    expect(queries[2].gt).toHaveBeenCalledWith("created_at", "2026-11-01T00:00:00Z");
  });
  it("rejects an oversized signal collection instead of silently accepting a partial snapshot", async () => {
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table) =>
      table === "food_signals" ? query(Array(501).fill({})) : original(table),
    );
    await expect(foodMemory(owner)).rejects.toMatchObject({ status: 413 });
    expect(mocks.from).not.toHaveBeenCalledWith("cooking_feedback");
  });
  it("never starts a mutation when the captured component scope has changed", async () => {
    await expect(
      changeFoodMemory(owner, "reset", crypto.randomUUID(), 0, undefined, {
        signal: new AbortController().signal,
        current: () => false,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not forward a mutation if its scope changes during gate authorization", async () => {
    let current = true;
    const gate = query(true);
    gate.abortSignal.mockImplementation(() => {
      current = false;
      return gate;
    });
    mocks.rpc.mockReturnValue(gate);
    await expect(
      changeFoodMemory(owner, "reset", crypto.randomUUID(), 0, undefined, {
        signal: new AbortController().signal,
        current: () => current,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("chef_access");
  });
  it("retains a revision conflict and never automatically repeats the RPC", async () => {
    const gate = query(true);
    mocks.rpc.mockImplementation((name) =>
      name === "chef_access"
        ? gate
        : {
            abortSignal: vi.fn(async () => ({
              data: null,
              error: { code: "PT409", message: "private-canary" },
            })),
          },
    );
    await expect(changeFoodMemory(owner, "forget", crypto.randomUUID(), 2)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "food_memory_change")).toHaveLength(1);
  });
});
