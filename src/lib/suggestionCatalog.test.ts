import { describe, expect, it } from "vitest";
import {
  groundedSuggestions,
  SUGGESTION_CATALOG,
  availableSuggestionIds,
} from "../../supabase/functions/_shared/suggestionCatalog";
describe("grounded recommendation identities", () => {
  it("does not let model output replace producers, names, vintages or prices", () => {
    const input = {
      catalog_id: "penfolds-bin28",
      producer: "Wrong",
      wine_name: "Invented",
      vintage: "2099",
      price_range: "12 SEK",
      body: 8,
    };
    const result = groundedSuggestions([input])[0];
    expect(result).toMatchObject({
      producer: "Penfolds",
      wine_name: "Bin 28 Shiraz",
      vintage: 2023,
      body: 8,
    });
    expect(result).not.toHaveProperty("price_range");
  });
  it("rejects unknown IDs, duplicates and unsupported scores", () => {
    expect(groundedSuggestions([{ catalog_id: "invented" }])).toEqual([]);
    const result = groundedSuggestions([
      { catalog_id: "taylor-lbv", body: 50 },
      { catalog_id: "taylor-lbv" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBeNull();
  });
  it("requires a source for every catalog identity and preserves unspecified vintages", () => {
    for (const wine of SUGGESTION_CATALOG) expect(new URL(wine.source_url).protocol).toBe("https:");
    expect(
      groundedSuggestions([{ catalog_id: "guigal-rhone-red", vintage: 2025 }])[0].vintage,
    ).toBeNull();
  });
  it("rejects owned catalog bottles even if the model repeats them", () => {
    const allowed = availableSuggestionIds([
      { producer: "PENFOLDS", wine_name: "Bin 28 Shiraz", vintage: 2021 },
    ]);
    expect(groundedSuggestions([{ catalog_id: "penfolds-bin28" }], allowed)).toEqual([]);
  });
});
