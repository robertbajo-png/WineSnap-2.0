import { kitchenEnabled } from "../kitchen/feature";

export const pantryEnabled =
  kitchenEnabled &&
  import.meta.env.VITE_OWNED_BACKEND_ENABLED === "true" &&
  import.meta.env.VITE_PANTRY_ENABLED === "true";
