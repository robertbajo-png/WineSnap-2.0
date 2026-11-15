import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefError, type FoodMemoryScope } from "./api";
const harness = vi.hoisted(() => ({
  effects: [] as (() => () => void)[],
  setters: [] as ReturnType<typeof vi.fn>[],
  refs: [] as { current: unknown }[],
}));
const mocks = vi.hoisted(() => ({ fresh: vi.fn(), refresh: vi.fn() }));
vi.mock("react", () => ({
  useState(value: unknown) {
    const set = vi.fn();
    harness.setters.push(set);
    return [value, set];
  },
  useRef(value: unknown) {
    const ref = { current: value };
    harness.refs.push(ref);
    return ref;
  },
  useEffect(effect: () => () => void) {
    harness.effects.push(effect);
  },
}));
vi.mock("../meals/useFreshData", () => ({ useFreshData: mocks.fresh }));
import { useFoodMemoryState } from "./useFoodMemoryState";
let win: EventTarget, online: { onLine: boolean }, cleanup: (() => void) | undefined;
let changed = vi.fn<() => void>();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  harness.effects = [];
  harness.setters = [];
  harness.refs = [];
  win = new EventTarget();
  online = { onLine: true };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", online);
  mocks.refresh.mockResolvedValue(true);
  mocks.fresh.mockReturnValue({
    data: { signals: [], feedback: [], revision: 1 },
    error: "",
    refresh: mocks.refresh,
  });
  changed = vi.fn<() => void>();
});
afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(offline = false) {
  // Exercise request lifetimes with mocked React primitives; browser rendering is separate.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useFoodMemoryState("synthetic-owner", offline, changed);
  cleanup = harness.effects[0]();
  return state;
}
const savedMessage = "Synthetic saved message";
describe("food memory operation recovery", () => {
  it("clears a saved draft only after a known success and reloads once", async () => {
    const state = mount(),
      saved = vi.fn();
    const action = vi.fn(async (scope: FoodMemoryScope) => {
      expect(scope.current()).toBe(true);
      expect(scope.signal.aborted).toBe(false);
    });
    await state.run(action, savedMessage, saved);
    expect(action).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(harness.setters[3]).toHaveBeenLastCalledWith(savedMessage);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, "throw"])(
    "preserves a committed result when rereading fails: %s",
    async (failed) => {
      if (failed === "throw") mocks.refresh.mockRejectedValueOnce(Error("private-canary"));
      else mocks.refresh.mockResolvedValueOnce(false);
      const state = mount(),
        saved = vi.fn(),
        action = vi.fn(async () => {});
      await state.run(action, savedMessage, saved);
      expect(saved).toHaveBeenCalledOnce();
      expect(harness.setters[0]).toHaveBeenLastCalledWith("read");
      expect(harness.setters[3]).toHaveBeenLastCalledWith(expect.stringContaining(savedMessage));
      await state.run(action, savedMessage, saved);
      expect(action).toHaveBeenCalledOnce();
      mocks.refresh.mockResolvedValue(true);
      await state.reload();
      expect(action).toHaveBeenCalledOnce();
      expect(saved).toHaveBeenCalledOnce();
      expect(harness.setters[0]).toHaveBeenLastCalledWith("none");
    },
  );
  it("keeps an uncertain attempt blocked through background and manual reads until explicit completion", async () => {
    const state = mount(),
      saved = vi.fn(),
      action = vi.fn(async () => {
        throw Error("private-canary");
      });
    await state.run(action, savedMessage, saved);
    expect(harness.setters[0]).toHaveBeenLastCalledWith("uncertain");
    expect(harness.setters[2]).not.toHaveBeenCalledWith(expect.stringContaining("private-canary"));
    expect(saved).not.toHaveBeenCalled();
    expect(state.finishUncertain()).toBe(false);
    await state.run(action, savedMessage, saved);
    expect(action).toHaveBeenCalledOnce();
    await state.reload();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("review");
    await state.run(action, savedMessage, saved);
    expect(action).toHaveBeenCalledOnce();
    expect(saved).not.toHaveBeenCalled();
    expect(state.finishUncertain()).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("none");
  });
  it("does not finish an uncertain attempt after another failed read", async () => {
    const state = mount();
    await state.run(async () => {
      throw new ChefError(503);
    }, savedMessage);
    mocks.refresh.mockResolvedValue(false);
    await state.reload();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("uncertain");
    expect(state.finishUncertain()).toBe(false);
  });
  it("retains the draft on conflict and uses only a read to recover", async () => {
    const state = mount(),
      saved = vi.fn(),
      action = vi.fn(async () => {
        throw new ChefError(409);
      });
    await state.run(action, savedMessage, saved);
    expect(harness.setters[0]).toHaveBeenLastCalledWith("read");
    expect(saved).not.toHaveBeenCalled();
    await state.reload();
    expect(action).toHaveBeenCalledOnce();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("none");
  });
  it("takes the synchronous lock before a double submit can send another action", async () => {
    let finish!: () => void;
    const state = mount(),
      action = vi.fn(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      );
    const pending = state.run(action, savedMessage);
    await vi.advanceTimersByTimeAsync(0);
    await state.run(action, savedMessage);
    await state.reload();
    expect(action).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("bounds a stalled write and does not accept its late success", async () => {
    let finish!: () => void, signal!: AbortSignal;
    const state = mount(),
      saved = vi.fn();
    const pending = state.run(
      (scope) => {
        signal = scope.signal;
        return new Promise<void>((r) => {
          finish = r;
        });
      },
      savedMessage,
      saved,
    );
    await vi.advanceTimersByTimeAsync(45000);
    await pending;
    expect(signal.aborted).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("uncertain");
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the existing bounded AI window and never retries AI during a read", async () => {
    const state = mount(),
      action = vi.fn(() => new Promise<void>(() => {}));
    const pending = state.run(action, savedMessage, () => {}, 75000);
    await vi.advanceTimersByTimeAsync(45000);
    expect(harness.setters[0]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
    await state.reload();
    expect(action).toHaveBeenCalledOnce();
  });
  it("unmount aborts and prevents all late setters, draft clearing and invalidation", async () => {
    let finish!: () => void, signal!: AbortSignal;
    const state = mount(),
      saved = vi.fn();
    const pending = state.run(
      (scope) => {
        signal = scope.signal;
        return new Promise<void>((r) => {
          finish = r;
        });
      },
      savedMessage,
      saved,
    );
    await vi.advanceTimersByTimeAsync(0);
    cleanup?.();
    cleanup = undefined;
    harness.setters.forEach((set) => set.mockClear());
    await pending;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    for (const set of harness.setters) expect(set).not.toHaveBeenCalled();
    expect(await state.reload()).toBeUndefined();
  });
  it("ignores a delayed operation when the captured account no longer matches", async () => {
    let finish!: () => void;
    const state = mount(),
      saved = vi.fn();
    const pending = state.run(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
      savedMessage,
      saved,
    );
    await vi.advanceTimersByTimeAsync(0);
    harness.refs[1].current = "synthetic-peer";
    harness.setters.forEach((set) => set.mockClear());
    finish();
    await pending;
    expect(saved).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    for (const set of harness.setters) expect(set).not.toHaveBeenCalled();
  });
  it("offline aborts an in-flight operation rather than replaying it on reconnect", async () => {
    const state = mount(),
      action = vi.fn(() => new Promise<void>(() => {}));
    const pending = state.run(action, savedMessage);
    await vi.advanceTimersByTimeAsync(0);
    online.onLine = false;
    win.dispatchEvent(new Event("offline"));
    await pending;
    online.onLine = true;
    win.dispatchEvent(new Event("online"));
    await state.run(action, savedMessage);
    expect(action).toHaveBeenCalledOnce();
  });
  it.each(["offline", "loading", "error"])(
    "does not write without usable current reads: %s",
    async (mode) => {
      if (mode !== "offline")
        mocks.fresh.mockReturnValue({
          data: mode === "loading" ? null : {},
          error: mode === "error" ? "failed" : "",
          refresh: mocks.refresh,
        });
      const state = mount(mode === "offline"),
        action = vi.fn();
      await state.run(action, savedMessage);
      expect(action).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    },
  );
});
