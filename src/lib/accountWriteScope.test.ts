import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), scoped: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session, getUser: mocks.user } },
}));
vi.mock("./scopedClient", () => ({ scopedClient: mocks.scoped }));
import { accountWriteClient, readSessionWithDeadline } from "./accountWriteScope";
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("verified account write binding", () => {
  it("does not start verification for an already cancelled view", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(accountWriteClient(scope, 15000, controller.signal)).rejects.toThrow(
      "account_scope_changed",
    );
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
  it.each(["session", "user"] as const)(
    "bounds a stalled %s check without starting a later write",
    async (stage) => {
      mocks[stage].mockImplementation(() => new Promise(() => {}));
      await expect(accountWriteClient(scope, 10)).rejects.toThrow("account_verification_timeout");
      expect(mocks.scoped).not.toHaveBeenCalled();
    },
  );
  it.each(["session", "user"] as const)(
    "cancels a pending %s check and ignores its late result",
    async (stage) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      let finish!: (value: unknown) => void;
      mocks[stage].mockImplementation(() => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const pending = accountWriteClient(scope, 15000, controller.signal);
      const rejected = expect(pending).rejects.toThrow("account_scope_changed");
      await entered;
      controller.abort();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
      finish(
        stage === "session"
          ? {
              data: {
                session: { user: { id: scope.owner }, access_token: "synthetic-late-token" },
              },
              error: null,
            }
          : { data: { user: { id: scope.owner } }, error: null },
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(mocks.scoped).not.toHaveBeenCalled();
      if (stage === "session") expect(mocks.user).not.toHaveBeenCalled();
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

describe("bounded cached-session lookup", () => {
  it("stops a stalled SDK lookup at fifteen seconds without authorizing a write", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    mocks.session.mockImplementation(() => new Promise(() => {}));
    const pending = readSessionWithDeadline(controller.signal);
    const rejected = expect(pending).rejects.toThrow("account_verification_timeout");
    await vi.advanceTimersByTimeAsync(14999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "cleans its deadline and listener after lookup rejection=%s",
    async (reject) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      if (reject) mocks.session.mockRejectedValue(new Error("synthetic_lookup_failure"));
      const pending = readSessionWithDeadline(controller.signal);
      if (reject) await expect(pending).rejects.toThrow("synthetic_lookup_failure");
      else expect((await pending).data.session?.user.id).toBe(scope.owner);
      expect(vi.getTimerCount()).toBe(0);
      expect(add).toHaveBeenCalledExactlyOnceWith("abort", expect.any(Function), { once: true });
      expect(remove).toHaveBeenCalledExactlyOnceWith("abort", add.mock.calls[0][1]);
      controller.abort();
      expect(mocks.scoped).not.toHaveBeenCalled();
    },
  );
  it("contains a synchronous SDK throw and clears its deadline", async () => {
    vi.useFakeTimers();
    mocks.session.mockImplementation(() => {
      throw new Error("synthetic_sync_lookup_failure");
    });
    await expect(readSessionWithDeadline()).rejects.toThrow("synthetic_sync_lookup_failure");
    expect(vi.getTimerCount()).toBe(0);
  });
});
