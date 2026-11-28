import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/accountWriteScope", () => ({ accountAccessToken: vi.fn() }));
import { MealPhotoPanel } from "./MealPhotoPanel";

describe("meal photo initial view", () => {
  it("renders an accessible picker without a network, analyze or save action", () => {
    const markup = renderToStaticMarkup(<MealPhotoPanel owner="synthetic" offline={false} />);
    expect(markup).toContain("Måltidsfoto");
    expect(markup).toContain("Välj bild");
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).not.toContain("Analysera bild");
    expect(markup).not.toContain("Bekräfta underlaget");
    expect(markup).not.toContain("OpenAI");
  });
});
