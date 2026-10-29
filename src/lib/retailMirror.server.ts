import { JSONParser } from "@streamparser/json";
import { setImmediate } from "node:timers/promises";
import { exactRetailMatch, type RetailCandidate, type RetailWine } from "./retailPrices";

export const RETAIL_MIRROR_URL = "https://susbolaget.emrik.org/v1/products";
const MAX_SOURCE_AGE = 48 * 3600000;
const CACHE_AGE = 24 * 3600000;
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Keep only validated wine identities, never the full catalog or its image/history fields.
export function createRetailMirror(
  parse: (input: unknown) => RetailCandidate | null,
  fetcher = fetch,
  now = Date.now,
  maxBytes = 128 * 1024 * 1024,
) {
  let cached: { rows: RetailCandidate[]; loaded: number; asOf: number } | undefined;
  let pending: Promise<NonNullable<typeof cached>> | undefined;
  let retryAfter = 0;
  async function load() {
    const signal = AbortSignal.timeout(120000);
    const response = await fetcher(RETAIL_MIRROR_URL, {
      headers: { accept: "application/json" },
      signal,
      cache: "no-store",
      redirect: "error",
    });
    const asOf = Date.parse(response.headers.get("last-modified") ?? "");
    if (
      !response.ok ||
      !response.body ||
      !Number.isFinite(asOf) ||
      asOf < now() - MAX_SOURCE_AGE ||
      asOf > now() + 300000 ||
      !response.headers.get("content-type")?.includes("application/json") ||
      Number(response.headers.get("content-length") ?? 0) > maxBytes
    ) {
      await response.body?.cancel();
      throw new Error("Retail mirror unavailable or outdated");
    }
    const rows = new Map<string, RetailCandidate>();
    const parser = new JSONParser({ paths: ["$.*"], keepStack: false });
    let records = 0;
    parser.onValue = ({ value, key, stack }) => {
      if (typeof key !== "number" || stack.length !== 1 || ++records > 50000)
        throw new Error("Unsupported retail catalog");
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        value.categoryLevel1 !== "Vin" ||
        value.isDiscontinued === true ||
        value.lastFound != null
      )
        return;
      const candidate = parse(value);
      if (!candidate) return;
      if (rows.has(candidate.productNumber)) throw new Error("Duplicate retail product");
      rows.set(candidate.productNumber, {
        ...candidate,
        source: "susbolaget.emrik.org",
        sourceAsOf: new Date(asOf).toISOString(),
      });
    };
    const reader = response.body.getReader();
    let bytes = 0,
      completed = false;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maxBytes) throw new Error("Retail catalog too large");
        parser.write(part.value);
        // Allow health requests and the download deadline to run during large imports.
        await setImmediate();
        signal.throwIfAborted();
      }
      if (!parser.isEnded) parser.end();
      if (!records || !rows.size) throw new Error("Empty or unsupported retail catalog");
      completed = true;
      return { rows: [...rows.values()], asOf, loaded: now() };
    } finally {
      if (!completed) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async function catalog() {
    if (!cached || now() - cached.loaded >= CACHE_AGE || now() - cached.asOf > MAX_SOURCE_AGE) {
      if (now() < retryAfter) throw new Error("Retail catalog temporarily unavailable");
      pending ??= load()
        .then((result) => {
          cached = result;
          return result;
        })
        .catch((error) => {
          retryAfter = now() + 60000;
          throw error;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    if (!cached) throw new Error("Retail catalog unavailable");
    return cached;
  }
  const lookup = async (wine: RetailWine, productNumber?: string) => {
    const cached = await catalog();
    const id = productNumber ?? wine.systembolaget_id;
    if (productNumber) return cached.rows.filter((row) => row.productNumber === productNumber);
    const words = [
      ...new Set(
        normalize([wine.producer, wine.wine_name].filter(Boolean).join(" "))
          .split(" ")
          .filter(Boolean),
      ),
    ];
    return cached.rows
      .filter(
        (row) =>
          row.productNumber === id ||
          (words.length &&
            words.every((word) =>
              normalize(`${row.producer ?? ""} ${row.name} ${row.vintage ?? ""}`)
                .split(" ")
                .includes(word),
            )),
      )
      .sort(
        (a, b) =>
          Number(exactRetailMatch(wine, b)) - Number(exactRetailMatch(wine, a)) ||
          Number(b.productNumber === id) - Number(a.productNumber === id),
      )
      .slice(0, 100);
  };
  return Object.assign(lookup, {
    warm: async () => {
      await catalog();
    },
  });
}
