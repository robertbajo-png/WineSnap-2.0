import { attributes } from "./domain";
import { units } from "../kitchen/domain";

const string = { type: "string" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: unknown, maxItems: number) => ({ type: "array", items, maxItems });
export const recipeOutputContract = object({
  title: string,
  description: string,
  servings: { type: "integer", minimum: 1, maximum: 24 },
  totalMinutes: { type: "integer", minimum: 1, maximum: 240 },
  ingredients: {
    ...array(
      object({
        name: string,
        amount: { type: "number", minimum: 0 },
        unit: { type: "string", enum: units },
      }),
      40,
    ),
    minItems: 1,
  },
  steps: {
    ...array(
      object({
        title: string,
        text: string,
        timerSeconds: { type: ["integer", "null"], minimum: 1, maximum: 21600 },
      }),
      20,
    ),
    minItems: 1,
  },
});
export const extractionOutputContract = object({
  candidates: array(
    object({
      attribute: { type: "string", enum: attributes },
      value: string,
      direction: { type: "integer", enum: [-1, 1] },
      quote: string,
    }),
    10,
  ),
});
