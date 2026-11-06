import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("./WineImage", () => ({
  WineImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
import { PhotoGallery } from "./PhotoGallery";

describe("wine photo viewer", () => {
  it("names the photo control independently of its decorative thumbnail", () => {
    const html = renderToStaticMarkup(<PhotoGallery wineId="wine" fallbackUrl="/label.jpg" />);
    expect(html).toContain('aria-label="photos.view"');
    expect(html).toContain('src="/label.jpg"');
    expect(html).toContain("photos.add");
  });
  it("does not render an empty photo control without a stored image", () => {
    const html = renderToStaticMarkup(<PhotoGallery wineId="wine" />);
    expect(html).not.toContain('aria-label="photos.view"');
    expect(html).toContain("photos.empty");
  });
  it("portals the full-height, contained image outside page stacking contexts", () => {
    const source = readFileSync(new URL("./PhotoGallery.tsx", import.meta.url), "utf8");
    expect(source).toContain("<DialogPortal>");
    expect(source).toContain("<DialogPrimitive.Content");
    expect(source).toContain("<DialogTitle");
    expect(source).toContain('t("common.close")');
    expect(source).toContain("h-dvh");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain('className="h-full min-h-0 w-full object-contain"');
    expect(source).not.toContain('role="button"');
  });
});
