import { createFileRoute } from "@tanstack/react-router";
import { createWishlistPriceHandler } from "@/lib/wishlistPrices.server";
import { wishlistPriceDependencies } from "@/lib/wishlistPriceDependencies.server";

const handler = createWishlistPriceHandler(wishlistPriceDependencies, "manual");
export const Route = createFileRoute("/api/public/hooks/refresh-wishlist-prices")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
