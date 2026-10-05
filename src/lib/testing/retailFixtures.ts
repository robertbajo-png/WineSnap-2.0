import { priceIdentity, type RetailCandidate, type RetailWine } from "../retailPrices";

export const wine: RetailWine = {
  id: "00000000-0000-4000-8000-000000000001",
  producer: "Zehn Morgen",
  wine_name: "Chardonnay & Weisser Burgunder",
  vintage: 2023,
  country: "Germany",
  bottle_ml: 750,
  quantity: 2,
  consumed_at: null,
  purchase_price: 129,
  purchase_currency: "SEK",
  market_price: null,
  market_price_currency: null,
  market_price_checked_at: null,
  updated_at: "2026-10-05T09:00:00Z",
};
export const candidate: RetailCandidate = {
  productNumber: "1234501",
  name: "Zehn Morgen Chardonnay & Weisser Burgunder",
  producer: "Zehn Morgen",
  vintage: 2023,
  volumeMl: 750,
  packaging: "Bottle",
  country: "Germany",
  price: 159,
  currency: "SEK",
};
export function quoted(overrides: Partial<RetailWine> = {}): RetailWine {
  return {
    ...wine,
    market_price: 159,
    market_price_currency: "SEK",
    market_price_source: "bolaget.io",
    market_price_checked_at: "2026-10-05T10:00:00Z",
    retail_price_status: "matched",
    retail_price_match: { ...candidate, identity: priceIdentity(wine), verification: "automatic" },
    ...overrides,
  };
}
