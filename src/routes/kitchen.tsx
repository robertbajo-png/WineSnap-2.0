import { createFileRoute } from "@tanstack/react-router";
import { KitchenPage } from "@/features/kitchen/KitchenPage";
import { kitchenEnabled } from "@/features/kitchen/feature";
export const Route = createFileRoute("/kitchen")({
  // Generic SSR shell only; private content is loaded after client-side authorization.
  head: () => ({
    meta: [
      { title: "Köket | WineSnap" },
      { name: "robots", content: "noindex" },
      ...(kitchenEnabled ? [{ name: "winesnap-kitchen-shell", content: "public-v1" }] : []),
    ],
  }),
  component: KitchenPage,
});
