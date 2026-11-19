import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  action: undefined as { label: string; disabled?: boolean; onClick: () => void } | undefined,
}));
vi.mock("@/components/OperationNotice", () => ({
  OperationNotice: ({
    children,
    action,
  }: {
    children: ReactNode;
    action?: typeof state.action;
  }) => {
    state.action = action;
    return (
      <section>
        {children}
        {action && <button disabled={action.disabled}>{action.label}</button>}
      </section>
    );
  },
}));
import { MealMutationNotice } from "./MealMutationNotice";
const mutation = () => ({
  run: vi.fn(),
  busy: false,
  locked: false,
  waiting: false,
  canRetry: false,
  notice: "Synthetic conflict",
  kind: "error" as const,
  canReload: true,
  reload: vi.fn(),
  current: () => true,
  inspect: vi.fn(),
  retry: vi.fn(),
});
beforeEach(() => {
  state.action = undefined;
});
describe("mutation read recovery affordance", () => {
  it("offers an explicit read-only action without invoking it during render", () => {
    const value = mutation();
    const html = renderToStaticMarkup(<MealMutationNotice mutation={value} />);
    expect(html).toContain("Hämta aktuella uppgifter");
    expect(value.reload).not.toHaveBeenCalled();
    state.action?.onClick();
    expect(value.reload).toHaveBeenCalledOnce();
    expect(value.retry).not.toHaveBeenCalled();
  });
  it("disables the read action during a pending request", () => {
    const value = mutation();
    value.busy = true;
    renderToStaticMarkup(<MealMutationNotice mutation={value} />);
    expect(state.action?.disabled).toBe(true);
  });
});
