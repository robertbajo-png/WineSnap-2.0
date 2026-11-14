import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  effects: [] as (() => () => void)[],
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => {
    const set = vi.fn();
    harness.setters.push(set);
    return [value, set];
  },
  useEffect: (effect: () => () => void) => harness.effects.push(effect),
}));
import { useMealMutation } from "./useMealMutation";
import { MealMutationError, type MealAttempt } from "./mutations";
import type { MealsScope } from "./api";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
let cleanup: (() => void) | undefined, win: EventTarget, network: { onLine: boolean };
beforeEach(() => {
  vi.useFakeTimers();
  harness.effects = [];
  harness.setters = [];
  win = new EventTarget();
  network = { onLine: true };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", network);
});
afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(refresh = vi.fn().mockResolvedValue(true)) {
  // Mocked React primitives isolate cancellation and synchronous duplicate-submit guards.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const value = useMealMutation(owner, refresh);
  cleanup = harness.effects[0]();
  return { value, refresh };
}
const settle = () => vi.advanceTimersByTimeAsync(0);
function attempt(execute = vi.fn().mockResolvedValue(true)): MealAttempt<string> {
  return { owner, started: true, value: "synthetic result", execute };
}
describe("meal mutation UI lifetime", () => {
  it("allows only one submission before React can render disabled controls", async () => {
    const { value, refresh } = mount();
    const saved = vi.fn();
    const build = vi.fn(() => attempt());
    value.run(build, saved);
    value.run(build, saved);
    await settle();
    expect(build).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledExactlyOnceWith("synthetic result");
    expect(refresh).toHaveBeenCalledOnce();
    expect(harness.setters[3]).toHaveBeenLastCalledWith("Sparat.");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("distinguishes committed data from a failed post-write reload", async () => {
    const { value } = mount(vi.fn().mockResolvedValue(false));
    const saved = vi.fn();
    value.run(() => attempt(), saved, "Måltiden sparades.");
    await settle();
    expect(saved).toHaveBeenCalledOnce();
    expect(harness.setters[3]).toHaveBeenLastCalledWith(
      expect.stringContaining("Listan kunde inte läsas om"),
    );
    expect(harness.setters[4]).toHaveBeenLastCalledWith("error");
  });
  it("keeps the exact unknown attempt and requires explicit read recovery before retrying", async () => {
    const { value } = mount();
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new MealMutationError("uncertain"))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const original = attempt(execute);
    const next = vi.fn(() => attempt());
    value.run(() => original);
    await settle();
    await value.retry();
    expect(execute).toHaveBeenCalledOnce();
    value.run(next);
    expect(next).not.toHaveBeenCalled();
    await value.inspect();
    expect(execute.mock.calls[1][1]).toBe(true);
    await value.retry();
    expect(execute.mock.calls[2][1]).toBe(false);
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("does not publish or close forms after unmount, even if a request ignores cancellation", async () => {
    const { value, refresh } = mount();
    let resolve!: (v: boolean) => void;
    let scope!: MealsScope;
    const execute = vi.fn((s: MealsScope) => {
      scope = s;
      return new Promise<boolean>((r) => {
        resolve = r;
      });
    });
    const saved = vi.fn();
    value.run(() => attempt(execute), saved);
    await settle();
    cleanup?.();
    cleanup = undefined;
    harness.setters.forEach((s) => s.mockClear());
    resolve(true);
    await settle();
    expect(scope.signal.aborted).toBe(true);
    expect(scope.current()).toBe(false);
    expect(saved).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(harness.setters.every((s) => s.mock.calls.length === 0)).toBe(true);
  });
  it("bounds a stalled write and does not replay it on reconnect", async () => {
    const { value } = mount();
    let scope!: MealsScope;
    const execute = vi.fn((s: MealsScope) => {
      scope = s;
      return new Promise<boolean>(() => {});
    });
    value.run(() => attempt(execute));
    await settle();
    await vi.advanceTimersByTimeAsync(45000);
    expect(scope.signal.aborted).toBe(true);
    expect(harness.setters[3]).toHaveBeenLastCalledWith(
      expect.stringContaining("kan redan vara sparad"),
    );
    win.dispatchEvent(new Event("online"));
    await settle();
    expect(execute).toHaveBeenCalledOnce();
  });
  it("offline aborts a pending request and later results cannot report success", async () => {
    const { value } = mount();
    let resolve!: (v: boolean) => void;
    const execute = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    const saved = vi.fn();
    value.run(() => attempt(execute), saved);
    await settle();
    network.onLine = false;
    win.dispatchEvent(new Event("offline"));
    await settle();
    resolve(true);
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
