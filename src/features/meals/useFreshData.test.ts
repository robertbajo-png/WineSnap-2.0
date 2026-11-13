import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  effects: [] as (() => () => void)[],
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", () => ({
  useState(value: unknown) {
    const set = vi.fn();
    harness.setters.push(set);
    return [value, set];
  },
  useRef(value: unknown) {
    return { current: value };
  },
  useCallback<T>(callback: T) {
    return callback;
  },
  useEffect(effect: () => () => void) {
    harness.effects.push(effect);
  },
}));
import { useFreshData } from "./useFreshData";
let win: EventTarget,
  doc: EventTarget,
  network: { onLine: boolean },
  clean: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  harness.effects = [];
  harness.setters = [];
  win = new EventTarget();
  doc = new EventTarget();
  network = { onLine: true };
  vi.stubGlobal("window", Object.assign(win, { setInterval, clearInterval }));
  vi.stubGlobal("document", Object.assign(doc, { visibilityState: "visible" }));
  vi.stubGlobal("navigator", network);
});
afterEach(async () => {
  clean?.();
  clean = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(load: (signal: AbortSignal) => Promise<string>) {
  const value = useFreshData(load);
  clean = harness.effects[0]();
  return value;
}
const settle = () => vi.advanceTimersByTimeAsync(0);
describe("fresh shared meal reads", () => {
  it("publishes a completed read and clears its deadline", async () => {
    const load = vi.fn(async () => "fresh");
    mount(load);
    await settle();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("fresh");
    expect(harness.setters[1]).toHaveBeenLastCalledWith("");
    expect(vi.getTimerCount()).toBe(1);
  });
  it("coalesces background events and aborts a stalled read at fifteen seconds", async () => {
    const captured: AbortSignal[] = [];
    const load = vi.fn((signal: AbortSignal) => {
      captured.push(signal);
      return new Promise<string>(() => {});
    });
    mount(load);
    await settle();
    win.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(captured[0].aborted).toBe(true);
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
    expect(harness.setters[0]).toHaveBeenLastCalledWith(null);
    expect(harness.setters[1]).toHaveBeenLastCalledWith(expect.stringContaining("kunde inte"));
  });
  it("manual retry supersedes a pending read and ignores its late result", async () => {
    let finish!: (value: string) => void, oldSignal!: AbortSignal;
    const load = vi
      .fn()
      .mockImplementationOnce((signal: AbortSignal) => {
        oldSignal = signal;
        return new Promise<string>((r) => {
          finish = r;
        });
      })
      .mockResolvedValue("new read");
    const value = mount(load);
    await settle();
    await value.refresh();
    expect(oldSignal.aborted).toBe(true);
    finish("old shared values");
    await settle();
    expect(harness.setters[0]).toHaveBeenLastCalledWith("new read");
    expect(harness.setters[0]).not.toHaveBeenCalledWith("old shared values");
  });
  it("offline hides the visible copy and reconnect starts only a read", async () => {
    const load = vi.fn(async () => "fresh");
    mount(load);
    await settle();
    network.onLine = false;
    win.dispatchEvent(new Event("offline"));
    expect(harness.setters[0]).toHaveBeenLastCalledWith(null);
    expect(harness.setters[1]).toHaveBeenLastCalledWith(expect.stringContaining("Offline"));
    network.onLine = true;
    win.dispatchEvent(new Event("online"));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("unmount aborts the request, removes events and cannot start another read", async () => {
    let signal!: AbortSignal;
    const load = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<string>(() => {});
    });
    const value = mount(load);
    await settle();
    clean?.();
    clean = undefined;
    await settle();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    win.dispatchEvent(new Event("focus"));
    expect(await value.refresh()).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    expect(harness.setters[0]).not.toHaveBeenCalled();
  });
  it("does not start or publish an offline read after cleanup", async () => {
    network.onLine = false;
    const load = vi.fn(async () => "private");
    const value = mount(load);
    expect(load).not.toHaveBeenCalled();
    clean?.();
    clean = undefined;
    harness.setters.forEach((set) => set.mockClear());
    expect(await value.refresh()).toBe(false);
    expect(harness.setters[0]).not.toHaveBeenCalled();
  });
  it("contains synchronous loader failures and clears the visible copy", async () => {
    mount(() => {
      throw new Error("synthetic_read_failure");
    });
    await settle();
    expect(harness.setters[0]).toHaveBeenLastCalledWith(null);
    expect(harness.setters[1]).toHaveBeenLastCalledWith(expect.stringContaining("kunde inte"));
  });
});
