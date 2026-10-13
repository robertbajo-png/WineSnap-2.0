import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  enabled: true,
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
}));
const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (value: unknown) => {
        state.values[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const i = state.refCursor++;
    return state.refs[i] ?? (state.refs[i] = { current: initial });
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ lang: "sv", t: (key: string) => key }) }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: mocks.signOut, getSession: mocks.getSession } },
}));
vi.mock("@/lib/privacyControls", () => ({
  invokePrivacyAction: mocks.action,
  get privacyControlsEnabled() {
    return state.enabled;
  },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/ui/button", () => ({ Button: "Button" }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: "Checkbox" }));
vi.mock("@/components/ui/alert-dialog", () =>
  Object.fromEntries(
    [
      "AlertDialog",
      "AlertDialogContent",
      "AlertDialogHeader",
      "AlertDialogTitle",
      "AlertDialogDescription",
      "AlertDialogFooter",
      "AlertDialogCancel",
    ].map((name) => [name, name]),
  ),
);
import { DataControls } from "./DataControls";
type Props = {
  children?: ReactNode;
  onClick?: () => Promise<void> | void;
  onCheckedChange?: (value: boolean) => void;
  disabled?: boolean;
  role?: string;
  className?: string;
};
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function render() {
  state.cursor = 0;
  state.refCursor = 0;
  return elements(DataControls());
}
function text(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}
function button(label: string) {
  const node = render().find(
    (node) =>
      ["button", "Button"].includes(String(node.type)) && text(node.props.children) === label,
  );
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
function confirm() {
  render()
    .find((node) => node.type === "Checkbox")
    ?.props.onCheckedChange?.(true);
}
beforeEach(() => {
  state.enabled = true;
  state.values = [];
  state.refs = [];
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "owner" } } } });
});

describe("explicit privacy UI actions", () => {
  it("keeps new controls hidden until backend rollout is enabled", () => {
    state.enabled = false;
    const labels = render()
      .filter((node) => node.type === "button")
      .map((node) => text(node.props.children));
    expect(labels).toContain("Exportera mina uppgifter");
    expect(labels).not.toContain("Radera mitt konto");
    expect(labels).not.toContain("Nollställ smakminnet");
  });
  it("opens a confirmation without deleting or resetting anything", () => {
    button("Radera mitt konto").props.onClick?.();
    expect(mocks.action).not.toHaveBeenCalled();
    expect(button("Radera kontot").props.disabled).toBe(true);
    render().find((node) => node.type === "AlertDialogCancel");
  });
  it("does not execute an unconfirmed action even if its handler is called", async () => {
    button("Radera mitt konto").props.onClick?.();
    await button("Radera kontot").props.onClick?.();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("shows queued erasure rather than a completed deletion", async () => {
    mocks.action.mockResolvedValue({ complete: false, queued: true });
    button("Radera mitt konto").props.onClick?.();
    confirm();
    await button("Radera kontot").props.onClick?.();
    expect(mocks.action).toHaveBeenCalledWith("delete_account", "owner");
    expect(mocks.success).toHaveBeenCalledWith("Raderingen är begärd och fortsätter i bakgrunden.");
    expect(mocks.success).not.toHaveBeenCalledWith("Kontot är raderat.");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it("reports reauthentication errors and does not sign out as if erasure succeeded", async () => {
    mocks.action.mockRejectedValue(new Error("reauthentication_required"));
    button("Radera mitt konto").props.onClick?.();
    confirm();
    await button("Radera kontot").props.onClick?.();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(text(render().find((node) => node.props.role === "alert"))).toContain(
      "Logga ut och in igen",
    );
  });
  it("guards rapid duplicate confirmations", async () => {
    let done: ((value: { complete: boolean }) => void) | undefined;
    mocks.action.mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    button("Nollställ smakminnet").props.onClick?.();
    confirm();
    const first = button("Nollställ").props.onClick?.();
    await button("Nollställ").props.onClick?.();
    expect(mocks.action).toHaveBeenCalledTimes(1);
    done?.({ complete: true });
    await first;
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("does not log out a different account after an asynchronous deletion", async () => {
    mocks.action.mockResolvedValue({ complete: true });
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "stranger" } } } });
    button("Radera mitt konto").props.onClick?.();
    confirm();
    await button("Radera kontot").props.onClick?.();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
