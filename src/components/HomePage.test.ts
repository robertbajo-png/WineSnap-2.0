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

  it("uses the available viewport space for the image while leaving room for navigation", () => {
    const home = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    expect(home).toContain(
      "min-h-[calc(100svh-var(--bottom-nav-height)-env(safe-area-inset-top,0px)-1rem)]",
    );
    expect(home).toContain("min-h-[320px] w-full flex-1");
    expect(home).not.toContain("min-h-[220px]");
  });
});
