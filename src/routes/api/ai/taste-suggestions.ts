import { createFileRoute } from "@tanstack/react-router";
import { handleLocalAi } from "@/lib/localAi.server";

export const Route = createFileRoute("/api/ai/taste-suggestions")({
  server: { handlers: { POST: ({ request }) => handleLocalAi(request, "taste-suggestions") } },
});
