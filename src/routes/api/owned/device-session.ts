import { createFileRoute } from "@tanstack/react-router";
import { handleOwnedDeviceSession } from "@/lib/ownedDeviceSession.server";

export const Route = createFileRoute("/api/owned/device-session")({
  server: { handlers: { POST: ({ request }) => handleOwnedDeviceSession(request) } },
});
