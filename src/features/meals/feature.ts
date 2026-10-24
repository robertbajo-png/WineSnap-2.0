import { chefEnabled } from "../chef/feature";

export const mealsEnabled = chefEnabled && import.meta.env.VITE_MEALS_ENABLED === "true";
