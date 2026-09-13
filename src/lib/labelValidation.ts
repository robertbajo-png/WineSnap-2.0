/**
 * Shared, dependency-free label validation.
 *
 * Imported BOTH by the browser client (src/lib/scanIdentity.ts) and by the
 * Deno edge function (supabase/functions/analyze-wine/index.ts) so client and
 * server apply exactly the same rules. Keep this file free of DOM, Node and
 * Deno APIs and free of imports, so it stays Deno-compatible.
 *
 * Rules, in short: an identity value is only kept when the model claims it read
 * it off the label, is confident enough, quotes evidence that is itself present
 * in the transcribed label text, and ALL of the value's significant words are
 * present in that text. Evidence produced by the same model is not independent
 * proof — this is a consistency check that removes the common failure where a
 * famous wine is substituted for the one actually photographed. It cannot make
 * hallucination impossible.
 */

export type IdentitySource = "label" | "inference" | "unknown";

export type IdentityField = {
  value?: unknown;
  source?: string | null;
  confidence?: number | null;
  evidence?: string | null;
};

export type FieldMeta = {
  confidence: number;
  evidence: string | null;
};

export const MIN_CONFIDENCE = 50;

export const BAD_MARKER =
  /unidentified|not visible|unreadable|illegible|unknown|not specified|n\/a|okänd|kan inte|ej synlig|ej läsbar/i;

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
 * True only when EVERY significant word of `value` appears in the transcribed
 * label text. A half match ("Zehn Zilliken" against "ZEHN MORGEN") is not
 * support.
 */
export function isSupportedByLabelText(value: string, labelText: string): boolean {
  const haystack = ` ${normalizeText(labelText)} `;
  if (haystack.trim().length === 0) return false;

  const tokens = significantTokens(value);
  if (tokens.length === 0) {
    const normalized = normalizeText(value);
    return normalized.length > 0 && haystack.includes(` ${normalized} `);
  }

  return tokens.every((tok) => haystack.includes(` ${tok} `));
}

/** Vintage may be printed in full ("2023") or shortened ("20 / 23", "'23"). */
export function isVintageSupported(vintage: number, labelText: string): boolean {
  const haystack = ` ${normalizeText(labelText)} `;
  const full = String(vintage);
  if (haystack.includes(` ${full} `)) return true;
  const short = full.slice(2);
  return haystack.includes(` ${short} `);
}

export type ParsedField = {
  value: string;
  source: IdentitySource;
  meta: FieldMeta;
};

export function readField(field: unknown): ParsedField | null {
  if (field == null) return null;
  const f = typeof field === "object" ? (field as IdentityField) : { value: field };
  const raw = f.value;
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || BAD_MARKER.test(value)) return null;
  const source = String(f.source ?? "unknown").toLowerCase();
  const confidence = Math.max(0, Math.min(100, Number(f.confidence ?? 0) || 0));
  const evidence = f.evidence == null ? null : String(f.evidence).trim() || null;
  return {
    value,
    source: source === "label" || source === "inference" ? (source as IdentitySource) : "unknown",
    meta: { confidence, evidence },
  };
}

/**
 * The single rule shared by client and server: source, confidence, the quoted
 * evidence AND the value itself must all check out against the label text.
 */
export function isAcceptableField(
  parsed: ParsedField,
  labelText: string,
  supportsValue: (value: string, labelText: string) => boolean = isSupportedByLabelText,
): boolean {
  if (parsed.source !== "label") return false;
  if (parsed.meta.confidence < MIN_CONFIDENCE) return false;
  // A fabricated quote invalidates the field even when the value itself is
  // printed somewhere on the label.
  if (!parsed.meta.evidence) return false;
  if (!isSupportedByLabelText(parsed.meta.evidence, labelText)) return false;
  return supportsValue(parsed.value, labelText);
}

/** Numbers that are genuinely unknown must stay null, never become 0. */
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseVintage(value: string): number | null {
  const year = num(value.replace(/[^0-9]/g, ""));
  if (year == null) return null;
  const maxYear = new Date().getUTCFullYear() + 2;
  if (year < 1800 || year > maxYear) return null;
  return year;
}

/** The label text validation runs against. The user's own text always wins. */
export function authoritativeLabelText(modelLabelText: unknown, userText = ""): string {
  const user = String(userText ?? "").trim();
  if (user) return user;
  return String(modelLabelText ?? "").trim();
}

/**
 * Server-side pass: null out every identity field that fails the shared rules,
 * so an unvalidated value never leaves the edge function.
 */
export function validateIdentity(
  identity: Record<string, unknown> | undefined,
  labelText: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!identity || typeof identity !== "object") return out;

  const shaped = (parsed: ParsedField | null, ok: boolean): IdentityField => ({
    value: parsed && ok ? parsed.value : null,
    source: parsed && ok ? "label" : "unknown",
    confidence: parsed?.meta.confidence ?? 0,
    evidence: parsed?.meta.evidence ?? null,
  });

  for (const [key, raw] of Object.entries(identity)) {
    if (key === "grape_varieties") {
      const list = Array.isArray(raw) ? raw : [];
      out[key] = list
        .map((item) => {
          const parsed = readField(item);
          if (!parsed || !isAcceptableField(parsed, labelText)) return null;
          return shaped(parsed, true);
        })
        .filter((f): f is IdentityField => f !== null);
      continue;
    }

    const parsed = readField(raw);
    if (!parsed) {
      out[key] = shaped(null, false);
      continue;
    }
    if (key === "vintage") {
      const year = parseVintage(parsed.value);
      const ok =
        year != null &&
        isAcceptableField(parsed, labelText, () => isVintageSupported(year, labelText));
      out[key] = shaped(parsed, ok);
      continue;
    }
    if (key === "wine_type") {
      // A style guess, not an identity claim about a specific bottle.
      out[key] = {
        value: parsed.value.toLowerCase() === "unknown" ? null : parsed.value.toLowerCase(),
        source: parsed.source,
        confidence: parsed.meta.confidence,
        evidence: parsed.meta.evidence,
      };
      continue;
    }
    out[key] = shaped(parsed, isAcceptableField(parsed, labelText));
  }

  return out;
}
