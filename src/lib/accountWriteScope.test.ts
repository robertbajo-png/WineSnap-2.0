import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), scoped: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session, getUser: mocks.user } },
}));
vi.mock("./scopedClient", () => ({ scopedClient: mocks.scoped }));
import { accountWriteClient } from "./accountWriteScope";
const scope = { owner: "owner-a", current: () => true };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: "owner-a" }, access_token: "synthetic-account-token" } },
    error: null,
  });
  mocks.user.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
  mocks.scoped.mockReturnValue({ syntheticClient: true });
});
describe("verified account write binding", () => {
  it.each(["session", "user"] as const)(
    "bounds a stalled %s check without starting a later write",
    async (stage) => {
      mocks[stage].mockImplementation(() => new Promise(() => {}));
      await expect(accountWriteClient(scope, 10)).rejects.toThrow("account_verification_timeout");
      expect(mocks.scoped).not.toHaveBeenCalled();
    },
  );
  it("captures the verified ordinary JWT, not a later global session", async () => {
    expect(await accountWriteClient(scope)).toEqual({ syntheticClient: true });
    expect(mocks.user).toHaveBeenCalledExactlyOnceWith("synthetic-account-token");
    expect(mocks.scoped).toHaveBeenCalledExactlyOnceWith("synthetic-account-token", 15000);
  });
  it("rejects a new account before constructing a write client", async () => {
    mocks.session.mockResolvedValue({ data: { session: { user: { id: "owner-b" } } } });
    await expect(accountWriteClient(scope)).rejects.toThrow();
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
  it.each([
    { data: { session: null }, error: null },
    { data: {}, error: { message: "synthetic" } },
  ])("rejects missing/unavailable sessions", async (value) => {
    mocks.session.mockResolvedValue(value);
    await expect(accountWriteClient(scope)).rejects.toThrow();
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
  it("rejects a revoked or differently verified owner", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: "owner-b" } }, error: null });
    await expect(accountWriteClient(scope)).rejects.toThrow();
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
  it("rejects an unmounted scope even when the original JWT remains valid", async () => {
    let current = true;
    mocks.user.mockImplementation(async () => {
      current = false;
      return { data: { user: { id: "owner-a" } } };
    });
    await expect(accountWriteClient({ ...scope, current: () => current })).rejects.toThrow();
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
});
