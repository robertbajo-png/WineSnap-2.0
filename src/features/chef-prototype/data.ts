import cauliflowerImage from "./assets/cauliflower.webp";
import pastaImage from "./assets/pasta-source.jpg";
import saladImage from "./assets/salad.webp";

export type RecipeId = "cauliflower" | "pasta" | "salad";
export type Ingredient = { name: string; amount: number; unit: string };
export type Recipe = {
  id: RecipeId;
  title: string;
  shortTitle: string;
  description: string;
  image: string;
  minutes: number;
  category: string;
  tags: string[];
  ingredients: Ingredient[];
  steps: { title: string; text: string; minutes?: number }[];
};

export const recipes: Recipe[] = [
  {
    id: "cauliflower",
    title: "Rostad blomkål & krämiga vita bönor",
    shortTitle: "Rostad blomkål",
    description: "Gyllene kanter, len bönkräm och en rejäl skvätt citron. En liten vardagsfavorit.",
    image: cauliflowerImage,
    minutes: 30,
    category: "Grönt & gott",
    tags: ["Vegetariskt", "Vardagsmiddag"],
    ingredients: [
      { name: "blomkål", amount: 600, unit: "g" },
      { name: "kokta vita bönor, avrunna", amount: 400, unit: "g" },
      { name: "citron", amount: 1, unit: "st" },
      { name: "olivolja", amount: 2, unit: "msk" },
      { name: "vitlöksklyfta", amount: 1, unit: "st" },
      { name: "bladpersilja", amount: 15, unit: "g" },
    ],
    steps: [
      {
        title: "Börja med blomkålen",
        text: "Värm ugnen till 220 °C. Dela blomkålen i jämnstora buketter. Skölj citronen och dela den på mitten.",
      },
      {
        title: "Ge den gyllene kanter",
        text: "Vänd blomkålen med hälften av olivoljan och lite salt. Lägg på en plåt tillsammans med citronen. Rosta tills blomkålen är mjuk med gyllene kanter; kontrollera under tiden.",
        minutes: 20,
      },
      {
        title: "Mixa en len bönkräm",
        text: "Skölj de kokta bönorna. Mixa med vitlök, resten av olivoljan och lite vatten. Tillsätt lite vatten i taget tills krämen är mjuk och len.",
      },
      {
        title: "Smaka av",
        text: "Värm bönkrämen försiktigt i en kastrull. Pressa i lite av den rostade citronen. Smaka av med salt och peppar.",
        minutes: 3,
      },
      {
        title: "Dags att lägga upp",
        text: "Fördela bönkrämen i skålar och lägg på blomkålen. Avsluta med persilja och servera med resten av citronen.",
      },
    ],
  },
  {
    id: "pasta",
    title: "Grön citronpasta med basilika",
    shortTitle: "Grön citronpasta",
    description: "Basilika, färsk spenat och citron. Friskt, grönt och klart på en liten stund.",
    image: pastaImage,
    minutes: 20,
    category: "Snabbt på bordet",
    tags: ["Vegetariskt", "Under 25 min"],
    ingredients: [
      { name: "pasta", amount: 180, unit: "g" },
      { name: "babyspenat", amount: 100, unit: "g" },
      { name: "basilika", amount: 25, unit: "g" },
      { name: "citron", amount: 1, unit: "st" },
      { name: "olivolja", amount: 2, unit: "msk" },
    ],
    steps: [
      {
        title: "Koka upp pastavattnet",
        text: "Koka upp vatten i en kastrull och tillsätt salt. Skölj spenat, basilika och citron.",
      },
      {
        title: "Koka pastan",
        text: "Koka pastan enligt anvisningarna på förpackningen. Spara lite pastavatten innan du häller av.",
      },
      {
        title: "Mixa det gröna",
        text: "Mixa spenat och basilika med olivolja, rivet citronskal och lite citronjuice. Späd med lite pastavatten.",
      },
      {
        title: "Vänd ihop och servera",
        text: "Vänd pastan med den gröna såsen. Smaka av och späd med mer pastavatten om det behövs. Servera direkt.",
      },
    ],
  },
  {
    id: "salad",
    title: "Avokado, grönt & citronvinägrett",
    shortTitle: "Avokado & grönt",
    description:
      "En fräsch sallad med avokado, krispig gurka och citron. God som lätt lunch eller tillbehör.",
    image: saladImage,
    minutes: 15,
    category: "En lättare lunch",
    tags: ["Vegetariskt", "Ingen ugn"],
    ingredients: [
      { name: "avokado", amount: 2, unit: "st" },
      { name: "gurka", amount: 200, unit: "g" },
      { name: "bladsallad", amount: 100, unit: "g" },
      { name: "citron", amount: 1, unit: "st" },
      { name: "olivolja", amount: 1, unit: "msk" },
    ],
    steps: [
      {
        title: "Skölj och skär",
        text: "Skölj sallad och gurka. Skär gurkan i bitar och lägg i en rymlig skål.",
      },
      {
        title: "Blanda dressingen",
        text: "Vispa ihop olivolja, lite citronjuice och en nypa salt. Smaka av.",
      },
      {
        title: "Lägg till avokadon",
        text: "Dela avokadon, ta bort kärnan och skär fruktköttet i skivor. Vänd försiktigt med salladen och dressingen.",
      },
    ],
  },
];

export const ingredientSuggestions = [
  "Blomkål",
  "Vita bönor",
  "Citron",
  "Pasta",
  "Spenat",
  "Avokado",
  "Gurka",
  "Basilika",
];

export type MemoryExample = { id: number; title: string; source: string; confirmed: boolean };
export const initialMemories: MemoryExample[] = [
  {
    id: 1,
    title: "Lite extra citron till det gröna",
    source: "Exempel · feedback på rostad blomkål",
    confirmed: false,
  },
  {
    id: 2,
    title: "Gärna vegetariskt till vardags",
    source: "Exempel · uttalad preferens",
    confirmed: true,
  },
];
