import { ownedApi } from "./owned-backend.mjs";

export function ownedWebBuildFlags({
  anon,
  originBuild = {},
  pantryEnabled,
  mealPhotoEnabled,
  pilotEnabled,
}) {
  return {
    ...originBuild,
    VITE_OWNED_BACKEND_ENABLED: "true",
    VITE_SUPABASE_URL: ownedApi,
    VITE_SUPABASE_PUBLISHABLE_KEY: anon,
    VITE_WINE_IMAGE_PROXY_ENABLED: "true",
    VITE_LOCAL_AI_ENABLED: "true",
    VITE_COOKING_CORE_ENABLED: "true",
    VITE_AI_CHEF_ENABLED: "true",
    VITE_MEALS_ENABLED: "true",
    VITE_MEAL_PHOTOS_ENABLED: String(mealPhotoEnabled),
    VITE_PANTRY_ENABLED: String(!!pantryEnabled),
    VITE_RECIPE_NUTRITION_ENABLED: "true",
    VITE_PRIVATE_JOURNAL_ENABLED: "false",
    VITE_PILOT_UI_ENABLED: String(!!pilotEnabled),
    VITE_PRIVACY_CONTROLS_ENABLED: "true",
    VITE_PRIVACY_OPERATIONS_VERIFIED: "true",
    VITE_PRIVACY_SUPPLIERS_VERIFIED: "false",
  };
}
