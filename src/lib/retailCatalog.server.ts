import { z } from "zod";
import { retailCandidateSchema, type RetailCandidate, type RetailWine } from "./retailPrices";

const catalogRecord = z.record(z.string(), z.unknown());
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}
function numeric(value: unknown) {
  if (typeof value === "number") return value;
  const raw = text(value);
  return raw && /^\d+(?:[.,]\d+)?$/.test(raw) ? Number(raw.replace(",", ".")) : null;
}
function volume(product: Record<string, unknown>) {
  const ml = numeric(product.volumeMl ?? product.volumeInMilliliters);
  if (ml !== null) return ml;
  const match = text(product.volumeText ?? product.volume)?.match(
    /^(\d+(?:[.,]\d+)?)\s*(ml|cl|l)$/i,
  );
  return match
    ? Number(match[1].replace(",", ".")) * ({ ml: 1, cl: 10, l: 1000 }[match[2].toLowerCase()] ?? 0)
    : null;
}
export function parseRetailProduct(input: unknown): RetailCandidate | null {
  const parsed = catalogRecord.safeParse(input);
  if (!parsed.success) return null;
  const p = parsed.data;
  const id = p.productNumber ?? p.productId ?? p.nr;
  const name = [text(p.productNameBold), text(p.productNameThin)].filter(Boolean).join(" ");
  const candidate = retailCandidateSchema.safeParse({
    productNumber: typeof id === "number" || typeof id === "string" ? String(id) : "",
    name: name || text(p.productName ?? p.name),
    producer: text(p.producerName ?? p.producer),
    vintage: numeric(p.vintage),
    volumeMl: volume(p),
    packaging: text(p.packagingType ?? p.packageType),
    country: text(p.country),
    price: numeric(p.price ?? p.priceInclVat ?? p.salesPrice),
    currency: text(p.currency) ?? "SEK",
  });
  return candidate.success ? candidate.data : null;
}
function products(input: unknown): unknown[] {
  if (Array.isArray(input)) return input.slice(0, 100);
  const parsed = catalogRecord.safeParse(input);
  if (!parsed.success) throw new Error("Unsupported catalog response");
  if (Array.isArray(parsed.data.products)) return parsed.data.products.slice(0, 100);
  if (Array.isArray(parsed.data.data)) return parsed.data.data.slice(0, 100);
  return [input];
}
export async function lookupRetailCandidates(
  wine: RetailWine,
  productNumber?: string,
  fetcher = fetch,
): Promise<RetailCandidate[]> {
  const base = "https://api.bolaget.io/v1";
  const urls: string[] = [];
  const id = productNumber ?? wine.systembolaget_id;
  if (id && /^\d{1,20}$/.test(id)) urls.push(`${base}/products/${id}`);
  const query = [wine.producer, wine.wine_name].filter(Boolean).join(" ").trim();
  if (!productNumber && query)
    urls.push(`${base}/products?query=${encodeURIComponent(query)}&limit=10`);
  const signal = AbortSignal.timeout(6000);
  const found = new Map<string, RetailCandidate>();
  for (const url of urls) {
    const response = await fetcher(url, { headers: { accept: "application/json" }, signal });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error("Catalog unavailable");
    const records = products(await response.json());
    const valid = records.map(parseRetailProduct).filter((p): p is RetailCandidate => p !== null);
    if (records.length && !valid.length) throw new Error("Unsupported catalog response");
    for (const candidate of valid) {
      if (!productNumber || candidate.productNumber === productNumber)
        found.set(candidate.productNumber, candidate);
    }
  }
  return [...found.values()];
}
