import { createFileRoute } from "@tanstack/react-router";
import { handleLocalLabelReading } from "@/lib/localAi.server";

export const Route = createFileRoute("/api/ai/analyze-wine")({
  server: { handlers: { POST: ({ request }) => handleLocalLabelReading(request) } },
});
