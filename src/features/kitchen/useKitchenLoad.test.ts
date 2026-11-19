import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenError } from "./api";
import type { KitchenCache } from "./storage";

const harness = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setters: [] as ReturnType<typeof vi.fn>[],
  refs: [] as { current: unknown }[],
  initial: new Map<number, unknown>(),
}));
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  refresh: vi.fn(),
  clear: vi.fn(),
  empty: vi.fn(),
  load: vi.fn(),
  saveSession: vi.fn(),
}));
vi.mock("react", () => ({
  useState(value: unknown) {
    const index = harness.setters.length,
      set = vi.fn();
    harness.setters.push(set);
    return [harness.initial.has(index) ? harness.initial.get(index) : value, set];
  },
  useRef(value: unknown) {
    const ref = { current: value };
    harness.refs.push(ref);
    return ref;
  },
  useEffect(effect: () => void | (() => void)) {
    harness.effects.push(effect);
  },
  useCallback(fn: unknown) {
    return fn;
  },
}));
vi.mock("./storage", () => ({
  readKitchenCache: mocks.read,
  writeKitchenCache: mocks.write,
  refreshKitchenCache: mocks.refresh,
  clearKitchenCache: mocks.clear,
  emptyKitchenCache: mocks.empty,
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  loadKitchen: mocks.load,
  saveCookingSession: mocks.saveSession,
}));
import { useKitchen } from "./useKitchen";
const owner = "synthetic-owner",
  peer = "synthetic-peer";
let cleanup: (() => void) | undefined, snapshot: KitchenCache;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  harness.effects = [];
  harness.setters = [];
  harness.refs = [];
  harness.initial.clear();
  const win = Object.assign(new EventTarget(), {
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  snapshot = {
    owner,
    verifiedAt: Date.now(),
    cacheRevision: 4,
    versions: [],
    history: [],
    session: {
      id: "synthetic-session",
      version: { user_id: owner },
      baseRevision: 1,
      dirty: true,
      requestId: "synthetic-stable-request",
      state: { status: "paused" },
    },
  } as unknown as KitchenCache;
  mocks.clear.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue(null);
  mocks.empty.mockReturnValue({ ...snapshot, cacheRevision: 0 });
  mocks.load.mockResolvedValue({ versions: [], active: snapshot.session, history: [] });
  mocks.refresh.mockResolvedValue({ cache: snapshot, reused: true });
  mocks.write.mockImplementation(async (data: KitchenCache) => ({
    ...data,
    cacheRevision: data.cacheRevision + 1,
  }));
  mocks.saveSession.mockResolvedValue({ id: snapshot.session!.id, user_id: owner, revision: 2 });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(ready = false) {
  if (ready) {
    harness.initial.set(0, snapshot);
    harness.initial.set(2, true);
  }
  // Exercise lifecycle guards; actual rendering and IDB concurrency are browser-tested separately.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useKitchen(owner);
  const dispose = harness.effects[0]();
  cleanup = typeof dispose === "function" ? dispose : undefined;
  return state;
}
describe("kitchen verified startup reconciliation", () => {
  it("uses only a verified startup refresh, not the user-mutation writer", async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(harness.setters[0]).toHaveBeenLastCalledWith(snapshot);
    expect(harness.setters[4]).not.toHaveBeenCalledWith(expect.stringContaining("annan flik"));
  });
  it("never auto-flushes another tab's adopted pending attempt on the initial ready effect", async () => {
    const state = mount(true);
    await vi.advanceTimersByTimeAsync(0);
    harness.effects[2]();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    await state.sync();
    expect(mocks.saveSession).toHaveBeenCalledExactlyOnceWith(snapshot.session);
    expect(mocks.write).toHaveBeenCalledOnce();
  });
  it("retains initial synchronization for a normally loaded pending local attempt", async () => {
    mocks.refresh.mockResolvedValue({ cache: snapshot, reused: false });
    mount(true);
    await vi.advanceTimersByTimeAsync(0);
    const dispose = harness.effects[2]();
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.saveSession).toHaveBeenCalledOnce();
    if (typeof dispose === "function") dispose();
  });
  it("does not reuse data after the server denies kitchen access", async () => {
    mocks.load.mockRejectedValue(new KitchenError("unavailable"));
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(harness.setters[0]).toHaveBeenLastCalledWith(null);
    expect(mocks.clear).toHaveBeenCalledTimes(2);
  });
  it("keeps network-only offline fallback separate from concurrent-cache recovery", async () => {
    mocks.read.mockResolvedValue(snapshot);
    mocks.load.mockRejectedValue(new KitchenError("network"));
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(harness.setters[0]).toHaveBeenLastCalledWith(snapshot);
  });
  it("does not publish a late reused cache after unmount", async () => {
    let finish!: (value: unknown) => void;
    mocks.refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    await vi.advanceTimersByTimeAsync(0);
    cleanup?.();
    cleanup = undefined;
    harness.setters.forEach((set) => set.mockClear());
    finish({ cache: snapshot, reused: true });
    await vi.advanceTimersByTimeAsync(0);
    for (const set of harness.setters) expect(set).not.toHaveBeenCalled();
  });
  it("does not publish another account's superseded startup result", async () => {
    let finish!: (value: unknown) => void;
    mocks.refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    await vi.advanceTimersByTimeAsync(0);
    harness.refs[1].current = peer;
    harness.setters.forEach((set) => set.mockClear());
    finish({ cache: snapshot, reused: true });
    await vi.advanceTimersByTimeAsync(0);
    for (const set of harness.setters) expect(set).not.toHaveBeenCalled();
  });
});

