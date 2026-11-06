import { describe, expect, it, vi } from "vitest";
import { createRetailMirror, RETAIL_MIRROR_URL } from "./retailMirror.server";
import { parseRetailProduct } from "./retailCatalog.server";
import { priceFreshness, priceIdentity } from "./retailPrices";
import { wine } from "./testing/retailFixtures";

const now = Date.parse("2026-10-23T14:00:00Z");
const raw = {
  productNumber: "2016901",
  productNameBold: "Zehn Morgen",
  productNameThin: "Chardonnay & Weisser Burgunder",
  producerName: "Zehn Morgen",
  vintage: 2023,
  volumeText: "750 ml",
  price: 140,
  categoryLevel1: "Vin",
  packagingLevel1: "Flaska",
  country: "Tyskland",
};
const response = (items: unknown = [raw], headers: Record<string, string> = {}) =>
  Response.json(items, {
    headers: { "last-modified": new Date(now - 3600000).toUTCString(), ...headers },
  });

describe("local community catalog", () => {
  it("streams a fixed public source once for simultaneous cellar and wishlist lookups", async () => {
    const fetcher = vi.fn(async () => response());
    const lookup = createRetailMirror(parseRetailProduct, fetcher, () => now);
    const [a, b] = await Promise.all([lookup(wine), lookup(wine)]);
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ source: "susbolaget.emrik.org", price: 140, packaging: "Flaska" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([
      RETAIL_MIRROR_URL,
      expect.objectContaining({ redirect: "error", cache: "no-store" }),
    ]);
    expect(await lookup(wine, "99901")).toEqual([]);
    expect(await lookup(wine, raw.productNumber)).toHaveLength(1);
  });
  it("does not confuse non-wines, discontinued products, or retained removed products with current quotes", async () => {
    const fetcher = vi.fn(async () =>
      response([
        raw,
        { ...raw, productNumber: "11", categoryLevel1: "Sprit" },
        { ...raw, productNumber: "12", isDiscontinued: true },
        { ...raw, productNumber: "13", lastFound: now },
      ]),
    );
    expect(await createRetailMirror(parseRetailProduct, fetcher, () => now)(wine)).toHaveLength(1);
  });
  it.each<Record<string, string>>([
    { "last-modified": "" },
    { "last-modified": new Date(now - 49 * 3600000).toUTCString() },
    { "last-modified": new Date(now + 3600000).toUTCString() },
    { "content-type": "text/html" },
    { "content-length": String(129 * 1024 * 1024) },
  ])("refuses invalid freshness or response metadata: %j", async (headers) => {
    await expect(
      createRetailMirror(
        parseRetailProduct,
        async () => response([raw], headers),
        () => now,
      )(wine),
    ).rejects.toThrow();
  });
  it("cancels oversized chunked bodies without trusting Content-Length", async () => {
    await expect(
      createRetailMirror(
        parseRetailProduct,
        async () => response(),
        () => now,
        10,
      )(wine),
    ).rejects.toThrow("too large");
  });
  it.each([{}, { products: [raw] }, [raw, raw], [], [null]])(
    "rejects unsupported or ambiguous datasets: %j",
    async (items) => {
      await expect(
        createRetailMirror(
          parseRetailProduct,
          async () => response(items),
          () => now,
        )(wine),
      ).rejects.toThrow();
    },
  );
  it("rejects a truncated stream, backs off, and refreshes rather than serving stale data", async () => {
    let clock = now;
    const fetcher = vi.fn(async () => response());
    const lookup = createRetailMirror(parseRetailProduct, fetcher, () => clock);
    await lookup(wine);
    clock += 25 * 3600000;
    fetcher.mockImplementation(
      async () =>
        new Response('[{"broken":', {
          headers: {
            "content-type": "application/json",
            "last-modified": new Date(clock).toUTCString(),
          },
        }),
    );
    await expect(lookup(wine)).rejects.toThrow();
    await expect(lookup(wine)).rejects.toThrow("temporarily unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock += 61000;
    fetcher.mockImplementation(async () =>
      response([raw], { "last-modified": new Date(clock).toUTCString() }),
    );
    expect(await lookup(wine)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not re-date stale mirror prices or misattribute them to the previous source", async () => {
    const [candidate] = await createRetailMirror(
      parseRetailProduct,
      async () => response(),
      () => now,
    )(wine);
    const quote = {
      ...wine,
      market_price: 140,
      market_price_currency: "SEK",
      market_price_source: candidate.source,
      market_price_checked_at: new Date(now).toISOString(),
      retail_price_status: "matched",
      retail_price_match: {
        ...candidate,
        identity: priceIdentity(wine),
        verification: "automatic",
      },
    };
    expect(priceFreshness(quote, now)).toBe("fresh");
    expect(priceFreshness(quote, now + 49 * 3600000)).toBe("old");
    expect(priceFreshness({ ...quote, market_price_source: "bolaget.io" }, now)).toBe("unverified");
  });
});
