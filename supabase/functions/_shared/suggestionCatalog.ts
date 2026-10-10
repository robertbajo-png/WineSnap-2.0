// Identity references, reviewed 2026-10-10. No live stock or price claims.
export const SUGGESTION_CATALOG = [
  {
    catalog_id: "penfolds-bin28",
    producer: "Penfolds",
    wine_name: "Bin 28 Shiraz",
    vintage: 2023,
    region: "South Australia",
    country: "Australia",
    wine_type: "red",
    grape_varieties: ["Shiraz"],
    source_url: "https://www.penfolds.com/en-fr/bin-28-shiraz-2023-cork-8101011.html",
  },
  {
    catalog_id: "cloudy-sauvignon",
    producer: "Cloudy Bay",
    wine_name: "Sauvignon Blanc",
    vintage: 2024,
    region: "Marlborough",
    country: "New Zealand",
    wine_type: "white",
    grape_varieties: ["Sauvignon Blanc"],
    source_url:
      "https://www.cloudybay.com/drupal/sites/default/files/2025-04/CloudyBay-TastingNotes-SauvignonBlanc-2024.pdf",
  },
  {
    catalog_id: "royal-aszu",
    producer: "Royal Tokaji",
    wine_name: "Aszu 5 Puttonyos",
    vintage: 2018,
    region: "Tokaj",
    country: "Hungary",
    wine_type: "dessert",
    grape_varieties: [],
    source_url: "https://royal-tokaji.com/portfolio/royal-tokaji-aszu-5-puttonyos-2018/",
  },
  {
    catalog_id: "taylor-lbv",
    producer: "Taylor's",
    wine_name: "Late Bottled Vintage Port",
    vintage: 2019,
    region: "Douro",
    country: "Portugal",
    wine_type: "fortified",
    grape_varieties: [],
    source_url:
      "https://www.taylor.pt/pt/vinho-do-porto/late-bottled-vintage/late-bottled-vintage-2019",
  },
  {
    catalog_id: "guigal-rhone-red",
    producer: "E. Guigal",
    wine_name: "Cotes du Rhone Rouge",
    vintage: null,
    region: "Cotes du Rhone",
    country: "France",
    wine_type: "red",
    grape_varieties: ["Syrah", "Grenache", "Mourvedre"],
    source_url: "https://www.guigal.com/vin/cotes-du-rhone-rouge/",
  },
  {
    catalog_id: "guigal-rhone-white",
    producer: "E. Guigal",
    wine_name: "Cotes du Rhone Blanc",
    vintage: null,
    region: "Cotes du Rhone",
    country: "France",
    wine_type: "white",
    grape_varieties: [
      "Viognier",
      "Roussanne",
      "Marsanne",
      "Clairette",
      "Bourboulenc",
      "Grenache Blanc",
    ],
    source_url: "https://www.guigal.com/wp-content/uploads/FT_EN_Cotes-du-Rhone-White.pdf",
  },
  {
    catalog_id: "freixenet-cordon",
    producer: "Freixenet",
    wine_name: "Cordon Negro Brut",
    vintage: null,
    region: "Cava",
    country: "Spain",
    wine_type: "sparkling",
    grape_varieties: ["Parellada", "Macabeo", "Xarel-lo"],
    source_url: "https://freixenet.com/ca/en/our-products/cava/cordon-negro-brut/?lang=es",
  },
  {
    catalog_id: "catena-dv-malbec",
    producer: "Catena Zapata",
    wine_name: "DV Catena Malbec-Malbec",
    vintage: null,
    region: "",
    country: "Argentina",
    wine_type: "red",
    grape_varieties: ["Malbec"],
    source_url: "https://catenazapata.com/dv-malbec/",
  },
  {
    catalog_id: "torres-sangre",
    producer: "Familia Torres",
    wine_name: "Sangre de Toro Original",
    vintage: 2024,
    region: "Catalunya",
    country: "Spain",
    wine_type: "red",
    grape_varieties: ["Garnacha", "Carinena"],
    source_url:
      "https://www.torres.es/sites/default/files/2025-12/Torres_Icons_Sangre_de_Toro_2024_ENG.pdf",
  },
  {
    catalog_id: "torres-esmeralda",
    producer: "Familia Torres",
    wine_name: "Vina Esmeralda",
    vintage: null,
    region: "Catalunya",
    country: "Spain",
    wine_type: "white",
    grape_varieties: [],
    source_url: "https://www.torres.es/vinos",
  },
  {
    catalog_id: "torres-clos-blanco",
    producer: "Familia Torres",
    wine_name: "Clos Ancestral Blanco",
    vintage: null,
    region: "Penedes",
    country: "Spain",
    wine_type: "white",
    grape_varieties: [],
    source_url: "https://www.torres.es/vinos",
  },
  {
    catalog_id: "torres-clos-tinto",
    producer: "Familia Torres",
    wine_name: "Clos Ancestral Tinto",
    vintage: null,
    region: "Penedes",
    country: "Spain",
    wine_type: "red",
    grape_varieties: [],
    source_url: "https://www.torres.es/vinos",
  },
];

export function availableSuggestionIds(cellar: Record<string, unknown>[]) {
  const normalized = (value: unknown) =>
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return SUGGESTION_CATALOG.filter(
    (entry) =>
      !cellar.some(
        (wine) =>
          normalized(wine.producer) === normalized(entry.producer) &&
          normalized(wine.wine_name) === normalized(entry.wine_name),
      ),
  ).map((entry) => entry.catalog_id);
}

export function groundedSuggestions(
  input: unknown,
  allowedIds = SUGGESTION_CATALOG.map((wine) => wine.catalog_id),
) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const record = raw as Record<string, unknown>;
    const wine = SUGGESTION_CATALOG.find(
      (entry) => entry.catalog_id === record.catalog_id && allowedIds.includes(entry.catalog_id),
    );
    if (!wine || seen.has(wine.catalog_id)) return [];
    seen.add(wine.catalog_id);
    const scores = {
      body: null,
      tannin: null,
      acidity: null,
      sweetness: null,
      oak: null,
      fruit: null,
    } as Record<"body" | "tannin" | "acidity" | "sweetness" | "oak" | "fruit", number | null>;
    for (const key of ["body", "tannin", "acidity", "sweetness", "oak", "fruit"] as const) {
      const value = record[key];
      scores[key] =
        typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10
          ? value
          : null;
    }
    return [
      {
        ...scores,
        ...wine,
        identity_verified: true,
        style_reason:
          typeof record.style_reason === "string" ? record.style_reason.slice(0, 1500) : "",
      },
    ];
  });
}
