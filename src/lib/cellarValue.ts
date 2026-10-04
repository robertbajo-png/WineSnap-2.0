export type CellarPrice = {
  consumed_at: string | null;
  quantity: number | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  market_price: number | null;
  market_price_currency: string | null;
};

export function summarizeCellarPrices(wines: CellarPrice[], kind: "purchase" | "retail") {
  const groups = new Map<string, { currency: string; total: number; bottles: number }>();
  let excluded = 0;
  for (const wine of wines) {
    if (wine.consumed_at) continue;
    const quantity = wine.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    const price = kind === "purchase" ? wine.purchase_price : wine.market_price;
    const currency = (kind === "purchase" ? wine.purchase_currency : wine.market_price_currency)
      ?.trim()
      .toUpperCase();
    if (
      price == null ||
      !Number.isFinite(price) ||
      price < 0 ||
      !currency ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      excluded += quantity;
      continue;
    }
    const group = groups.get(currency) ?? { currency, total: 0, bottles: 0 };
    group.total += price * quantity;
    group.bottles += quantity;
    groups.set(currency, group);
  }
  return {
    groups: [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    excluded,
  };
}
