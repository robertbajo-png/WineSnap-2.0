/**
 * Scan-pipeline helpers for the client.
 *
 * The identity rules themselves live in ./labelValidation.ts, which is shared
 * verbatim with the analyze-wine edge function so client and server cannot
 * drift apart. This file adds the client-only pieces: shaping the response into
 * a wine we can render, the attempt guard, and image input checks.
 */

import {
  authoritativeLabelText,
  isAcceptableField,
  isSupportedByLabelText,
  isVintageSupported,
  normalizeText,
  num,
  parseVintage,
  readField,
  BAD_MARKER,
  MIN_CONFIDENCE,
  type FieldMeta,
  type IdentityField,
  type IdentitySource,
} from "./labelValidation";

export {
  authoritativeLabelText,
  isAcceptableField,
  isSupportedByLabelText,
  isVintageSupported,
  normalizeText,
  MIN_CONFIDENCE,
};
export type { FieldMeta, IdentityField, IdentitySource };

export type AnalyzedWine = {
  producer?: string | null;
  wine_name?: string | null;
  vintage?: number | null;
  grape_varieties?: string[] | null;
  region?: string | null;
  country?: string | null;
  wine_type?: string | null;
  description?: string | null;
  fruit?: number | null;
  tannin?: number | null;
  acidity?: number | null;
  oak?: number | null;
  sweetness?: number | null;
  body?: number | null;
  primary_notes?: string[] | null;
  secondary_notes?: string[] | null;
  tertiary_notes?: string[] | null;
  food_pairings?: unknown;
  serving_temp?: string | null;
  glass_type?: string | null;
  decant?: boolean | null;
};

export type SanitizedAnalysis = {
  wine: AnalyzedWine;
  labelText: string;
  identified: boolean;
  /** Identity fields that the model proposed but that were rejected. */
  rejected: string[];
  meta: Partial<Record<keyof AnalyzedWine, FieldMeta>>;
  /** Lowest confidence among the kept identity fields (0-100). */
  minConfidence: number;
};

type RawAnalysis = {
  label_text?: unknown;
  identity?: Record<string, unknown>;
  taste?: Record<string, unknown>;
  [key: string]: unknown;
};

function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => String(x).trim()).filter((x) => x && !BAD_MARKER.test(x));
  return out.length ? out : null;
}

/**
 * Validate a raw model response into a wine we are willing to show.
 * `userText` is the user's own description in text mode; when present it is the
 * authoritative evidence, even if the model invented a label_text.
 */
