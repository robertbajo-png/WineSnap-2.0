import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveCamera } from "./LiveCamera";

vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));

describe("live camera view", () => {
  it("renders an inline, muted preview without a native capture input", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    expect(html).toContain("<video");
    expect(html).toContain('playsInline=""');
    expect(html).toContain('muted=""');
    expect(html).not.toContain('type="file"');
  });

  it("keeps gallery available but disables the shutter until a frame is ready", () => {
    const html = renderToStaticMarkup(<LiveCamera onCapture={vi.fn()} onGallery={vi.fn()} />);
    expect(html).toMatch(/<button[^>]*aria-label="scan.gallery"(?![^>]*disabled)[^>]*>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="scan.takePhoto"/);
    expect(html).toContain("scan.cameraStarting");
  });
});
