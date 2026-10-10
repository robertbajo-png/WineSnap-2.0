import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { wishlistPriceDependencies } from "@/lib/wishlistPriceDependencies.server";
import { wishlistRetailWine } from "@/lib/wishlistPriceContract";
import { exactRetailMatch } from "@/lib/retailPrices";

const inputSchema = z.object({
  producer: z.string().trim().min(1).max(160),
  wine_name: z.string().trim().min(1).max(200),
  vintage: z.number().int().min(1800).max(2200),
  bottle_ml: z.number().int().min(50).max(30000),
  country: z.string().max(160).nullable().optional(),
});
export const Route = createFileRoute("/api/public/hooks/match-systembolaget")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await wishlistPriceDependencies.authenticate(request)))
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          const input = inputSchema.safeParse(await request.json().catch(() => null));
          if (!input.success)
            return Response.json(
              { error: "Exact identity and bottle size required" },
              { status: 400 },
            );
          const wine = wishlistRetailWine({
            ...input.data,
            id: "",
            country: input.data.country ?? null,
          });
          const matches = (await wishlistPriceDependencies.lookup(wine)).filter((candidate) =>
            exactRetailMatch(wine, candidate),
          );
          if (matches.length !== 1) return Response.json({ match: null, confidence: 0 });
          const hit = matches[0];
          return Response.json({
            match: {
              systembolaget_id: hit.productNumber,
              url: `https://www.systembolaget.se/produkt/vin/${hit.productNumber}`,
              price: hit.price,
              bottle_ml: hit.volumeMl,
            },
            confidence: 100,
          });
        } catch {
          return Response.json({ error: "Price service unavailable" }, { status: 503 });
        }
      },
    },
  },
});
