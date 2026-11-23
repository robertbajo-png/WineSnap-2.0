import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/accountWriteScope", () => ({ accountWriteClient: mocks.capture }));
vi.mock("./feature", () => ({ mealsEnabled: true }));
import { familyData, cellarWines, mealHistory, MealsError, ownedPlanDiners } from "./api";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
let reads: { table: string; signal?: AbortSignal; owner?: string }[],
  gateAllowed: boolean,
  duringGate: (() => void) | undefined;
let gateSignals: AbortSignal[], failTable: string | undefined, dinerRows: unknown[];
function query(table: string) {
  const read: (typeof reads)[number] = { table };
  reads.push(read);
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      if (column === "user_id") read.owner = value;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    gt: () => chain,
    is: () => chain,
    in: () => chain,
    abortSignal: (signal: AbortSignal) => {
      read.signal = signal;
      return chain;
    },
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve(
        resolve({
          data: table === "kitchen_diners" ? dinerRows : [],
          error:
            failTable === table || read.signal?.aborted ? { code: "synthetic_read_failure" } : null,
        }),
      ),
  };
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  reads = [];
  gateSignals = [];
  gateAllowed = true;
  duringGate = undefined;
  failTable = undefined;
  dinerRows = [];
  mocks.capture.mockResolvedValue({
    from: query,
    rpc: (name: string) => {
      expect(name).toBe("meals_access");
      return {
        abortSignal: async (signal: AbortSignal) => {
          gateSignals.push(signal);
          duringGate?.();
          return { data: gateAllowed, error: null };
        },
      };
    },
  });
});
describe("bounded shared meal reads", () => {
  it("requests only the planner owner's diners and rejects an unexpected foreign profile", async () => {
    const signal = new AbortController().signal;
    await expect(ownedPlanDiners(owner, signal)).resolves.toEqual([]);
    expect(reads).toEqual([{ table: "kitchen_diners", signal, owner }]);
    dinerRows = [
      {
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1",
        user_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2",
        household_id: null,
        shared: true,
        revision: 1,
        document: { name: "Synthetic diner", kind: "adult", preferences: [] },
        created_at: "2026-11-23T10:00:00Z",
        updated_at: "2026-11-23T10:00:00Z",
      },
    ];
    await expect(ownedPlanDiners(owner, signal)).rejects.toBeInstanceOf(MealsError);
  });
  it("uses the ordinary verified account client and forwards one cancellation scope to every family read", async () => {
    const controller = new AbortController();
    const result = await familyData(owner, controller.signal);
    expect(result).toEqual({ groups: [], diners: [], members: [], invites: [] });
    expect(mocks.capture).toHaveBeenCalledWith(
      { owner, current: expect.any(Function) },
      15000,
      controller.signal,
    );
    expect(gateSignals).toEqual([controller.signal]);
    expect(reads).toHaveLength(4);
    expect(reads.every((r) => r.signal === controller.signal)).toBe(true);
    const scope = mocks.capture.mock.calls[0][0];
    expect(scope.current()).toBe(true);
    controller.abort();
    expect(scope.current()).toBe(false);
  });
  it.each([familyData, cellarWines, mealHistory])(
    "does not start reads after cancellation during authorization",
    async (load) => {
      const controller = new AbortController();
      duringGate = () => controller.abort();
      await expect(load(owner, controller.signal)).rejects.toBeInstanceOf(MealsError);
      expect(reads).toHaveLength(0);
    },
  );
  it("does not start the gate after already cancelled verification", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(familyData(owner, controller.signal)).rejects.toBeInstanceOf(MealsError);
    expect(gateSignals).toEqual([]);
    expect(reads).toEqual([]);
  });
  it("retains the independent database feature gate", async () => {
    gateAllowed = false;
    await expect(familyData(owner)).rejects.toBeInstanceOf(MealsError);
    expect(reads).toEqual([]);
  });
  it("maps verification errors to the safe existing meal error", async () => {
    mocks.capture.mockRejectedValue(new Error("synthetic_private_verification_details"));
    await expect(familyData(owner)).rejects.toThrow("Kontrollera");
    await expect(familyData(owner)).rejects.not.toThrow("synthetic_private_verification_details");
  });
  it("does not return a partial family snapshot after a member read fails", async () => {
    failTable = "kitchen_household_members";
    await expect(familyData(owner)).rejects.toBeInstanceOf(MealsError);
  });
  it("forwards cancellation to cellar/history reads without altering their empty results", async () => {
    const controller = new AbortController();
    expect(await cellarWines(owner, controller.signal)).toEqual({ wines: [], truncated: false });
    expect(await mealHistory(owner, controller.signal)).toEqual({
      meals: [],
      titles: {},
      wineNames: {},
      truncated: false,
    });
    expect(reads.every((r) => r.signal === controller.signal)).toBe(true);
  });
});
