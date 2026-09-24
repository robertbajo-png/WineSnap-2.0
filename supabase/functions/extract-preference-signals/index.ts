import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { requireAiAccess } from "../_shared/aiSecurity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ATTRIBUTES = new Set([
  "overall",
  "body",
  "tannin",
  "acidity",
  "sweetness",
  "oak",
  "fruit",
  "aroma",
  "grape",
  "region",
  "wine_type",
  "producer",
  "price",
]);
const ALLOWED_DIRECTIONS = new Set([
  "like",
  "dislike",
  "prefer",
  "avoid",
  "too_high",
  "too_low",
  "neutral",
]);

const SYSTEM_PROMPT = `Extract only wine preferences explicitly supported by the user's feedback.
Do not infer preferences from general wine knowledge. Preserve the user's meaning and evidence.
Use value_number only for a stated or clearly referenced 0-10 structural value or price.
Return no signal when the statement is ambiguous. ALWAYS use the extract_preference_signals tool.`;

const tool = {
  type: "function",
  function: {
    name: "extract_preference_signals",
    description: "Extract structured, evidence-backed preference signals",
    parameters: {
      type: "object",
      properties: {
        signals: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              attribute: { type: "string", enum: [...ALLOWED_ATTRIBUTES] },
              direction: { type: "string", enum: [...ALLOWED_DIRECTIONS] },
              value_text: { type: ["string", "null"] },
              value_number: { type: ["number", "null"] },
              strength: { type: "number", minimum: 0, maximum: 1 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              evidence: { type: "string" },
            },
            required: [
              "attribute",
              "direction",
              "value_text",
              "value_number",
              "strength",
              "confidence",
              "evidence",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["signals"],
      additionalProperties: false,
    },
  },
};

type ExtractedSignal = {
  attribute: string;
  direction: string;
  value_text: string | null;
  value_number: number | null;
  strength: number;
  confidence: number;
  evidence: string;
};

function validSignal(value: unknown): value is ExtractedSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as Record<string, unknown>;
  return (
    typeof signal.attribute === "string" &&
    ALLOWED_ATTRIBUTES.has(signal.attribute) &&
    typeof signal.direction === "string" &&
    ALLOWED_DIRECTIONS.has(signal.direction) &&
    (signal.value_text === null || typeof signal.value_text === "string") &&
    (signal.value_number === null || typeof signal.value_number === "number") &&
    typeof signal.strength === "number" &&
    signal.strength >= 0 &&
    signal.strength <= 1 &&
    typeof signal.confidence === "number" &&
    signal.confidence >= 0 &&
    signal.confidence <= 1 &&
    typeof signal.evidence === "string"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const access = await requireAiAccess(req, {
    functionName: "extract-preference-signals",
    limit: 20,
    windowSeconds: 300,
    corsHeaders,
  });
  if (access instanceof Response) return access;

  try {
    const { tastingNoteId } = await req.json();
    if (typeof tastingNoteId !== "string" || !tastingNoteId) {
      return new Response(JSON.stringify({ error: "tastingNoteId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !lovableKey)
      throw new Error("Server configuration error");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: note, error: noteError } = await admin
      .from("tasting_notes")
      .select(
        "id,wine_id,notes,rating,wines!inner(producer,wine_name,region,grape_varieties,wine_type)",
      )
      .eq("id", tastingNoteId)
      .eq("user_id", access.userId)
      .maybeSingle();
    if (noteError) throw noteError;
    if (!note) {
      return new Response(JSON.stringify({ error: "Tasting note not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!note.notes?.trim()) {
      return new Response(JSON.stringify({ signals: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              wine: note.wines,
              rating: note.rating,
              feedback: note.notes,
            }),
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_preference_signals" } },
      }),
    });
    if (!response.ok) {
      console.error("Preference extraction failed", response.status, await response.text());
      return new Response(JSON.stringify({ error: "Preference extraction failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const args = result.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { signals: [] };
    const signals = Array.isArray(parsed.signals)
      ? parsed.signals.filter(validSignal).slice(0, 12)
      : [];

    const { error: storeError } = await admin.rpc("replace_extracted_preference_signals", {
      _user_id: access.userId,
      _tasting_note_id: note.id,
      _signals: signals,
    });
    if (storeError) throw storeError;

    return new Response(JSON.stringify({ signals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-preference-signals error", error);
    return new Response(JSON.stringify({ error: "Could not process feedback" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
