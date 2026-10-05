import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetailPricePanel } from "./RetailPricePanel";
import { wine, candidate, quoted } from "@/lib/testing/retailFixtures";
import { priceIdentity } from "@/lib/retailPrices";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; "aria-label": string }) => (
    <a aria-label={props["aria-label"]}>{children}</a>
  ),
}));
function render(wines = [wine], ready = true) {
  return renderToStaticMarkup(
    <RetailPricePanel wines={wines} ready={ready} request={vi.fn()} reload={vi.fn()} />,
  );
}
describe("retail price overview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("keeps legacy amounts visible but excludes them from the verified total", () => {
    const html = render([{ ...wine, market_price: 123, market_price_currency: "SEK" }]);
    expect(html).toContain("0/1");
    expect(html).toContain("123");
    expect(html).toContain("Unverified");
    expect(html).not.toContain("246");
    expect(html).toContain("<summary>");
  });
  it("weights verified total by bottles but coverage by wines", () => {
    const html = render([quoted()]);
    expect(html).toContain("1/1");
    expect(html).toContain("318");
    expect(html).toContain("Last checked");
  });
  it("keeps old prices visible and shows source failures instead of treating them as current", () => {
    const html = render([quoted({ retail_price_status: "error" })]);
    expect(html).toContain("0/1");
    expect(html).toContain("159");
    expect(html).toContain("Price could not be checked");
    expect(html).not.toContain("318");
  });
  it("requires selection and acknowledgement before confirming and blocks wrong sizes", () => {
    const html = render([
      {
        ...wine,
        retail_price_status: "review",
        retail_price_candidates: {
          identity: priceIdentity(wine),
          candidates: [candidate, { ...candidate, productNumber: "99901", volumeMl: 1500 }],
        },
      },
    ]);
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Confirm product/s);
    expect(html).toContain("Different vintage, bottle size or origin");
    expect(html).toContain("750 ml");
    expect(html).toContain("1500 ml");
  });
  it("shows a rollout notice and a disabled update before schema deployment", () => {
    const html = render([wine], false);
    expect(html).toContain("requires a database update");
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});
