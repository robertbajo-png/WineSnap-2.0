import { createFileRoute } from "@tanstack/react-router";
import { handleLocalAi } from "@/lib/localAi.server";

export const Route = createFileRoute("/api/ai/ask-winesnap")({
  server: { handlers: { POST: ({ request }) => handleLocalAi(request, "ask-winesnap") } },
});
