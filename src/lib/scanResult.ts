import type { AnalyzedWine } from "./scanIdentity";

export const SCAN_WINE_TYPES = [
  "red",
  "white",
  "rose",
  "sparkling",
  "dessert",
  "fortified",
] as const;

export type ScanIdentityDraft = {
  producer: string;
  wine_name: string;
  vintage: string;
  region: string;
  country: string;
  grape_varieties: string;
  wine_type: string;
};

export function scanIdentityDraft(wine: AnalyzedWine): ScanIdentityDraft {
  return {
    producer: wine.producer ?? "",
    wine_name: wine.wine_name ?? "",
    vintage: wine.vintage == null ? "" : String(wine.vintage),
    region: wine.region ?? "",
    country: wine.country ?? "",
    grape_varieties: (wine.grape_varieties ?? []).join(", "),
    wine_type: SCAN_WINE_TYPES.includes(wine.wine_type as (typeof SCAN_WINE_TYPES)[number])
      ? wine.wine_type!
      : "",
  };
}

export function applyScanIdentity(
  wine: AnalyzedWine,
  draft: ScanIdentityDraft,
): { wine: AnalyzedWine; changed: boolean } | { error: "identity" | "vintage" | "type" } {
  const producer = draft.producer.trim() || null;
  const wine_name = draft.wine_name.trim() || null;
  if (!producer && !wine_name) return { error: "identity" };
  const year = draft.vintage.trim();
  const vintage = year ? Number(year) : null;
  if (
    year &&
    (!/^\d{4}$/.test(year) || vintage! < 1800 || vintage! > new Date().getUTCFullYear() + 2)
  )
    return { error: "vintage" };
  if (
    draft.wine_type &&
    !SCAN_WINE_TYPES.includes(draft.wine_type as (typeof SCAN_WINE_TYPES)[number])
  )
    return { error: "type" };

  const grapes = draft.grape_varieties
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const updated: AnalyzedWine = {
    ...wine,
    producer,
    wine_name,
    vintage,
    region: draft.region.trim() || null,
    country: draft.country.trim() || null,
    grape_varieties: grapes.length ? grapes : null,
    wine_type: draft.wine_type || null,
  };
  const changed =
    JSON.stringify(scanIdentityDraft(wine)) !== JSON.stringify(scanIdentityDraft(updated));
  if (!changed) return { wine, changed: false };

  // An estimate of the original identification is not an estimate of a corrected wine.
  return {
    changed: true,
    wine: {
      ...updated,
      description: null,
      fruit: null,
      tannin: null,
      acidity: null,
      oak: null,
      sweetness: null,
      body: null,
      primary_notes: null,
      secondary_notes: null,
      tertiary_notes: null,
      food_pairings: null,
      serving_temp: null,
      glass_type: null,
      decant: null,
    },
  };
}

export function scanAromas(wine: AnalyzedWine): string[] {
  const seen = new Set<string>();
  return [
    ...(wine.primary_notes ?? []),
    ...(wine.secondary_notes ?? []),
    ...(wine.tertiary_notes ?? []),
  ]
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function scanPairings(value: unknown): { dish: string; reason: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((pair) => {
    if (!pair || typeof pair !== "object" || typeof pair.dish !== "string" || !pair.dish.trim())
      return [];
    return [
      {
        dish: pair.dish.trim(),
        reason: typeof pair.reason === "string" ? pair.reason.trim() || null : null,
      },
    ];
  });
}

export function scanTasteBand(value: number | null | undefined): "low" | "medium" | "high" | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 10) return null;
  return value <= 3 ? "low" : value <= 6 ? "medium" : "high";
}
