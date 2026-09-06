export type SystembolagetPriceHit = {
  price: number;
  productNumber?: string;
  url?: string;
};

export async function fetchSystembolagetPrice(args: {
  query: string;
  systembolagetId?: string | null;
}): Promise<SystembolagetPriceHit | null> {
  const base = "https://api.bolaget.io/v1";
  const url = args.systembolagetId
    ? `${base}/products/${encodeURIComponent(args.systembolagetId)}`
    : `${base}/products?query=${encodeURIComponent(args.query)}&limit=1`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as unknown;
  const product = Array.isArray(json)
    ? (json[0] as Record<string, unknown> | undefined)
    : (json as Record<string, unknown>);
  if (!product) return null;

  const price = Number(product.price ?? product.priceInclVat ?? product.salesPrice);
  if (!Number.isFinite(price) || price <= 0) return null;

  const productNumber =
    String(product.productNumber ?? product.productId ?? product.nr ?? "").trim() || undefined;
  return {
    price,
    productNumber,
    url: productNumber ? `https://www.systembolaget.se/produkt/vin/${productNumber}` : undefined,
  };
}
