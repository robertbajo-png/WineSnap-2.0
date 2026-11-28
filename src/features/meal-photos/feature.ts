import { kitchenEnabled } from "../kitchen/feature";

export const mealPhotosEnabled =
  kitchenEnabled &&
  import.meta.env.VITE_OWNED_BACKEND_ENABLED === "true" &&
  import.meta.env.VITE_LOCAL_AI_ENABLED === "true" &&
  import.meta.env.VITE_MEAL_PHOTOS_ENABLED === "true";
