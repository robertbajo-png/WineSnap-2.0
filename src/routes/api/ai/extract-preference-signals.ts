import { createFileRoute } from "@tanstack/react-router";
import { handleLocalAi } from "@/lib/localAi.server";

export const Route = createFileRoute("/api/ai/extract-preference-signals")({
  server: {
    handlers: { POST: ({ request }) => handleLocalAi(request, "extract-preference-signals") },
  },
});
