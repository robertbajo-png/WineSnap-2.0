import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { AromaRows } from "./AromaProfileTabs";

describe("aroma profile layout", () => {
  it("shows a labelled intensity beside read-only aromas", () => {
    const html = renderToStaticMarkup(
      <AromaRows readOnly aromas={[{ name: "Cherry", active: true, intensity: 4 }]} />,
    );
    expect(html).toContain('aria-label="notes.intensityFor: 4/5"');
    expect(html).toContain("shrink-0 text-sm font-medium tabular-nums");
    expect(html).not.toContain('role="slider"');
  });

  it("does not invent an intensity for an AI aroma", () => {
    const html = renderToStaticMarkup(
      <AromaRows readOnly aromas={[{ name: "Cherry", active: true, intensity: null }]} />,
    );
    expect(html).not.toContain("/5");
  });

  it("keeps the named slider when editing personal aromas", () => {
    const html = renderToStaticMarkup(
      <AromaRows aromas={[{ name: "Cherry", active: true, intensity: 4 }]} />,
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-label="notes.intensityFor"');
  });
});
