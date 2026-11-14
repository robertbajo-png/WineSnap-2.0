import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("./api", () => ({ mealMutationClient: mocks.client }));
import {
  familyChange,
  inviteAccept,
  inviteCreate,
  inviteRevoke,
  mealSave,
  MealMutationError,
} from "./mutations";
import type { MealsScope } from "./api";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  id = "11111111-2222-4333-8444-555555555555";
const other = "99999999-8888-4777-8666-555555555555";
type WriteRpc = (
  name: string,
  input: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code: string } | null }>;
let controller: AbortController, scope: MealsScope, rows: Record<string, unknown>;
let readError: boolean,
  write: ReturnType<typeof vi.fn<WriteRpc>>,
  reads: { table: string; filters: Record<string, unknown>; signal?: AbortSignal }[];
function query(table: string) {
  const entry = {
    table,
    filters: {} as Record<string, unknown>,
    signal: undefined as AbortSignal | undefined,
  };
  reads.push(entry);
  const result = () => ({
    data: rows[table] ?? null,
    error: readError ? { code: "synthetic_read_error" } : null,
  });
  const chain = {
    select: () => chain,
    limit: () => chain,
    eq: (key: string, value: unknown) => {
      entry.filters[key] = value;
      return chain;
    },
    abortSignal: (signal: AbortSignal) => {
      entry.signal = signal;
      return chain;
    },
    maybeSingle: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve(result())),
  };
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  controller = new AbortController();
  scope = { owner, signal: controller.signal, current: () => !controller.signal.aborted };
  rows = {};
  readError = false;
  reads = [];
  write = vi.fn<WriteRpc>(async (_name: string, _input: Record<string, unknown>) => ({
    data: null,
    error: null,
  }));
  mocks.client.mockResolvedValue({
    from: query,
    rpc: (name: string, input: Record<string, unknown>) => ({
      abortSignal: (signal: AbortSignal) => {
        expect(signal).toBe(controller.signal);
        return write(name, input);
      },
    }),
  });
});
const group = (name = "Bordet", revision = 1) => ({ id, user_id: owner, name, revision });
const member = () => ({ id: other, user_id: owner, household_id: id, display_name: "Test" });
const input = () => ({
  sessionId: id,
  wineId: other,
  wineRating: null,
  pairingRating: 4,
  note: "Friskt",
});
const meal = () => ({
  id,
  user_id: owner,
  session_id: id,
  wine_id: other,
  wine_rating: null,
  pairing_rating: 4,
  note: "Friskt",
  food_rating: null,
  revision: 1,
  created_at: "2026-11-14",
  updated_at: "2026-11-14",
});
describe("captured meal mutation attempts", () => {
  it.each([2, 3])(
    "reconciles a renamed household only at the expected revision: %i",
    async (revision) => {
      const attempt = familyChange(owner, "rename_household", id, 1, { name: "New name" });
      rows.kitchen_households = group("New name", revision);
      write.mockResolvedValueOnce({ data: null, error: { code: "" } });
      if (revision === 2) expect(await attempt.execute(scope)).toBe(true);
      else await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "conflict" });
      expect(write).toHaveBeenCalledOnce();
    },
  );
  it("confirms member removal only in the owned household's expected next revision", async () => {
    const attempt = familyChange(owner, "remove_member", id, 1, { userId: other });
    rows.kitchen_households = group("Bordet", 2);
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    expect(await attempt.execute(scope)).toBe(true);
    expect(reads.find((r) => r.table === "kitchen_household_members")?.filters).toEqual({
      household_id: id,
      user_id: other,
    });
  });
  it("reads the owner's membership rather than claiming ownership when leaving a shared household", async () => {
    const attempt = familyChange(owner, "leave_household", id, 1);
    rows.kitchen_household_members = member();
    rows.kitchen_households = { ...group(), user_id: other };
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "uncertain" });
    expect(reads[0].filters).toEqual({ household_id: id, user_id: owner });
    expect(reads[1].filters).toEqual({ id });
    rows.kitchen_household_members = null;
    expect(await attempt.execute(scope, true)).toBe(true);
    expect(write).toHaveBeenCalledOnce();
  });
  it("does not accept a foreign owner's row during household reconciliation", async () => {
    rows.kitchen_households = { ...group("New", 2), user_id: other };
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    await expect(
      familyChange(owner, "rename_household", id, 1, { name: "New" }).execute(scope),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
  it("confirms revocation and meal deletion from exact-owner read-back without repeating them", async () => {
    rows.kitchen_household_invites = {
      id,
      user_id: owner,
      household_id: other,
      expires_at: "2099-01-01T00:00:00Z",
      revoked_at: "2026-11-14",
      used_at: null,
    };
    write.mockResolvedValue({ data: null, error: { code: "" } });
    expect(await inviteRevoke(owner, id).execute(scope)).toBe(true);
    expect(await mealSave(owner, id, 1, null).execute(scope)).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(reads.every((r) => r.filters.user_id === owner && r.filters.id === id)).toBe(true);
  });
  it("reconciles a lost household insert response with its original ID and immutable input", async () => {
    const data = { name: "Bordet", displayName: "Test", adultConfirmed: true };
    const attempt = familyChange(owner, "create_household", id, 0, data);
    data.name = "Changed after submission";
    write.mockImplementationOnce(async (_name, payload) => {
      expect(payload._id).toBe(id);
      expect(payload._data).toMatchObject({ name: "Bordet" });
      rows.kitchen_households = group();
      rows.kitchen_household_members = member();
      return { data: null, error: { code: "" } };
    });
    expect(await attempt.execute(scope)).toBe(true);
    expect(await attempt.execute(scope)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(reads.every((r) => r.signal === controller.signal)).toBe(true);
  });
  it("never resends a write after failed reconciliation and retains the same household ID", async () => {
    const attempt = familyChange(owner, "create_household", id, 0, {
      name: "Bordet",
      displayName: "Test",
      adultConfirmed: true,
    });
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    readError = true;
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "uncertain" });
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "uncertain" });
    expect(write).toHaveBeenCalledTimes(1);
    readError = false;
    expect(await attempt.execute(scope, true)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await attempt.execute(scope)).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][1]).toEqual(write.mock.calls[0][1]);
  });
  it("reconciles a committed meal without a second RPC and keeps nullable ratings", async () => {
    const attempt = mealSave(owner, id, 0, input());
    write.mockImplementationOnce(async () => {
      rows.meal_wine_links = meal();
      return { data: null, error: { code: "" } };
    });
    expect(await attempt.execute(scope)).toBe(true);
    expect(await attempt.execute(scope)).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][1]._input).toMatchObject({ wineRating: null });
    expect(reads[0].filters).toEqual({ id, user_id: owner });
  });
  it("will not overwrite a newer meal revision when retrying an unknown result", async () => {
    const attempt = mealSave(owner, id, 1, input());
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    rows.meal_wine_links = { ...meal(), revision: 3, note: "Another edit" };
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "conflict" });
    expect(write).toHaveBeenCalledOnce();
  });
  it.each(["delete_diner", "delete_household"] as const)(
    "confirms an already removed %s without replay",
    async (action) => {
      const attempt = familyChange(owner, action, id, 1);
      write.mockResolvedValueOnce({ data: null, error: { code: "" } });
      expect(await attempt.execute(scope)).toBe(true);
      expect(await attempt.execute(scope)).toBe(true);
      expect(write).toHaveBeenCalledOnce();
    },
  );
  it("does not turn a server denial into a false deletion confirmation", async () => {
    write.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(familyChange(owner, "delete_diner", id, 1).execute(scope)).rejects.toMatchObject({
      kind: "rejected",
    });
    expect(reads).toEqual([]);
  });
  it("checks original diner content and its next revision after a lost reply", async () => {
    const document = { name: "Barn", kind: "child" as const, preferences: [] };
    const attempt = familyChange(owner, "save_diner", id, 0, {
      document,
      householdId: null,
      shared: false,
    });
    rows.kitchen_diners = {
      id,
      user_id: owner,
      household_id: null,
      shared: false,
      document,
      revision: 1,
      created_at: "2026-11-14",
      updated_at: "2026-11-14",
    };
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    expect(await attempt.execute(scope)).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][1]._data).toMatchObject({ document: { kind: "child" } });
  });
  it("retains the same invitation ID, token and hash after a lost reply", async () => {
    const attempt = inviteCreate(owner, id, 1);
    write.mockImplementationOnce(async (_name, payload) => {
      rows.kitchen_household_invites = {
        id: payload._id,
        user_id: owner,
        household_id: id,
        token_hash: payload._hash,
        expires_at: "2099-01-01T00:00:00Z",
        used_at: null,
        revoked_at: null,
      };
      return { data: null, error: { code: "" } };
    });
    expect(await attempt.execute(scope)).toBe(true);
    expect(await attempt.execute(scope)).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(attempt.value).toMatch(/^[a-f0-9]{64}$/);
    expect(reads[0].filters.user_id).toBe(owner);
  });
  it("cannot confirm an invitation that has already been revoked", async () => {
    const attempt = inviteCreate(owner, id, 1);
    write.mockImplementationOnce(async (_name, payload) => {
      rows.kitchen_household_invites = {
        id: payload._id,
        user_id: owner,
        household_id: id,
        token_hash: payload._hash,
        expires_at: "2099-01-01T00:00:00Z",
        used_at: null,
        revoked_at: "2026-11-14",
      };
      return { data: null, error: { code: "" } };
    });
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "conflict" });
  });
  it("retries acceptance only explicitly through its same idempotent token RPC", async () => {
    rows.kitchen_household_members = [member()];
    const attempt = inviteAccept(owner, "a".repeat(64), "Test", true);
    write.mockResolvedValueOnce({ data: null, error: { code: "" } });
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "uncertain" });
    expect(await attempt.execute(scope, true)).toBe(false);
    expect(write).toHaveBeenCalledOnce();
    write.mockResolvedValueOnce({ data: { status: "joined", householdId: id }, error: null });
    expect(await attempt.execute(scope)).toBe(true);
    expect(write.mock.calls[1][1]).toEqual(write.mock.calls[0][1]);
  });
  it("preserves invitation rate limiting without automatic retries", async () => {
    write.mockResolvedValueOnce({ data: { status: "rate_limited" }, error: null });
    await expect(
      inviteAccept(owner, "a".repeat(64), "Test", true).execute(scope),
    ).rejects.toMatchObject({ kind: "rate_limited" });
    expect(write).toHaveBeenCalledOnce();
  });
  it.each([
    familyChange(owner, "delete_diner", id, 1),
    mealSave(owner, id, 0, input()),
    inviteRevoke(owner, id),
  ])("rejects a different or cancelled account before authorization", async (attempt) => {
    await expect(attempt.execute({ ...scope, owner: other })).rejects.toBeInstanceOf(
      MealMutationError,
    );
    controller.abort();
    await expect(attempt.execute(scope)).rejects.toMatchObject({ kind: "changed" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("cannot begin an RPC after account verification completes late", async () => {
    mocks.client.mockImplementationOnce(async () => {
      controller.abort();
      return {};
    });
    await expect(mealSave(owner, id, 0, input()).execute(scope)).rejects.toMatchObject({
      kind: "changed",
    });
    expect(write).not.toHaveBeenCalled();
  });
});
