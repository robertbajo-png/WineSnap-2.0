import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  data: null as unknown,
  error: "",
  refresh: vi.fn(),
  retry: undefined as (() => void) | undefined,
}));
vi.mock("./useFreshData", () => ({ useFreshData: () => state }));
vi.mock("./api", () => ({ cellarWines: vi.fn(), mealHistory: vi.fn(), mealSave: vi.fn() }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@/components/OperationNotice", () => ({
  OperationNotice: ({
    kind,
    children,
    action,
  }: {
    kind: string;
    children: ReactNode;
    action?: { label: string; onClick: () => void; disabled?: boolean };
  }) => {
    state.retry = action?.onClick;
    return (
      <section role={kind === "error" ? "alert" : "status"} data-kind={kind}>
        {children}
        {action && <button disabled={action.disabled}>{action.label}</button>}
      </section>
    );
  },
}));
import { MealHistoryPanel } from "./MealHistoryPanel";
const emptyMessage = "Inga kombinationer registrerade ännu.";
const render = () =>
  renderToStaticMarkup(<MealHistoryPanel owner="synthetic-owner" sessions={[]} />);
beforeEach(() => {
  state.data = null;
  state.error = "";
  state.retry = undefined;
  state.refresh.mockReset().mockResolvedValue(undefined);
});
describe("meal history read states", () => {
  it("announces loading rather than a false empty history", () => {
    const html = render();
    expect(html).toContain('data-kind="loading"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain(emptyMessage);
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it("offers an explicit read retry after a failed fetch", () => {
    state.error = "Synthetic read failure";
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("state.retryRead");
    expect(html).not.toContain(emptyMessage);
    expect(state.refresh).not.toHaveBeenCalled();
    state.retry?.();
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("shows empty only after a successful read", () => {
    state.data = {
      cellar: { wines: [], truncated: false },
      history: { meals: [], truncated: false, titles: {}, wineNames: {} },
    };
    const html = render();
    expect(html).toContain(emptyMessage);
    expect(html).not.toContain('data-kind="loading"');
    expect(html).not.toContain('role="alert"');
  });
});
