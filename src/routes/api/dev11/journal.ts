import { createFileRoute } from "@tanstack/react-router";
import { handleOwnedPrivateJournal } from "@/features/private-journal/runtime.server";

export const Route = createFileRoute("/api/dev11/journal")({
  server: { handlers: { POST: ({ request }) => handleOwnedPrivateJournal(request) } },
});
