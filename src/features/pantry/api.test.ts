import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmPantryConsumption,
  loadConsumptionReview,
  loadPantry,
  loadPantryReceipt,
  savePantryItem,
} from "./api";

const mocks = vi.hoisted(() => ({ scoped: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/accountWriteScope", () => ({ accountWriteClient: mocks.scoped }));

const uuid = (n: number) => `12345678-1234-4234-8234-${n.toString().padStart(12, "0")}`;
const owner = uuid(1);
const peer = uuid(2);
const itemId = uuid(3);
const requestId = uuid(4);
const sessionId = uuid(5);
const stamp = "2026-11-23T10:00:00.000Z";
const scope = () => ({ owner, current: vi.fn(() => true) });
const item = { name: "Tomater", amount: 400, unit: "g", confirmed: true } as const;
const saved = {
  user_id: owner,
  revision: 1,
  items: [{ id: itemId, name: "Tomater", amount: 400, unit: "g", confirmedAt: stamp }],
  last_request_id: requestId,
  updated_at: stamp,
};
const edit = { itemId, requestId, expectedRevision: 0, item };
const used = [{ itemId, amount: 120 }];
const reduction = { sessionId, requestId, expectedRevision: 1, sessionRevision: 2, items: used };
const receipt = {
  session_id: sessionId,
  user_id: owner,
  pantry_revision: 2,
  request_id: requestId,
  items: [{ ...used[0], name: "Tomater", unit: "g" }],
  confirmed_at: stamp,
};
const pantry = { ...saved, revision: 2, items: [{ ...saved.items[0], amount: 280 }] };
const ok = (data: unknown) => ({ data, error: null });
let query: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  abortSignal: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
  query = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.abortSignal.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.scoped.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
});

describe("account-scoped pantry data", () => {
  it("requires a persisted completed session before requesting stock and a receipt", async () => {
    const session = {
      id: sessionId,
      user_id: owner,
      recipe_version_id: uuid(8),
      revision: 2,
      state: {
        status: "running",
        activeStep: 0,
        servings: 3,
        checkedIngredientIds: [],
        timers: [],
      },
      last_request_id: requestId,
      updated_at: stamp,
    };
    query.maybeSingle.mockResolvedValueOnce(ok(session));
    await expect(
      loadConsumptionReview(scope(), sessionId, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(mocks.from.mock.calls).toEqual([["cooking_sessions"]]);
  });
  it("pins all reads to the active owner and the receipt to its exact session", async () => {
    query.maybeSingle.mockResolvedValueOnce(ok(saved)).mockResolvedValueOnce(ok(receipt));
    const current = scope();
    await expect(loadPantry(current)).resolves.toEqual(saved);
    await expect(loadPantryReceipt(current, sessionId)).resolves.toEqual(receipt);
    expect(mocks.from.mock.calls).toEqual([["kitchen_pantry"], ["kitchen_pantry_consumption"]]);
    expect(query.eq.mock.calls).toEqual([
      ["user_id", owner],
      ["user_id", owner],
      ["session_id", sessionId],
    ]);
    expect(mocks.scoped).toHaveBeenCalledWith(current, 15000, undefined);
  });

  it("rejects late or foreign reads even if the transport says success", async () => {
    query.maybeSingle.mockResolvedValueOnce(ok({ ...saved, user_id: peer }));
    await expect(loadPantry(scope())).rejects.toMatchObject({ kind: "unavailable" });
    const current = scope();
    query.maybeSingle.mockImplementationOnce(async () => {
      current.current.mockReturnValue(false);
      return ok(saved);
    });
    await expect(loadPantry(current)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("requires the saved amount, unit, revision and request ID in a stock acknowledgement", async () => {
    mocks.rpc.mockResolvedValueOnce(ok(saved));
    await expect(savePantryItem(scope(), edit)).resolves.toEqual(saved);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("kitchen_save_pantry_item", {
      _item_id: itemId,
      _expected_revision: 0,
      _request_id: requestId,
      _item: item,
    });
    for (const wrong of [
      { ...saved, user_id: peer },
      { ...saved, revision: 2 },
      { ...saved, last_request_id: uuid(6) },
      { ...saved, items: [{ ...saved.items[0], amount: 200 }] },
      { ...saved, items: [{ ...saved.items[0], confirmedAt: null }] },
    ]) {
      mocks.rpc.mockResolvedValueOnce(ok(wrong));
      await expect(savePantryItem(scope(), edit)).rejects.toMatchObject({ kind: "unknown" });
    }
  });

  it("does not send invalid selections and does not retry a conflict", async () => {
    await expect(
      confirmPantryConsumption(scope(), { ...reduction, items: [used[0], used[0]] }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    await expect(confirmPantryConsumption(scope(), reduction)).rejects.toMatchObject({
      kind: "conflict",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("accepts an exact receipt once but rejects any other session, amount or owner", async () => {
    mocks.rpc.mockResolvedValueOnce(ok({ pantry, receipt }));
    await expect(confirmPantryConsumption(scope(), reduction)).resolves.toEqual({
      pantry,
      receipt,
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("kitchen_confirm_pantry_consumption", {
      _session_id: sessionId,
      _session_revision: 2,
      _expected_revision: 1,
      _request_id: requestId,
      _used: used,
    });
    for (const wrong of [
      { ...receipt, session_id: uuid(7) },
      { ...receipt, user_id: peer },
      { ...receipt, items: [{ ...receipt.items[0], amount: 1 }] },
    ]) {
      mocks.rpc.mockResolvedValueOnce(ok({ pantry, receipt: wrong }));
      await expect(confirmPantryConsumption(scope(), reduction)).rejects.toMatchObject({
        kind: "unknown",
      });
    }
  });
});
