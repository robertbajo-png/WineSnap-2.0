import { describe, expect, it, vi } from "vitest";
import { createWishlistPriceHandler, type WishlistPriceRow } from "./wishlistPrices.server";
import { verifiedWishlistQuote } from "./wishlistPriceContract";
const id = "11111111-1111-4111-8111-111111111111";
const row: WishlistPriceRow = {
  id,
  user_id: "owner",
  producer: "Maker",
  wine_name: "Cuvee",
  vintage: 2023,
  country: null,
  bottle_ml: 750,
  systembolaget_id: null,
  price_currency: "SEK",
  notify_on_drop: true,
  target_price: 150,
  last_checked_price: 200,
  last_checked_at: null,
  price_alert_triggered_at: null,
  price_alert_seen_at: null,
};
function setup(override: Partial<WishlistPriceRow> = {}) {
  const deps = {
    secret: () => undefined as string | undefined,
    authenticate: vi.fn().mockResolvedValue("owner"),
    load: vi.fn().mockResolvedValue([{ ...row, ...override }]),
    lookup: vi.fn().mockResolvedValue([
      {
        productNumber: "123",
        name: "Cuvee",
        producer: "Maker",
        vintage: 2023,
        volumeMl: 750,
        packaging: "Bottle",
        country: null,
        price: 100,
        currency: "SEK",
      },
    ]),
    save: vi.fn().mockResolvedValue(true),
  };
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ ids: [id] }),
  });
  return { deps, request };
}
describe("wishlist price authorization and alerts", () => {
  it("keeps a quote tied to the exact wishlist identity and does not repeat the same alert", async () => {
    const { deps, request } = setup();
    const repeat = request.clone();
    const handler = createWishlistPriceHandler(deps, "manual");
    await handler(request);
    const patch = deps.save.mock.calls[0][1];
    const quoted = {
      ...row,
      ...patch,
      last_checked_price: 100,
      last_checked_currency: "SEK",
      retail_price_match: patch.retail_price_match,
    };
    expect(verifiedWishlistQuote(quoted)).toBe(true);
    expect(verifiedWishlistQuote({ ...quoted, bottle_ml: 1500 })).toBe(false);
    expect(verifiedWishlistQuote({ ...quoted, vintage: 2022 })).toBe(false);
    deps.load.mockResolvedValue([quoted]);
    expect(await (await handler(repeat)).json()).toMatchObject({ triggered: 0 });
  });
  it("does not compare SEK quotes with EUR targets or overwrite the target currency", async () => {
    const { deps, request } = setup({ price_currency: "EUR", target_price: 150 });
    expect(await (await createWishlistPriceHandler(deps, "manual")(request)).json()).toMatchObject({
      checked: 1,
      triggered: 0,
    });
    expect(deps.save.mock.calls[0][1]).toMatchObject({ last_checked_currency: "SEK" });
    expect(deps.save.mock.calls[0][1]).not.toHaveProperty("price_currency");
  });
  it("fails closed when no cron secret is configured, before loading admin data", async () => {
    const { deps, request } = setup();
    expect((await createWishlistPriceHandler(deps, "cron")(request)).status).toBe(503);
    expect(deps.load).not.toHaveBeenCalled();
  });
  it("rejects invalid cron secret and unauthenticated manual calls", async () => {
    const { deps, request } = setup();
    deps.secret = () => "synthetic-secret";
    expect((await createWishlistPriceHandler(deps, "cron")(request)).status).toBe(401);
    deps.authenticate.mockResolvedValue(null);
    expect((await createWishlistPriceHandler(deps, "manual")(request)).status).toBe(401);
    expect(deps.load).not.toHaveBeenCalled();
  });
  it("scopes manual requests to the owner and does not require a browser cron secret", async () => {
    const { deps, request } = setup();
    const result = await (await createWishlistPriceHandler(deps, "manual")(request)).json();
    expect(deps.load).toHaveBeenCalledWith("owner", [id]);
    expect(result).toMatchObject({ ok: true, checked: 1, triggered: 1, failed: 0 });
  });
  it("refuses mismatched products instead of trusting the first search hit", async () => {
    const { deps, request } = setup({ producer: "Other maker" });
    expect(await (await createWishlistPriceHandler(deps, "manual")(request)).json()).toMatchObject({
      unmatched: 1,
      triggered: 0,
    });
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("does not retrigger an unseen alert or count a failed database save as a notification", async () => {
    const { deps, request } = setup({ price_alert_triggered_at: "2026-10-01" });
    deps.save.mockResolvedValue(false);
    expect(await (await createWishlistPriceHandler(deps, "manual")(request)).json()).toMatchObject({
      ok: false,
      triggered: 0,
      failed: 1,
    });
    expect(deps.save.mock.calls[0][1]).not.toHaveProperty("price_alert_triggered_at");
  });
  it("reports provider failures honestly and leaves old quotes untouched", async () => {
    const { deps, request } = setup();
    deps.lookup.mockRejectedValue(new Error("offline"));
    expect(await (await createWishlistPriceHandler(deps, "manual")(request)).json()).toMatchObject({
      ok: false,
      failed: 1,
    });
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("rejects unexpected owner data and oversized requests", async () => {
    const { deps, request } = setup({ user_id: "another" });
    expect((await createWishlistPriceHandler(deps, "manual")(request)).status).toBe(503);
    expect(deps.lookup).not.toHaveBeenCalled();
    const large = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ids: [id, id, id, id] }),
    });
    expect((await createWishlistPriceHandler(deps, "manual")(large)).status).toBe(400);
  });
  it("does not assume a bottle size or substitute a nearby vintage", async () => {
    const unknown = setup({ bottle_ml: null });
    expect(
      await (await createWishlistPriceHandler(unknown.deps, "manual")(unknown.request)).json(),
    ).toMatchObject({ unmatched: 1 });
    expect(unknown.deps.lookup).not.toHaveBeenCalled();
    const wrongYear = setup({ vintage: 2022 });
    expect(
      await (await createWishlistPriceHandler(wrongYear.deps, "manual")(wrongYear.request)).json(),
    ).toMatchObject({ unmatched: 1 });
    expect(wrongYear.deps.save).not.toHaveBeenCalled();
  });
});
