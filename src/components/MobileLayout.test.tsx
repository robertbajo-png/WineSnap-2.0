import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";
import { MobileDetails } from "./MobileDetails";
import { revealInvalidField } from "@/lib/mobileForms";
import { ChatViewport } from "./ChatViewport";

const route = (name: string) =>
  readFileSync(new URL(`../routes/${name}.tsx`, import.meta.url), "utf8");

describe("mobile layout foundations", () => {
  it("keeps small and icon buttons touchable and inputs readable", () => {
    const small = renderToStaticMarkup(<Button size="sm">Save</Button>);
    const icon = renderToStaticMarkup(<Button size="icon" aria-label="More" />);
    const input = renderToStaticMarkup(<Input aria-label="Wine name" />);
    expect(small).toContain("min-h-11");
    expect(icon).toContain("min-w-11");
    expect(input).toContain("min-h-12");
    expect(input).toContain("text-base");
  });

  it("keeps a small visual checkbox inside a large accessible target", () => {
    const html = renderToStaticMarkup(<Checkbox checked aria-label="Blackberry" />);
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("h-5 w-5");
  });

  it("keeps slider semantics with a taller track target and larger grip", () => {
    const html = renderToStaticMarkup(
      <Slider value={[3]} min={1} max={5} aria-label="Intensity" />,
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("h-6 w-6");
    expect(html).toContain('aria-label="Intensity"');
    expect(html).toContain('aria-valuemin="1"');
    expect(html).toContain('aria-valuemax="5"');
  });

  it("renders native keyboard-operable disclosures, including existing estimates", () => {
    expect(renderToStaticMarkup(<MobileDetails title="Details">Storage</MobileDetails>)).toContain(
      "<summary>",
    );
    expect(
      renderToStaticMarkup(
        <MobileDetails title="Estimate" defaultOpen>
          Source
        </MobileDetails>,
      ),
    ).toContain('open=""');
  });

  it("reveals every ancestor disclosure before native validation focuses a field", () => {
    class Element extends EventTarget {
      open = false;
      constructor(public parentElement: Element | null = null) {
        super();
      }
      closest() {
        return this;
      }
    }
    vi.stubGlobal("HTMLElement", Element);
    try {
      const outer = new Element();
      const inner = new Element(outer);
      revealInvalidField(inner);
      expect(inner.open).toBe(true);
      expect(outer.open).toBe(true);
      revealInvalidField(null);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds the chat to the available viewport instead of overlaying the answer", () => {
    expect(renderToStaticMarkup(<ChatViewport>Answer</ChatViewport>)).toContain("100dvh");
    const ask = route("ask");
    expect(ask).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(ask).not.toContain("sticky bottom-24");
    expect(ask).toContain("min-w-0 flex-1 resize-none");
  });

  it("wraps wine names and profile values and reveals optional collector fields", () => {
    expect(route("cellar")).toContain("line-clamp-2 break-words");
    expect(route("search")).toContain("line-clamp-2 break-words");
    expect(route("me")).not.toContain("max-w-[55%] truncate");
    expect(route("me")).toContain('role="switch"');
    expect(route("cellar.collection")).toContain("onInvalidCapture");
    expect(route("cellar.collection")).toContain("defaultOpen={!!form.estimate_price}");
  });
});
