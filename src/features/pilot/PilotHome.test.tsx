import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
const mock = vi.hoisted(() => ({ cacheOwner: "owner-a" }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/WineImage", () => ({ WineImage: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("../chef/feature", () => ({ chefEnabled: true }));
vi.mock("../meals/feature", () => ({ mealsEnabled: true }));
vi.mock("../kitchen/useKitchen", () => ({
  useKitchen: () => ({
    error: "",
    cache: {
      owner: mock.cacheOwner,
      session: {
        state: { status: "paused", activeStep: 0 },
        version: {
          document: {
            title: "Synthetic private cooking session",
            image: "none",
            steps: [{ title: "Synthetic step" }],
          },
        },
      },
    },
  }),
}));
import { PilotHome } from "./PilotHome";
beforeEach(() => {
  mock.cacheOwner = "owner-a";
});
describe("home cooking context stays on its owner", () => {
  it("shows the current owner's resumable recipe", () => {
    const html = renderToStaticMarkup(<PilotHome owner="owner-a" />);
    expect(html).toContain("Synthetic private cooking session");
    expect(html).toContain("pilot.resume");
  });
  it("hides the previous owner's cache before effects have reset it", () => {
    const html = renderToStaticMarkup(<PilotHome owner="owner-b" />);
    expect(html).not.toContain("Synthetic private cooking session");
    expect(html).not.toContain("pilot.resume");
    expect(html).toContain("pilot.openRecipes");
  });
  it("never shows a cached cooking session to a signed-out view", () => {
    const html = renderToStaticMarkup(<PilotHome />);
    expect(html).not.toContain("Synthetic private cooking session");
    expect(html).toContain("pilot.signIn");
  });
});
