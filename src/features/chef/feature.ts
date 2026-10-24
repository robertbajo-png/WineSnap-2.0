import { kitchenEnabled } from "../kitchen/feature";

export const chefEnabled = kitchenEnabled && import.meta.env.VITE_AI_CHEF_ENABLED === "true";
