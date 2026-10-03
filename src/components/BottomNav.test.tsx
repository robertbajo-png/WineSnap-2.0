import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/cellar" }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => location,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { BottomNav } from "./BottomNav";

describe("accessible bottom navigation", () => {
  it.each(["/cellar", "/scan"])("marks only the active page: %s", (pathname) => {
    location.pathname = pathname;
    const html = renderToStaticMarkup(<BottomNav />);
    expect(html).toContain('aria-label="WineSnap"');
    expect(html).toContain('aria-label="nav.scan"');
    const active = html.match(/<a[^>]*aria-current="page"[^>]*>/g);
    expect(active).toHaveLength(1);
    expect(active?.[0]).toContain(`href="${pathname}"`);
  });
});
