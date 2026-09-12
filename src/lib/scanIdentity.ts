/**
 * Pure helpers for the wine scan pipeline.
 *
 * The AI model returns a transcription of the visible label text plus one entry
 * per identity field with a declared source. We never trust inferred identity:
 * a producer / wine name / vintage / region / grape is only kept when the model
 * says it read it off the label AND the value is actually supported by the
 * transcribed text. Evidence from the same model is not independent proof, so
 * this is a consistency check, not a guarantee against hallucination — but it
 * removes the common failure where the model swaps in a famous wine it knows.
 */

export type IdentitySource = "label" | "inference" | "unknown";

export type IdentityField = {
  value?: unknown;
  source?: string | null;
  confidence?: number | null;
  evidence?: string | null;
};

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

export type FieldMeta = {
  confidence: number;
  evidence: string | null;
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

const BAD_MARKER =
  /unidentified|not visible|unreadable|illegible|unknown|not specified|n\/a|okänd|kan inte|ej synlig|ej läsbar/i;

const MIN_CONFIDENCE = 50;

const STOPWORDS = new Set([
  "wine",
  "wines",
  "weingut",
  "weinguts",
  "winery",
  "estate",
  "domaine",
  "domain",
  "chateau",
  "château",
  "castello",
  "tenuta",
  "bodega",
  "bodegas",
  "cantina",
  "quinta",
  "the",
  "and",
  "und",
  "der",
  "die",
  "das",
  "del",
  "della",
  "des",
  "de",
  "di",
  "du",
  "da",
  "la",
  "le",
  "el",
  "vin",
  "vino",
  "wein",
  "cuvee",
  "cuvée",
  "reserva",
  "reserve",
]);

export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok));
}

/**
 * True when the value plausibly appears in the transcribed label text.
 * Requires a majority of the value's significant tokens to be present.
 */
export function isSupportedByLabelText(value: string, labelText: string): boolean {
  const haystack = ` ${normalizeText(labelText)} `;
  if (haystack.trim().length === 0) return false;

  const tokens = significantTokens(value);
  if (tokens.length === 0) {
    const normalized = normalizeText(value);
    return normalized.length > 0 && haystack.includes(` ${normalized} `);
  }

  const hits = tokens.filter((tok) => haystack.includes(` ${tok} `)).length;
  return hits >= Math.ceil(tokens.length / 2);
}

/** Vintage may be printed in full ("2023") or shortened ("20 / 23", "'23"). */
export function isVintageSupported(vintage: number, labelText: string): boolean {
  const haystack = ` ${normalizeText(labelText)} `;
  const full = String(vintage);
  if (haystack.includes(` ${full} `)) return true;
  const short = full.slice(2);
  return haystack.includes(` ${short} `);
}

function readField(field: unknown): { value: string; meta: FieldMeta; source: IdentitySource } | null {
  if (field == null) return null;
  const f = typeof field === "object" ? (field as IdentityField) : { value: field };
  const raw = f.value;
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || BAD_MARKER.test(value)) return null;
  const source = (String(f.source ?? "unknown").toLowerCase() as IdentitySource) ?? "unknown";
  const confidence = Math.max(0, Math.min(100, Number(f.confidence ?? 0) || 0));
  return {
    value,
    source: source === "label" || source === "inference" ? source : "unknown",
    meta: { confidence, evidence: f.evidence ? String(f.evidence) : null },
  };
}

type RawAnalysis = {
  label_text?: unknown;
  identity?: Record<string, unknown>;
  taste?: Record<string, unknown>;
  [key: string]: unknown;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => String(x).trim()).filter((x) => x && !BAD_MARKER.test(x));
  return out.length ? out : null;
}

/**
 * Validate a raw model response into a wine we are willing to show.
 * `fallbackLabelText` is used for text-mode scans, where the user's own
 * description is the evidence instead of a photographed label.
 */
export function sanitizeAnalysis(raw: unknown, fallbackLabelText = ""): SanitizedAnalysis {
  const r = (raw ?? {}) as RawAnalysis;
  const labelText = String(r.label_text ?? "").trim() || fallbackLabelText.trim();
  const identity = (r.identity ?? {}) as Record<string, unknown>;
  const taste = (r.taste ?? r) as Record<string, unknown>;

  const rejected: string[] = [];
  const meta: SanitizedAnalysis["meta"] = {};
  const confidences: number[] = [];

  const keep = (
    key: keyof AnalyzedWine,
    field: unknown,
    supported: (value: string) => boolean,
  ): string | null => {
    const parsed = readField(field);
    if (!parsed) return null;
    if (parsed.source !== "label" || parsed.meta.confidence < MIN_CONFIDENCE) {
      rejected.push(key as string);
      return null;
    }
    if (!supported(parsed.value)) {
      rejected.push(key as string);
      return null;
    }
    meta[key] = parsed.meta;
    confidences.push(parsed.meta.confidence);
    return parsed.value;
  };

  const supportedBy = (value: string) => isSupportedByLabelText(value, labelText);

  const producer = keep("producer", identity.producer, supportedBy);
  const wine_name = keep("wine_name", identity.wine_name, supportedBy);
  const region = keep("region", identity.region, supportedBy);
  // Country is usually printed, but may also be implied by an appellation we
  // already accepted; still require the model to claim it read it.
  const country = keep("country", identity.country, (v) => supportedBy(v) || Boolean(region));

  let vintage: number | null = null;
  const vintageParsed = readField(identity.vintage);
  if (vintageParsed) {
    const year = num(vintageParsed.value.replace(/[^0-9]/g, ""));
    const maxYear = new Date().getUTCFullYear() + 2;
    if (
      year == null ||
      year < 1800 ||
      year > maxYear ||
      vintageParsed.source !== "label" ||
      vintageParsed.meta.confidence < MIN_CONFIDENCE ||
      !isVintageSupported(year, labelText)
    ) {
      rejected.push("vintage");
    } else {
      vintage = year;
      meta.vintage = vintageParsed.meta;
      confidences.push(vintageParsed.meta.confidence);
    }
  }

  let grape_varieties: string[] | null = null;
  const grapesRaw = identity.grape_varieties;
  const grapeList = Array.isArray(grapesRaw) ? grapesRaw : [];
  const grapes: string[] = [];
  for (const g of grapeList) {
    const parsed = readField(g);
    if (!parsed) continue;
    if (parsed.source !== "label" || parsed.meta.confidence < MIN_CONFIDENCE) {
      rejected.push("grape_varieties");
      continue;
    }
    if (!supportedBy(parsed.value)) {
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
    // never a fact read off the label.
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
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export type ImageCheck = { ok: true; mimeType: string } | { ok: false; reason: "type" | "size" | "empty" };

export function checkImageInput(file: { type?: string; size?: number } | null | undefined): ImageCheck {
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
