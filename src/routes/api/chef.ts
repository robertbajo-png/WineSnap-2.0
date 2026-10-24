import { createFileRoute } from "@tanstack/react-router";
import { handleChef } from "@/lib/chef.server";

export const Route = createFileRoute("/api/chef")({
  server: { handlers: { POST: ({ request }) => handleChef(request) } },
});
