import { createFileRoute } from "@tanstack/react-router";
import { handleLocalAi } from "@/lib/localAi.server";

export const Route = createFileRoute("/api/ai/wine-suggestions")({
  server: { handlers: { POST: ({ request }) => handleLocalAi(request, "wine-suggestions") } },
});