export function sanitizeAnalysis(raw: unknown, userText = ""): SanitizedAnalysis {
  const r = (raw ?? {}) as RawAnalysis;
  const labelText = authoritativeLabelText(r.label_text, userText);
  const identity = (r.identity ?? {}) as Record<string, unknown>;
  const taste = (r.taste ?? r) as Record<string, unknown>;

  const rejected: string[] = [];
  const meta: SanitizedAnalysis["meta"] = {};
  const confidences: number[] = [];

  const keep = (key: keyof AnalyzedWine, field: unknown): string | null => {
    const parsed = readField(field);
    if (!parsed) return null;
    if (!isAcceptableField(parsed, labelText)) {
      rejected.push(key as string);
      return null;
    }
    meta[key] = parsed.meta;
    confidences.push(parsed.meta.confidence);
    return parsed.value;
  };

  const producer = keep("producer", identity.producer);
  const wine_name = keep("wine_name", identity.wine_name);
  const region = keep("region", identity.region);
  // No bypass: a country must be supported by the label text like anything else.
  const country = keep("country", identity.country);

  let vintage: number | null = null;
  const vintageParsed = readField(identity.vintage);
  if (vintageParsed) {
    const year = parseVintage(vintageParsed.value);
    const ok =
      year != null &&
      isAcceptableField(vintageParsed, labelText, () => isVintageSupported(year, labelText));
    if (!ok || year == null) {
      rejected.push("vintage");
    } else {
      vintage = year;
      meta.vintage = vintageParsed.meta;
      confidences.push(vintageParsed.meta.confidence);
    }
  }

  let grape_varieties: string[] | null = null;
  const grapeList = Array.isArray(identity.grape_varieties) ? identity.grape_varieties : [];
  const grapes: string[] = [];
  for (const g of grapeList) {
    const parsed = readField(g);
    if (!parsed) continue;
    if (!isAcceptableField(parsed, labelText)) {
      rejected.push("grape_varieties");
      continue;
    }
    grapes.push(parsed.value);
    confidences.push(parsed.meta.confidence);
  }
  if (grapes.length) grape_varieties = grapes;

  const wineTypeParsed = readField(identity.wine_type);
  const wine_type =
    wineTypeParsed && wineTypeParsed.value.toLowerCase() !== "unknown"
      ? wineTypeParsed.value.toLowerCase()
      : null;

  const wine: AnalyzedWine = {
    producer,
    wine_name,
    vintage,
    region,
    country,
    grape_varieties,
    wine_type,
    // Everything below is an estimate derived from the identified wine/style,
    // never a fact read off the label. Unknown stays null, never 0.
    description: (taste.description as string | undefined)?.trim() || null,
    fruit: num(taste.fruit),
    tannin: num(taste.tannin),
    acidity: num(taste.acidity),
    oak: num(taste.oak),
    sweetness: num(taste.sweetness),
    body: num(taste.body),
    primary_notes: strArray(taste.primary_notes),
    secondary_notes: strArray(taste.secondary_notes),
    tertiary_notes: strArray(taste.tertiary_notes),
    food_pairings: taste.food_pairings ?? null,
    serving_temp: (taste.serving_temp as string | undefined)?.trim() || null,
    glass_type: (taste.glass_type as string | undefined)?.trim() || null,
    decant: typeof taste.decant === "boolean" ? taste.decant : null,
  };

  const identified = Boolean(producer || wine_name);

  return {
    wine,
    labelText,
    identified,
    rejected: Array.from(new Set(rejected)),
    meta,
    minConfidence: confidences.length ? Math.min(...confidences) : 0,
  };
}

/** True when a scan should be flagged as uncertain in the confirm screen. */
export function isUncertain(result: SanitizedAnalysis): boolean {
  if (!result.identified) return true;
  if (result.rejected.length > 0) return true;
  if (result.minConfidence < 75) return true;
  const w = result.wine;
  return !w.producer || !w.wine_name || !w.vintage || !w.region || !w.grape_varieties?.length;
}

/* ------------------------------------------------------------------ */
/* Attempt guard: ties a response to the attempt that requested it.    */
/* ------------------------------------------------------------------ */

export type AttemptGuard = {
  /** Start a new attempt; invalidates every earlier one. */
  start: () => number;
  /** True when `id` is still the active attempt. */
  isCurrent: (id: number) => boolean;
  /** Invalidate everything (cancel / unmount). */
  cancel: () => void;
  /** True when an attempt is in flight. */
  isBusy: () => boolean;
  /** Mark the given attempt as finished. */
  finish: (id: number) => void;
};

export function createAttemptGuard(): AttemptGuard {
  let counter = 0;
  let current = 0;
  let busy = false;
  return {
    start() {
      counter += 1;
      current = counter;
      busy = true;
      return current;
    },
    isCurrent: (id) => id === current && current !== 0,
    cancel() {
      current = 0;
      busy = false;
    },
    isBusy: () => busy,
    finish(id) {
      if (id === current) busy = false;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Image input validation                                              */
/* ------------------------------------------------------------------ */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export type ImageCheck =
  | { ok: true; mimeType: string }
  | { ok: false; reason: "type" | "size" | "empty" };

export function checkImageInput(
  file: { type?: string; size?: number } | null | undefined,
): ImageCheck {
  if (!file || !file.size) return { ok: false, reason: "empty" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "size" };
  const type = (file.type || "").toLowerCase();
  if (!ACCEPTED_IMAGE_TYPES.includes(type)) {
    // Some Android cameras report an empty type; default to JPEG.
    if (!type) return { ok: true, mimeType: "image/jpeg" };
    return { ok: false, reason: "type" };
  }
  return { ok: true, mimeType: type };
}

/** Storage extension matching the actual MIME type. */
export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "jpg";
  }
}
