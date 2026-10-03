import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveCamera } from "./LiveCamera";

vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));

describe("live camera view", () => {
  it("preserves the original four corner guides, hint and shutter styling", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    for (const corner of ["rounded-tl-2xl", "rounded-tr-2xl", "rounded-bl-2xl", "rounded-br-2xl"]) {
      expect(html).toContain(corner);
    }
    expect(html).toContain("bottom-6 text-center text-xs text-cream/70");
    expect(html).toContain("ring-2 ring-gold transition-transform");
    expect(html).not.toContain("inset-x-[15%]");
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
