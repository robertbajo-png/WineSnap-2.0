import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Slider } from "./slider";

describe("accessible slider", () => {
  it("names the focusable thumb, not just its wrapper", () => {
    const html = renderToStaticMarkup(
      <Slider value={[3]} min={1} max={5} aria-label="Cherry intensity" />,
    );
    const thumb = html.match(/<span[^>]*role="slider"[^>]*>/)?.[0];
    expect(thumb).toBeDefined();
    expect(thumb).toContain('aria-label="Cherry intensity"');
  });

  it("forwards label references and value descriptions to the thumb", () => {
    const html = renderToStaticMarkup(
      <Slider
        value={[3]}
        aria-labelledby="aroma-name"
        aria-describedby="aroma-help"
        aria-valuetext="Moderate"
      />,
    );
    const thumb = html.match(/<span[^>]*role="slider"[^>]*>/)?.[0];
    expect(thumb).toContain('aria-labelledby="aroma-name"');
    expect(thumb).toContain('aria-describedby="aroma-help"');
    expect(thumb).toContain('aria-valuetext="Moderate"');
  });
});
