import { recipes } from "../chef-prototype/data";
import type { RecipeDocument } from "./domain";

export const recipeImages = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe.image]));
export const startingRecipes: RecipeDocument[] = recipes.map((recipe, index) => ({
  title: recipe.title,
  description: recipe.description,
  servings: 2,
  totalMinutes: recipe.minutes,
  image: recipe.id,
  notes: "",
  sourceNote:
    "WineSnaps startrecept. Kontrollera ingredienser och allergenmärkning. Tillagningstid är ungefärlig, inte ett säkerhetsmått.",
  ingredients: recipe.ingredients.map((ingredient, i) => ({
    id: `10000000-0000-4000-8000-${String(index * 100 + i).padStart(12, "0")}`,
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit === "st" ? "pcs" : ingredient.unit === "msk" ? "tbsp" : "g",
  })),
  steps: recipe.steps.map((step, i) => ({
    id: `20000000-0000-4000-8000-${String(index * 100 + i).padStart(12, "0")}`,
    title: step.title,
    text: step.text,
    timerSeconds: step.minutes ? step.minutes * 60 : null,
  })),
}));
export function blankRecipe(): RecipeDocument {
  return {
    title: "",
    description: "",
    servings: 2,
    totalMinutes: 30,
    image: "none",
    sourceNote: "Eget recept",
    notes: "",
    ingredients: [{ id: crypto.randomUUID(), name: "", amount: 1, unit: "pcs" }],
    steps: [{ id: crypto.randomUUID(), title: "", text: "", timerSeconds: null }],
  };
}
