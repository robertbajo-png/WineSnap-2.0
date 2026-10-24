import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { ProfileAccountSection } from "./ProfileAccountSection";

const render = (checking: boolean, signedIn: boolean) =>
  renderToStaticMarkup(
    <ProfileAccountSection checking={checking} signedIn={signedIn}>
      <button>Account settings</button>
    </ProfileAccountSection>,
  );

describe("profile account access", () => {
  it("gives guests a sign-in link without inactive account-editing controls", () => {
    const html = render(false, false);
    expect(html).toContain('href="/login"');
    expect(html).toContain("login.signIn");
    expect(html).toContain("min-h-12");
    expect(html).not.toContain("Account settings");
  });

  it("keeps the real account controls for authenticated users", () => {
    const html = render(false, true);
    expect(html).not.toContain('href="/login"');
    expect(html).toContain("Account settings");
  });

  it("does not offer sign-in while the existing session is still being checked", () => {
    expect(render(true, false)).not.toContain('href="/login"');
  });
});
