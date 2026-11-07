import { randomUUID } from "node:crypto";

export function ownedDemoRecipe() {
  return {
    title: "Rostad blomk\u00e5l & vita b\u00f6nor",
    description: "Rostad blomk\u00e5l, len b\u00f6nkr\u00e4m och citron.",
    servings: 2,
    totalMinutes: 30,
    image: "cauliflower",
    sourceNote: "Demo \u2013 exempeldata, inte ett AI-genererat recept.",
    notes: "",
    ingredients: [
      { id: randomUUID(), name: "blomk\u00e5l", amount: 600, unit: "g" },
      { id: randomUUID(), name: "kokta vita b\u00f6nor", amount: 400, unit: "g" },
      { id: randomUUID(), name: "citron", amount: 1, unit: "pcs" },
      { id: randomUUID(), name: "olivolja", amount: 2, unit: "tbsp" },
    ],
    steps: [
      {
        id: randomUUID(),
        title: "Rosta blomk\u00e5len",
        text: "Dela blomk\u00e5len och v\u00e4nd med olivolja. Rosta tills den \u00e4r mjuk och gyllene; kontrollera under tiden.",
        timerSeconds: 1200,
      },
      {
        id: randomUUID(),
        title: "Mixa b\u00f6nkr\u00e4men",
        text: "Mixa b\u00f6norna med citron och lite vatten. V\u00e4rm f\u00f6rsiktigt och smaka av.",
        timerSeconds: 180,
      },
      {
        id: randomUUID(),
        title: "Servera",
        text: "F\u00f6rdela b\u00f6nkr\u00e4men i sk\u00e5lar och l\u00e4gg blomk\u00e5len ovanp\u00e5.",
        timerSeconds: null,
      },
    ],
  };
}
