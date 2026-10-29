import { kitchenEnabled } from "../kitchen/feature";
export const nutritionEnabled =
  kitchenEnabled && import.meta.env.VITE_RECIPE_NUTRITION_ENABLED === "true";
