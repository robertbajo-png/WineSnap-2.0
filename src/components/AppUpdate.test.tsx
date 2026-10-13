import { isValidElement, type ReactNode, type ReactElement } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  activating: { current: false },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = value;
      },
    ];
  },
  useRef: () => hooks.activating,
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/components/ui/alert-dialog", () =>
  Object.fromEntries(
    [
      "AlertDialog",
      "AlertDialogAction",
      "AlertDialogCancel",
      "AlertDialogContent",
      "AlertDialogDescription",
      "AlertDialogFooter",
      "AlertDialogHeader",
      "AlertDialogTitle",
    ].map((name) => [name, name]),
  ),
);
import { AppUpdate } from "./AppUpdate";

type Props = {
  children?: ReactNode;
  onClick?: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  disabled?: boolean;
  role?: string;
};
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function render() {
  hooks.cursor = 0;
  return AppUpdate();
}
function element(type: string) {
  const result = elements(render()).find((node) => node.type === type);
  if (!result) throw new Error(`Missing update element: ${type}`);
  return result;
}

describe("explicit application update", () => {
  const postMessage = vi.fn();
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const reload = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    hooks.values = [{ postMessage }, false, null];
    hooks.activating.current = false;
    vi.stubGlobal("navigator", { serviceWorker: { addEventListener, removeEventListener } });
    vi.stubGlobal("window", { location: { reload } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not display an offer without a waiting worker", () => {
    hooks.values[0] = null;
    expect(render()).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });
  it("opens a controlled app dialog without activating or using a native prompt", () => {
    element("button").props.onClick?.();
    expect(element("AlertDialog").props.open).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it("leaves the worker and unsaved page unchanged when cancelled", () => {
    element("button").props.onClick?.();
    element("AlertDialog").props.onOpenChange?.(false);
    expect(element("AlertDialog").props.open).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it("activates only on confirmation and subscribes to one controller change", () => {
    element("button").props.onClick?.();
    const confirm = element("AlertDialogAction").props.onClick;
    confirm?.();
    confirm?.();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith("SKIP_WAITING");
    expect(addEventListener).toHaveBeenCalledOnce();
    expect(addEventListener.mock.calls[0][0]).toBe("controllerchange");
    expect(addEventListener.mock.calls[0][2]).toEqual({ once: true });
    expect(reload).not.toHaveBeenCalled();
    addEventListener.mock.calls[0][1]();
    expect(reload).toHaveBeenCalledOnce();
    expect(element("button").props.disabled).toBe(true);
  });
  it("removes the reload listener and permits retry when activation throws", () => {
    postMessage.mockImplementationOnce(() => {
      throw new Error("worker unavailable");
    });
    element("AlertDialogAction").props.onClick?.();
    expect(removeEventListener).toHaveBeenCalledWith(
      "controllerchange",
      addEventListener.mock.calls[0][1],
    );
    expect(reload).not.toHaveBeenCalled();
    expect(element("button").props.disabled).toBe(false);
    expect(elements(render()).find((node) => node.props.role === "alert")?.props.children).toBe(
      "pwa.failed",
    );
    element("button").props.onClick?.();
    expect(elements(render()).find((node) => node.props.role === "alert")).toBeUndefined();
  });
});
