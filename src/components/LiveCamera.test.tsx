import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveCamera } from "./LiveCamera";

vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));

describe("live camera view", () => {
  it("clips the live feed to the same inset as the corner guides without stretching", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    expect(html).toContain('class="absolute inset-8 overflow-hidden rounded-2xl"><video');
    expect(html).toContain("object-cover object-center");
    expect(html).not.toContain("object-contain");
  });

  it("keeps four shorter gold corner guides aligned inside the preview frame", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    for (const corner of ["rounded-tl-2xl", "rounded-tr-2xl", "rounded-bl-2xl", "rounded-br-2xl"]) {
      expect(html).toContain(corner);
    }
    expect(html.match(/border-gold\/70/g)).toHaveLength(4);
    expect(html).toContain("ring-1 ring-inset ring-white/15");
    expect(html).not.toContain("h-12 w-12 border-cream/85");
    expect(html).toContain("ring-2 ring-gold transition-transform");
    expect(html).not.toContain("inset-x-[15%]");
  });

  it("places the hint in normal flow below the preview and above the controls", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    expect(html).toContain('aria-describedby="scan-camera-hint"');
    expect(html).toContain(
      '</div><p id="scan-camera-hint" class="shrink-0 px-8 pb-1 text-center text-sm leading-relaxed text-cream/90">scan.align</p><div class="flex shrink-0',
    );
    expect(html).not.toContain("absolute inset-x-0 bottom-6");
  });

  it("keeps the original viewport and controls during analysis", () => {
    const html = renderToStaticMarkup(
      <LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} analyzing />,
    );
    expect(html).toContain("scan.analyzing");
    expect(html).toContain("rounded-tl-2xl");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="scan.gallery"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="scan.takePhoto"/);
    expect(html).not.toContain("scan.cameraStarting");
  });

  it("renders an inline, muted preview without a native capture input", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    expect(html).toContain("<video");
    expect(html).toContain('playsInline=""');
    expect(html).toContain('muted=""');
    expect(html).not.toContain('type="file"');
  });

  it("keeps gallery available but disables the shutter until a frame is ready", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    const gallery = html.match(/<button[^>]*aria-label="scan.gallery"[^>]*>/)?.[0];
    expect(gallery).toBeDefined();
    expect(gallery).not.toContain(" disabled=");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="scan.takePhoto"/);
    expect(html).toContain("scan.cameraStarting");
  });
});
