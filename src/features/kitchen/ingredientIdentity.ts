import type { units } from "./domain";

export const ingredientBaseUnits = {
  g: "g",
  kg: "g",
  ml: "ml",
  dl: "ml",
  l: "ml",
  tsp: "ml",
  tbsp: "ml",
  pcs: "pcs",
  pinch: "pinch",
} as const satisfies Record<(typeof units)[number], (typeof units)[number]>;

export const normalizeIngredientName = (name: string) =>
  name.trim().replace(/\s+/g, " ").normalize("NFC").toLowerCase();

export const ingredientIdentity = (name: string, unit: (typeof units)[number]) =>
  ingredientBaseUnits[unit] + ":" + normalizeIngredientName(name);
