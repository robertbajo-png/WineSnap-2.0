import { describe, expect, it, vi } from "vitest";
import { lookupRetailCandidates, parseRetailProduct } from "./retailCatalog.server";
import { wine } from "./testing/retailFixtures";

const raw = {
  productNumber: "1234501",
  productNameBold: "Zehn Morgen",
  productNameThin: "Chardonnay & Weisser Burgunder",
  producerName: "Zehn Morgen",
  vintage: "2023",
  volumeText: "750 ml",
  price: "159,50",
};
describe("catalog adapter", () => {
  it("combines label parts and reads explicit units and decimal prices", () => {
    expect(parseRetailProduct(raw)).toMatchObject({
      price: 159.5,
      volumeMl: 750,
      vintage: 2023,
      name: "Zehn Morgen Chardonnay & Weisser Burgunder",
    });
    expect(parseRetailProduct({ ...raw, volumeText: "75 cl" })?.volumeMl).toBe(750);
    expect(parseRetailProduct({ ...raw, volumeText: "0.75 l" })?.volumeMl).toBe(750);
  });
  it("does not guess units, multipacks or unknown prices", () => {
    expect(parseRetailProduct({ ...raw, volumeText: "6 x 750 ml" })?.volumeMl).toBeNull();
    expect(parseRetailProduct({ ...raw, volumeText: 750 })?.volumeMl).toBeNull();
    for (const change of [
      { price: 0 },
      { price: "free" },
      { currency: "EUR" },
      { productNumber: "../../evil" },
      { vintage: 0 },
    ]) {
      expect(parseRetailProduct({ ...raw, ...change })).toBeNull();
    }
  });
  it("distinguishes empty catalogs from source/format failures", async () => {
    expect(
      await lookupRetailCandidates(wine, undefined, vi.fn().mockResolvedValue(Response.json([]))),
    ).toEqual([]);
    expect(
      await lookupRetailCandidates(
        wine,
        undefined,
        vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
      ),
    ).toEqual([]);
    for (const response of [
      new Response(null, { status: 503 }),
      Response.json({ message: "unavailable" }),
      Response.json("invalid"),
    ]) {
      await expect(
        lookupRetailCandidates(wine, undefined, vi.fn().mockResolvedValue(response)),
      ).rejects.toThrow();
    }
  });
  it("refetches only the confirmed fixed-source product and refuses a different ID", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...raw, productNumber: "99901" }));
    expect(await lookupRetailCandidates(wine, "1234501", fetcher)).toEqual([]);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.bolaget.io/v1/products/1234501");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shares a single total timeout across ID and search calls", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json([raw]));
    await lookupRetailCandidates({ ...wine, systembolaget_id: "1234501" }, undefined, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
  });
});
