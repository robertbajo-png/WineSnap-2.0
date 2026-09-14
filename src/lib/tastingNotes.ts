export type AromaDraft = { name: string; active: boolean; intensity: number | null };

export type TastingNoteDraft = {
  rating: number | null;
  aromas: AromaDraft[];
  body: number | null;
  tannin: number | null;
  acidity: number | null;
  sweetness: number | null;
  finish: "Short" | "Medium" | "Long" | null;
  summary: string;
  location: string;
  tastedAt: string;
};

export type StoredTastingNote = {
  rating: number | null;
  aromas: string[] | null;
  aroma_intensities?: unknown;
  body: number | null;
  tannin: number | null;
  acidity: number | null;
  sweetness: number | null;
  finish: string | null;
  notes: string | null;
  location: string | null;
  tasted_at: string;
};

export const EMPTY_TASTING_NOTE = (date: string): TastingNoteDraft => ({
  rating: null,
  aromas: [],
  body: null,
  tannin: null,
  acidity: null,
  sweetness: null,
  finish: null,
  summary: "",
  location: "",
  tastedAt: date,
});

function validIntensity(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : null;
}

export function normalizeIntensities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([name, intensity]) => [name, validIntensity(intensity)] as const)
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );
}

export function draftFromStored(note: StoredTastingNote): TastingNoteDraft {
  const intensities = normalizeIntensities(note.aroma_intensities);
  return {
    rating: note.rating,
    aromas: (note.aromas ?? []).map((name) => ({
      name,
      active: true,
      intensity: intensities[name] ?? null,
    })),
    body: note.body,
    tannin: note.tannin,
    acidity: note.acidity,
    sweetness: note.sweetness,
    finish:
      note.finish === "Short" || note.finish === "Medium" || note.finish === "Long"
        ? note.finish
        : null,
    summary: note.notes ?? "",
    location: note.location ?? "",
    tastedAt: note.tasted_at,
  };
}

export function buildTastingNoteInsert(draft: TastingNoteDraft, userId: string, wineId: string) {
  const active = draft.aromas.filter((aroma) => aroma.active);
  const aromaIntensities = Object.fromEntries(
    active
      .filter((aroma) => validIntensity(aroma.intensity) !== null)
      .map((aroma) => [aroma.name, aroma.intensity as number]),
  );
  return {
    user_id: userId,
    wine_id: wineId,
    rating: draft.rating,
    aromas: active.map((aroma) => aroma.name),
    aroma_intensities: aromaIntensities,
    body: draft.body,
    tannin: draft.tannin,
    acidity: draft.acidity,
    sweetness: draft.sweetness,
    finish: draft.finish,
    notes: draft.summary.trim() || null,
    location: draft.location.trim() || null,
    tasted_at: draft.tastedAt,
  };
}

export function createSaveGuard() {
  let saving = false;
  return {
    tryStart() {
      if (saving) return false;
      saving = true;
      return true;
    },
    finish() {
      saving = false;
    },
  };
}