import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { ScanResult, type ScanResultProps } from "./ScanResult";

const props: ScanResultProps = {
  wine: {
    wine_name: "Zehn Morgen",
    vintage: 2023,
    region: "Nahe",
    grape_varieties: ["Chardonnay"],
    description: "A fresh white wine.",
    body: 4,
    acidity: 8,
    sweetness: 1,
    primary_notes: ["Apple", "Citrus"],
    food_pairings: [
      { dish: "Grilled fish", reason: "Fresh acidity" },
      { dish: "Salad", reason: "Light body" },
    ],
    serving_temp: "10–12 °C",
    glass_type: "White wine glass",
    decant: false,
  },
  imageUrl: "blob:original-label",
  labelText: "ZEHN MORGEN 2023 NAHE CHARDONNAY",
  mode: "camera",
  partial: false,
  edited: false,
  saved: false,
  busy: false,
  onEdit: vi.fn(),
  onSave: vi.fn(),
  onClose: vi.fn(),
  onDetails: vi.fn(),
  onCellar: vi.fn(),
};

describe("scan result screen", () => {
  it("shows existing taste, serving and food estimates without tabs or saving first", () => {
    const html = renderToStaticMarkup(<ScanResult {...props} />);
    for (const text of [
      "Zehn Morgen",
      "2023",
      "Chardonnay",
      "A fresh white wine.",
      "Apple",
      "Citrus",
      "Grilled fish",
      "Salad",
      "10–12 °C",
      "White wine glass",
      "scan.aiEstimate",
      "scan.tasteEstimate",
      "scan.addToCellar",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("scan.matchFound");
    expect(html).toContain("object-contain");
  });

  it("marks missing details and missing estimates rather than inventing values", () => {
    const html = renderToStaticMarkup(
      <ScanResult {...props} wine={{ wine_name: "Partial wine" }} partial />,
    );
    for (const text of [
      "scan.vintageUnread",
      "scan.originUnread",
      "scan.unread",
      "scan.partialResult",
      "scan.notEstimated",
      "scan.noDescription",
      "scan.noPairings",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("scan.body.medium");
    expect(html).not.toContain("10–12");
  });

  it("retains the result after saving and removes the insert action", () => {
    const html = renderToStaticMarkup(<ScanResult {...props} saved />);
    expect(html).toContain('role="status"');
    expect(html).toContain("scan.savedToCellar");
    expect(html).toContain("A fresh white wine.");
    expect(html).toContain("wine.backToCellar");
    expect(html).toContain('aria-label="scan.viewDetails"');
    expect(html).not.toContain("scan.addToCellar");
    expect(html).not.toContain("scan.editDetails");
  });

  it("labels user corrections separately from AI estimates", () => {
    const html = renderToStaticMarkup(
      <ScanResult {...props} wine={{ wine_name: "Corrected wine" }} edited />,
    );
    expect(html).toContain("scan.corrected");
    expect(html).toContain("scan.estimateCleared");
    expect(html).not.toContain("scan.fromLabel");
  });

  it("labels text input as the user's description, not OCR", () => {
    const html = renderToStaticMarkup(<ScanResult {...props} mode="text" imageUrl={null} />);
    expect(html).toContain("scan.fromText");
    expect(html).toContain("scan.originalText");
    expect(html).not.toContain("scan.labelRead");
  });

  it("disables save, editing and back navigation while saving", () => {
    const html = renderToStaticMarkup(<ScanResult {...props} busy />);
    expect(html.match(/disabled=""/g)?.length).toBe(3);
  });

  it("shows four aromas upfront with the remainder in expandable details", () => {
    const html = renderToStaticMarkup(
      <ScanResult
        {...props}
        wine={{
          ...props.wine,
          primary_notes: ["Apple", "Citrus", "Vanilla", "Honey", "Wet stone"],
        }}
      />,
    );
    const preview = html.split('<ul aria-label="scan.mainAromas"')[1].split("</ul>")[0];
    expect(preview.match(/<li /g)?.length).toBe(4);
    expect(preview).not.toContain("Wet stone");
    expect(html).toContain("Wet stone");
  });
});
