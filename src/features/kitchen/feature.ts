import { approvedCookingBrowser } from "@/lib/backendScope";

export const kitchenEnabled =
  import.meta.env.VITE_COOKING_CORE_ENABLED === "true" &&
  approvedCookingBrowser(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_OWNED_BACKEND_ENABLED,
  );
