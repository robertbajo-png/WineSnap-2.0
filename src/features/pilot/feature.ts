import { kitchenEnabled } from "../kitchen/feature";

export const pilotUiEnabled =
  import.meta.env.VITE_PILOT_UI_ENABLED === "true" &&
  import.meta.env.VITE_OWNED_BACKEND_ENABLED === "true" &&
  kitchenEnabled;