describe("explicit kitchen read recovery", () => {
  async function conflicted() {
    const state = mount(true);
    await vi.advanceTimersByTimeAsync(0);
    harness.refs[5].current = true;
    vi.clearAllMocks();
    return state;
  }
  it("adopts a newer validated local snapshot offline without writes or changing its attempt/age", async () => {
    const state = await conflicted();
    vi.stubGlobal("navigator", { onLine: false });
    const newer = { ...snapshot, cacheRevision: 5 };
    mocks.read.mockResolvedValue(newer);
    expect(await state.reload()).toBe(true);
    expect(harness.setters[0]).toHaveBeenLastCalledWith(newer);
    expect(harness.setters[7]).toHaveBeenLastCalledWith(false);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
    harness.effects[2]();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.saveSession).not.toHaveBeenCalled();
  });
  for (const latest of [null, { cacheRevision: 4 }, { cacheRevision: 3 }])
    it(`keeps the view blocked when a newer snapshot is absent (${latest?.cacheRevision ?? "missing"})`, async () => {
      const state = await conflicted();
      mocks.read.mockResolvedValue(latest);
      expect(await state.reload()).toBe(false);
      expect(harness.setters[0]).not.toHaveBeenCalled();
      expect(harness.refs[5].current).toBe(true);
      expect(mocks.saveSession).not.toHaveBeenCalled();
    });
  it("retains the old view after a read fault and succeeds on an explicit read retry", async () => {
    const state = await conflicted();
    mocks.read.mockRejectedValueOnce(new Error("synthetic read fault"));
    expect(await state.reload()).toBe(false);
    expect(harness.setters[0]).not.toHaveBeenCalled();
    const newer = { ...snapshot, cacheRevision: 5 };
    mocks.read.mockResolvedValue(newer);
    expect(await state.reload()).toBe(true);
    expect(harness.setters[0]).toHaveBeenLastCalledWith(newer);
    expect(mocks.saveSession).not.toHaveBeenCalled();
  });
  for (const change of ["unmount", "account"])
    it(`ignores a late read after ${change}`, async () => {
      const state = await conflicted();
      let finish!: (value: unknown) => void;
      mocks.read.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = state.reload();
      expect(await state.reload()).toBe(false);
      if (change === "unmount") {
        cleanup?.();
        cleanup = undefined;
      } else harness.refs[1].current = peer;
      harness.setters.forEach((set) => set.mockClear());
      finish({ ...snapshot, cacheRevision: 5 });
      expect(await pending).toBe(false);
      for (const set of harness.setters) expect(set).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.saveSession).not.toHaveBeenCalled();
    });
  it("blocks a stale manual sync until the read is accepted", async () => {
    const state = await conflicted();
    expect(await state.sync()).toBe(false);
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rereads a server failure in place without replaying the pending write", async () => {
    const state = mount(true);
    await vi.advanceTimersByTimeAsync(0);
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(snapshot);
    expect(await state.reload()).toBe(true);
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
