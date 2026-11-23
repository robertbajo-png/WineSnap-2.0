import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantryError } from "./api";
import { usePantry } from "./usePantry";

const harness = vi.hoisted(() => ({
  effects: [] as (() => (() => void) | undefined)[],
  states: [] as ReturnType<typeof vi.fn>[],
  read: vi.fn(),
  edit: vi.fn(),
}));
vi.mock("react", () => ({
  useState(value: unknown) {
    const setter = vi.fn();
    harness.states.push(setter);
    return [value, setter];
  },
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined) => harness.effects.push(effect),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  loadPantry: harness.read,
  savePantryItem: harness.edit,
}));

const owner = "11111111-1111-4111-8111-000000000001";
const snapshot = { user_id: owner, revision: 1, items: [] };
const edit = {
  itemId: "11111111-1111-4111-8111-000000000002",
  requestId: "11111111-1111-4111-8111-000000000003",
  expectedRevision: 0,
  item: { name: "Tomater", amount: 400, unit: "g" as const, confirmed: true },
};
let clean: (() => void)[] = [];
let browser: EventTarget;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  harness.effects = [];
  harness.states = [];
  browser = new EventTarget();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("navigator", { onLine: true });
});

function mount(online = true, opened = true) {
  // Mocked primitives exercise the request lifetimes without a DOM.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const value = usePantry(owner, online, opened);
  clean = harness.effects.flatMap((effect) => {
    const cleanup = effect();
    return cleanup ? [cleanup] : [];
  });
  return value;
}

function unmount() {
  for (const dispose of clean) dispose();
  clean = [];
}

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("private pantry workspace", () => {
  it("does not load or write stock when unopened or offline", async () => {
    const view = mount(true, false);
    expect(view.snapshot).toBeUndefined();
    expect(await view.save(edit)).toEqual({ ok: false, kind: "unavailable" });
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.edit).not.toHaveBeenCalled();
    unmount();
    mount(false);
    expect(harness.read).not.toHaveBeenCalled();
  });

  it("invalidates the previous snapshot before reading fresh stock on focus", async () => {
    harness.read.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error("disconnected"));
    mount();
    await Promise.resolve();
    expect(harness.states[0]).toHaveBeenLastCalledWith(snapshot);
    browser.dispatchEvent(new Event("focus"));
    expect(harness.states[0]).toHaveBeenLastCalledWith(undefined);
    await Promise.resolve();
    expect(harness.states[2]).toHaveBeenLastCalledWith(true);
  });

  it("does not publish a late response after the owner workspace unmounts", async () => {
    const response = deferred<typeof snapshot>();
    harness.read.mockReturnValueOnce(response.promise);
    mount();
    const [scope, signal] = harness.read.mock.calls[0];
    unmount();
    expect(scope.current()).toBe(false);
    expect(signal.aborted).toBe(true);
    response.resolve(snapshot);
    await Promise.resolve();
    expect(harness.states[0]).not.toHaveBeenCalledWith(snapshot);
  });

  it("does not overlap writes or retry an uncertain save behind the user's back", async () => {
    harness.read.mockResolvedValueOnce(null);
    const view = mount();
    await Promise.resolve();
    const response = deferred<never>();
    harness.edit.mockReturnValueOnce(response.promise);
    const pending = view.save(edit);
    expect(await view.save(edit)).toEqual({ ok: false, kind: "unavailable" });
    browser.dispatchEvent(new Event("focus"));
    expect(harness.read).toHaveBeenCalledTimes(1);
    response.reject(new PantryError("unknown"));
    expect(await pending).toEqual({ ok: false, kind: "unknown" });
    expect(harness.edit).toHaveBeenCalledTimes(1);
    expect(harness.states[0]).toHaveBeenLastCalledWith(undefined);
  });
});
