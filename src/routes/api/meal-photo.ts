import { createFileRoute } from "@tanstack/react-router";
import { handleMealPhotoStorage } from "@/lib/mealPhotoStorage.server";

export const Route = createFileRoute("/api/meal-photo")({
  server: {
    handlers: {
      GET: ({ request }) => handleMealPhotoStorage(request),
      POST: ({ request }) => handleMealPhotoStorage(request),
      DELETE: ({ request }) => handleMealPhotoStorage(request),
    },
  },
});
