import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  legacy: vi.fn(),
  captured: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session }, functions: { invoke: mocks.legacy } },
}));
vi.mock("./accountWriteScope", async (original) => ({
  ...(await original<typeof import("./accountWriteScope")>()),
  accountWriteClient: mocks.client,
}));
import { invokeAi } from "./aiTransport";
const scope = { owner: "owner-a", current: () => true };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_LOCAL_AI_ENABLED", "false");
  mocks.client.mockResolvedValue({ functions: { invoke: mocks.captured } });
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: "owner-a" }, access_token: "synthetic-user-jwt" } },
    error: null,
  });
  mocks.legacy.mockResolvedValue({ data: {}, error: null });
  mocks.captured.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("cancellable, account-bound AI transport", () => {
  it("retains the legacy call contract for unrelated callers", async () => {
    await invokeAi("wine-suggestions", { wineId: "wine-a" });
    expect(mocks.legacy).toHaveBeenCalledExactlyOnceWith("wine-suggestions", {
      body: { wineId: "wine-a" },
    });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses only the captured client's token and forwards abort to hosted functions", async () => {
    const controller = new AbortController();
    await invokeAi("wine-suggestions", { wineId: "wine-a" }, { scope, signal: controller.signal });
    expect(mocks.client).toHaveBeenCalledWith(scope, 75000, controller.signal);
    expect(mocks.captured).toHaveBeenCalledWith("wine-suggestions", {
      body: { wineId: "wine-a" },
      signal: controller.signal,
    });
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("does not submit after a scope or view is invalidated", async () => {
    const controller = new AbortController();
    controller.abort();
    await invokeAi("wine-suggestions", {}, { scope, signal: controller.signal });
    expect(mocks.captured).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not start verification for an already stale account scope", async () => {
    const result = await invokeAi(
      "wine-suggestions",
      {},
      {
        scope: { ...scope, current: () => false },
        signal: new AbortController().signal,
      },
    );
    expect(result.error?.context.status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("does not send a hosted request after verification finishes for an invalidated view", async () => {
    const controller = new AbortController();
    mocks.client.mockImplementation(async () => {
      controller.abort();
      return { functions: { invoke: mocks.captured } };
    });
    const result = await invokeAi("wine-suggestions", {}, { scope, signal: controller.signal });
    expect(result.error?.context.status).toBe(401);
    expect(mocks.captured).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("contains a rejected local session lookup without exposing its diagnostic", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    mocks.session.mockRejectedValue(new Error("synthetic_private_auth_diagnostic"));
    const result = await invokeAi("wine-suggestions", {});
    expect(result.data).toBeNull();
    expect(result.error?.context.status).toBe(503);
    expect(request).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("synthetic_private_auth_diagnostic");
  });
  it("settles a stalled local session lookup after fifteen seconds without sending AI", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    mocks.session.mockImplementation(() => new Promise(() => {}));
    const pending = invokeAi("wine-suggestions", {});
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;
    expect(result.data).toBeNull();
    expect(result.error?.context.status).toBe(503);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels a pending local session lookup and ignores its late response", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    const controller = new AbortController();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (value: unknown) => void;
    mocks.session.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = invokeAi("wine-suggestions", {}, { scope, signal: controller.signal });
    await entered;
    controller.abort();
    const result = await pending;
    expect(result.data).toBeNull();
    expect(result.error?.context.status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
    finish({
      data: { session: { user: { id: scope.owner }, access_token: "synthetic-late-jwt" } },
      error: null,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects an account change during local-session retrieval without sending AI", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    mocks.session.mockResolvedValue({
      data: { session: { user: { id: "owner-b" }, access_token: "synthetic-other-jwt" } },
      error: null,
    });
    const result = await invokeAi(
      "wine-suggestions",
      {},
      { scope, signal: new AbortController().signal },
    );
    expect(result.error?.context.status).toBe(401);
    expect(request).not.toHaveBeenCalled();
  });
  it("combines local request cancellation with the existing provider deadline", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    const request = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.headers).toMatchObject({ Authorization: "Bearer synthetic-user-jwt" });
      return Response.json({ suggestions: [] });
    });
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    await invokeAi("wine-suggestions", {}, { scope, signal: controller.signal });
    controller.abort();
    expect(request.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
