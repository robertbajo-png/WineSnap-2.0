import { createFileRoute } from "@tanstack/react-router";
import { handleMealPhoto } from "@/lib/mealPhoto.server";

export const Route = createFileRoute("/api/ai/analyze-meal-photo")({
  server: { handlers: { POST: ({ request }) => handleMealPhoto(request) } },
});
