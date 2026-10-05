import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("home scan entry", () => {
  it("leaves scanning to navigation and keeps the restaurant action", () => {
    const home = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    const nav = readFileSync(new URL("./BottomNav.tsx", import.meta.url), "utf8");
    expect(home).not.toContain('to="/scan"');
    expect(home).not.toContain("home.cta.start");
    expect(home).toContain('to="/restaurant"');
    expect(nav).toContain('to="/scan"');
    expect(nav).toContain('aria-label={t("nav.scan")}');
  });

  it("keeps only the two compact shortcuts and leaves taste settings in the profile", () => {
    const home = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    const profile = readFileSync(new URL("../routes/me.tsx", import.meta.url), "utf8");
    expect(home).toContain("grid grid-cols-2");
    expect(home).toContain('to="/for-you"');
    expect(home).toContain('t("nav.forYou")');
    expect(home).toContain('to="/restaurant"');
    expect(home).not.toContain('to="/cellar"');
    expect(home).not.toContain('to="/taste"');
    expect(profile).toContain('to="/taste"');
  });

  it("uses the available viewport space for the image while leaving room for navigation", () => {
    const home = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    expect(home).toContain(
      "min-h-[calc(100svh-var(--bottom-nav-height)-env(safe-area-inset-top,0px)-1rem)]",
    );
    expect(home).toContain("min-h-[320px] w-full flex-1");
    expect(home).not.toContain("min-h-[220px]");
  });
});
