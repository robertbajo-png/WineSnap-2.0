import { createFileRoute } from "@tanstack/react-router";
import { handleLocalPrivacy } from "@/lib/localPrivacy.server";
export const Route = createFileRoute("/api/privacy/privacy-controls")({
  server: { handlers: { POST: ({ request }) => handleLocalPrivacy(request, "privacy-controls") } },
});
