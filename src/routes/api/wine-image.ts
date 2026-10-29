import { createFileRoute } from "@tanstack/react-router";
import { handleOwnedWineImage } from "@/lib/ownedWineImage.server";

export const Route = createFileRoute("/api/wine-image")({
  server: { handlers: { POST: ({ request }) => handleOwnedWineImage(request) } },
});
