import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlannedRecipeVersions, loadWeekPlan, saveWeekPlan } from "./api";
import type { WeekPlan } from "./domain";

const mocks = vi.hoisted(() => ({ scopedClient: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/accountWriteScope", () => ({ accountWriteClient: mocks.scopedClient }));

const owner = "b7000000-0000-4000-8000-000000000001";
const other = "b7000000-0000-4000-8000-000000000002";
const request = "b7000000-0000-4000-8000-000000000003";
const version = "b7000000-0000-4000-8000-000000000004";
const monday = "2026-11-16";
const document: WeekPlan = {
  weekStart: monday,
  meals: [],
  manualItems: [],
  shoppingEdits: [],
};
const stored = {
  user_id: owner,
  week_start: monday,
  revision: 1,
  document,
  last_request_id: request,
  updated_at: "2026-11-16T10:00:00.000+00:00",
};
const intent = { document, expectedRevision: 0, requestId: request };
const scope = { owner, current: () => true };

const readChain = (data: unknown, error: unknown = null) => {
  const query = Object.assign(Promise.resolve({ data, error }), {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  });
  mocks.from.mockReturnValue(query);
  return query;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scopedClient.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
});

describe("private revisioned week plans", () => {
  it("loads the exact owner and week, without inventing an empty saved revision", async () => {
    const query = readChain(stored);
    const signal = new AbortController().signal;
    await expect(loadWeekPlan(scope, monday, signal)).resolves.toEqual(stored);
    expect(mocks.scopedClient).toHaveBeenCalledWith(scope, 15000, signal);
    expect(mocks.from).toHaveBeenCalledWith("kitchen_week_plans");
    expect(query.eq.mock.calls).toEqual([
      ["user_id", owner],
      ["week_start", monday],
    ]);
    expect(query.abortSignal).toHaveBeenCalledWith(signal);
    readChain(null);
    await expect(loadWeekPlan(scope, monday)).resolves.toBeNull();
  });

  it("does not return a mismatched owner or week", async () => {
    for (const row of [
      { ...stored, user_id: other },
      { ...stored, week_start: "2026-11-23" },
      { ...stored, document: { ...document, weekStart: "2026-11-23" } },
    ]) {
      readChain(row);
      await expect(loadWeekPlan(scope, monday)).rejects.toMatchObject({ kind: "unknown" });
    }
  });

  it("passes only the exact save contract without adding an owner or auto-replaying", async () => {
    mocks.rpc.mockResolvedValue({ data: stored, error: null });
    await expect(saveWeekPlan(scope, intent)).resolves.toEqual(stored);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("kitchen_save_week_plan", {
      _week_start: monday,
      _expected_revision: 0,
      _request_id: request,
      _document: document,
    });
  });

  it.each([
    ["PT409", "conflict"],
    ["40001", "conflict"],
    ["22023", "invalid"],
    ["42501", "unavailable"],
    ["PGRST000", "unknown"],
  ])("maps %s without exposing server details or silently reissuing a save", async (code, kind) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "raw details" } });
    await expect(saveWeekPlan(scope, intent)).rejects.toMatchObject({
      kind,
      message: "week_plan_" + kind,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong committed revision, request ID or document receipts", async () => {
    for (const value of [
      { ...stored, revision: 2 },
      { ...stored, last_request_id: other },
      {
        ...stored,
        document: {
          ...document,
          manualItems: [
            { id: other, item: { name: "Citron", amount: null, unit: null }, checked: true },
          ],
        },
      },
    ]) {
      mocks.rpc.mockResolvedValue({ data: value, error: null });
      await expect(saveWeekPlan(scope, intent)).rejects.toMatchObject({ kind: "unknown" });
    }
  });

  it("fails closed if the account or signal changes before the request", async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(saveWeekPlan(scope, intent, aborted.signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(saveWeekPlan({ ...scope, current: () => false }, intent)).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(mocks.scopedClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("ignores a late save response after switching accounts", async () => {
    let active = true;
    mocks.rpc.mockImplementation(async () => {
      active = false;
      return { data: stored, error: null };
    });
    await expect(saveWeekPlan({ ...scope, current: () => active }, intent)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("only requests pinned versions for the scoped owner and leaves missing versions missing", async () => {
    const query = readChain([]);
    const meal = { date: monday, meal: "dinner", recipeVersionId: version, servings: 4 } as const;
    const plan = { ...document, meals: [meal, { ...meal, meal: "lunch" as const }] };
    await expect(loadPlannedRecipeVersions(scope, plan)).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith("kitchen_recipe_versions");
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("user_id", owner);
    expect(query.in).toHaveBeenCalledExactlyOnceWith("id", [version]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
