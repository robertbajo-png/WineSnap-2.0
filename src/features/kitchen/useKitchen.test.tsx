import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { retryPendingCookingSync } from "./retry";

let stop: (() => void) | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});
function start(run = vi.fn().mockResolvedValue(undefined), canRun = vi.fn(() => true)) {
  const focus = new EventTarget(),
    visibility = new EventTarget();
  stop = retryPendingCookingSync({ run, canRun, focus, visibility });
  return { run, canRun, focus, visibility };
}
describe("pending cooking network retries", () => {
  it("retries without an online event with bounded exponential backoff", async () => {
    const { run } = start();
    await vi.advanceTimersByTimeAsync(4999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20000);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30000);
    expect(run).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30000);
    expect(run).toHaveBeenCalledTimes(5);
  });
  it("does not send requests while unavailable or hidden", async () => {
    const { run, canRun, visibility } = start(
      undefined,
      vi.fn(() => false),
    );
    await vi.advanceTimersByTimeAsync(65000);
    expect(run).not.toHaveBeenCalled();
    canRun.mockReturnValue(true);
    visibility.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();
  });
  it("can retry immediately when returning to the foreground", async () => {
    const { run, focus } = start();
    focus.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("does not start overlapping retry operations", async () => {
    let finish: () => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { focus, visibility } = start(run);
    await vi.advanceTimersByTimeAsync(5000);
    focus.dispatchEvent(new Event("focus"));
    visibility.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledOnce();
    stop?.();
    finish();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledOnce();
  });
  it("removes timers and foreground listeners when stopped", async () => {
    const { run, focus, visibility } = start();
    stop?.();
    focus.dispatchEvent(new Event("focus"));
    visibility.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).not.toHaveBeenCalled();
  });
  it("keeps transient rejections handled until the workspace cancels", async () => {
    const run = vi.fn().mockRejectedValue(new Error("synthetic network failure"));
    start(run);
    await vi.advanceTimersByTimeAsync(15000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("is gated to pending network errors, owner, visibility and no conflict", () => {
    const source = readFileSync(new URL("./useKitchen.ts", import.meta.url), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(source).toContain(
      'setRetryable(cause instanceof KitchenError && cause.kind === "network")',
    );
    expect(source).toContain(
      "if (!retryable || !ready || offline || !cache?.session?.dirty || conflict) return;",
    );
    expect(source).toContain("ownerRef.current === owner");
    expect(source).toContain('document.visibilityState === "visible"');
  });
});
