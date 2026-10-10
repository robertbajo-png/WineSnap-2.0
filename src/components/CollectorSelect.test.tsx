import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CollectorSelect } from "./CollectorSelect";
import { collectorForm, parseCollectorForm, COLLECTOR_CURRENCIES } from "@/lib/collectorLots";
describe("first valuation on an unvalued acquisition", () => {
  it("renders the same currency/confidence that will actually be submitted", () => {
    const form = {
      ...collectorForm(),
      wine_id: "11111111-1111-4111-8111-111111111111",
      purchased_at: "2026-10-10",
      currency: "EUR",
      unit_cost: "100",
      estimate_currency: "EUR",
      estimate_price: "120",
      estimate_date: "2026-10-10",
      estimate_source: "Synthetic test quote",
    };
    const currency = renderToStaticMarkup(
      <CollectorSelect
        label="Currency"
        value={form.estimate_currency}
        onChange={vi.fn()}
        className=""
        options={COLLECTOR_CURRENCIES.map((value) => ({ value, label: value }))}
      />,
    );
    const confidence = renderToStaticMarkup(
      <CollectorSelect
        label="Confidence"
        value={form.estimate_confidence}
        onChange={vi.fn()}
        className=""
        options={["low", "medium", "high"].map((value) => ({ value, label: value }))}
      />,
    );
    expect(currency).toContain('value="EUR" selected=""');
    expect(confidence).toContain('value="low" selected=""');
    expect(parseCollectorForm(form).success).toBe(true);
  });
});
