import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  data: null as unknown,
  loadState: "loading",
  busy: false,
  error: "",
  notice: "",
  uncertain: false,
  reviewReady: false,
  requiresRead: false,
  reload: vi.fn(),
  run: vi.fn(),
  finishUncertain: vi.fn(),
}));
const actions = vi.hoisted(() => new Map<string, { disabled?: boolean; onClick: () => void }>());
vi.mock("./useFoodMemoryState", () => ({ useFoodMemoryState: () => state }));
vi.mock("./api", () => ({ askChef: vi.fn(), changeFoodMemory: vi.fn() }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/components/OperationNotice", () => ({
  OperationNotice: ({
    kind,
    children,
    action,
  }: {
    kind: string;
    children: ReactNode;
    action?: { label: string; disabled?: boolean; onClick: () => void };
  }) => {
    if (action) actions.set(action.label, action);
    return (
      <section role={kind === "error" ? "alert" : "status"} data-kind={kind}>
        {children}
        {action && <button disabled={action.disabled}>{action.label}</button>}
      </section>
    );
  },
}));
import { FoodMemoryPanel } from "./FoodMemoryPanel";
const render = (offline = false) =>
  renderToStaticMarkup(
    <FoodMemoryPanel owner="synthetic-owner" offline={offline} onChanged={() => {}} />,
  );
beforeEach(() => {
  vi.clearAllMocks();
  actions.clear();
  Object.assign(state, {
    data: null,
    loadState: "loading",
    busy: false,
    error: "",
    notice: "",
    uncertain: false,
    reviewReady: false,
    requiresRead: false,
  });
});
describe("food memory visible recovery states", () => {
  it("does not claim an empty memory before a successful read", () => {
    const html = render();
    expect(html).toContain('data-kind="loading"');
    expect(html).not.toContain("Inga bekräftade matpreferenser ännu.");
  });
  it("offers a keyboard-native read action without calling a write or AI", () => {
    state.loadState = "error";
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("state.retryRead");
    actions.get("state.retryRead")?.onClick();
    expect(state.reload).toHaveBeenCalledOnce();
    expect(state.run).not.toHaveBeenCalled();
  });
  it("retains a known saved notice alongside a failed-read state", () => {
    state.loadState = "error";
    state.notice = "Synthetic saved result. Hämta på nytt.";
    expect(render()).toContain(state.notice);
    expect(state.run).not.toHaveBeenCalled();
  });
  it("distinguishes an unconfirmed change from an ordinary read failure", () => {
    state.loadState = "error";
    state.requiresRead = true;
    const html = render();
    expect(html).toContain("Ändringen behöver kontrolleras.");
    expect(html).not.toContain("state.memoryFailed");
  });
  it("cannot finish an uncertain attempt before a usable read", () => {
    state.loadState = "error";
    state.uncertain = true;
    const html = render();
    expect(html).toContain("Avsluta försöket");
    expect(actions.get("Avsluta försöket")?.disabled).toBe(true);
    expect(state.run).not.toHaveBeenCalled();
  });
  it("requires an explicit completion after rereading and keeps mutation controls disabled", () => {
    Object.assign(state, {
      loadState: "ready",
      data: { signals: [], feedback: [] },
      uncertain: true,
      reviewReady: true,
    });
    const html = render();
    expect(actions.get("Avsluta försöket")?.disabled).toBe(false);
    expect(html).toMatch(/disabled=""[^>]*><svg[^]*?Nollställ matminne/);
    actions.get("Avsluta försöket")?.onClick();
    expect(state.finishUncertain).toHaveBeenCalledOnce();
    expect(state.run).not.toHaveBeenCalled();
  });
  it("hides memory and feedback offline", () => {
    state.loadState = "error";
    const html = render(true);
    expect(html).toContain('data-kind="offline"');
    expect(html).not.toContain("Inga bekräftade matpreferenser ännu.");
    expect(actions.has("state.retryRead")).toBe(false);
  });
});
