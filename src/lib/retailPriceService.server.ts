import {
  acceptedRetailMatch,
  canConfirmPrice,
  exactRetailMatch,
  missingPriceSchema,
  priceCandidates,
  priceIdentity,
  priceRequestSchema,
  retailQuoteSchema,
  sameCatalogProduct,
  type PriceResult,
  type RetailCandidate,
  type RetailWine,
} from "./retailPrices";

type Dependencies = {
  authenticate: (request: Request) => Promise<string | null>;
  load: (userId: string, ids: string[]) => Promise<RetailWine[]>;
  lookup: (wine: RetailWine, productNumber?: string) => Promise<RetailCandidate[]>;
  save: (userId: string, wine: RetailWine, patch: Record<string, unknown>) => Promise<boolean>;
  now?: () => string;
};
export function createRetailPriceHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const userId = await deps.authenticate(request);
      if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const parsed = priceRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success)
        return Response.json({ error: "Invalid price request" }, { status: 400 });
      const input = parsed.data;
      const ids = input.action === "refresh" ? [...new Set(input.wineIds)] : [input.wineId];
      const rows = await deps.load(userId, ids);
      const results = await Promise.all(
        ids.map(async (wineId): Promise<PriceResult> => {
          const wine = rows.find((w) => w.id === wineId);
          if (!wine || wine.consumed_at || (wine.quantity ?? 1) <= 0)
            return { wineId, status: "skipped" };
          const attemptedAt = (deps.now ?? (() => new Date().toISOString()))();
          const save = async (
            patch: Record<string, unknown>,
            status: PriceResult["status"],
          ): Promise<PriceResult> => ({
            wineId,
            status: (await deps.save(userId, wine, {
              ...patch,
              retail_price_attempted_at: attemptedAt,
            }))
              ? status
              : "changed",
          });
          const matched = (candidate: RetailCandidate, verification: "automatic" | "manual") => {
            const bottleMl = wine.bottle_ml ?? candidate.volumeMl;
            return save(
              {
                bottle_ml: bottleMl,
                market_price: candidate.price,
                market_price_currency: candidate.currency,
                market_price_source: "bolaget.io",
                market_price_checked_at: attemptedAt,
                systembolaget_id: candidate.productNumber,
                systembolaget_url: `https://www.systembolaget.se/produkt/vin/${candidate.productNumber}`,
                retail_price_status: "matched",
                retail_price_candidates: null,
                retail_price_match: {
                  ...candidate,
                  identity: priceIdentity({ ...wine, bottle_ml: bottleMl }),
                  verification,
                },
              },
              "matched",
            );
          };
          try {
            if (input.action === "confirm") {
              const pending = priceCandidates(wine).find(
                (c) => c.productNumber === input.productNumber,
              );
              if (!pending || !canConfirmPrice(wine, pending)) return { wineId, status: "changed" };
              const current = (await deps.lookup(wine, input.productNumber)).find(
                (c) => c.productNumber === input.productNumber,
              );
              if (
                !current ||
                !canConfirmPrice(wine, current) ||
                !sameCatalogProduct(pending, current)
              )
                return { wineId, status: "changed" };
              return await matched(current, "manual");
            }
            const candidates = await deps.lookup(wine);
            const matches = candidates.filter((c) => acceptedRetailMatch(wine, c));
            if (matches.length === 1) {
              const previous = retailQuoteSchema.safeParse(wine.retail_price_match);
              const verification = exactRetailMatch(wine, matches[0])
                ? "automatic"
                : previous.success
                  ? previous.data.verification
                  : "automatic";
              return await matched(matches[0], verification);
            }
            if (candidates.length) {
              const ordered = [...candidates].sort(
                (a, b) => Number(canConfirmPrice(wine, b)) - Number(canConfirmPrice(wine, a)),
              );
              return await save(
                {
                  retail_price_status: "review",
                  retail_price_candidates: {
                    identity: priceIdentity(wine),
                    candidates: ordered.slice(0, 5),
                  },
                },
                "review",
              );
            }
            return await save(
              { retail_price_status: "missing", retail_price_candidates: null },
              "missing",
            );
          } catch {
            try {
              return await save({ retail_price_status: "error" }, "error");
            } catch {
              return { wineId, status: "error" };
            }
          }
        }),
      );
      return Response.json({ results });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
      return Response.json(
        { error: missingPriceSchema({ code }) ? "migration_required" : "unavailable" },
        { status: 503 },
      );
    }
  };
}
