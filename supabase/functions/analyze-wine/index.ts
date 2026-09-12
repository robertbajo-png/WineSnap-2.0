// Edge function: analyze-wine
// Receives { imageBase64, mimeType } or { imageUrl } or { text } and returns a
// structured reading of the label via Lovable AI vision.
//
// Contract: the model must FIRST transcribe the visible label text, and may only
// identify the wine from that transcription. Identity fields carry their own
// source ("label" | "inference" | "unknown"), confidence and evidence quote.
// Identity is never invented: unknown stays unknown. Taste/serving values are
// explicitly estimates and are kept separate from the read facts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a careful wine label reader.

STEP 1 — Transcribe. Write every piece of text you can actually see on the label into label_text, verbatim, line by line, including partial words, numbers and years. Do not add words that are not visible.

STEP 2 — Identify ONLY from that transcription. For each identity field set:
- value: exactly what the label says (or null),
- source: "label" only if the value is literally supported by label_text, otherwise "inference" or "unknown",
- confidence: 0-100,
- evidence: the exact snippet of label_text that supports the value.

HARD RULES:
- Never fill an identity gap with a guess. No plausible producer, vintage, region, appellation or grape. If it is not on the label, value = null and source = "unknown".
- Never substitute a famous or similar wine you happen to know. If the label text does not match a wine you recognise, keep the label's own words.
- If the image is blurry, cropped or shows no label text, return label_text as best you can and leave identity values null.

STEP 3 — Taste estimates. The taste block (structure, notes, pairings, serving) is an ESTIMATE based on the identified wine or its style. Only fill it if at least a wine name or producer was read; otherwise leave the values null.

Respond in English. ALWAYS use the extract_wine tool.`;

const identityField = (description: string) => ({
  type: "object",
  properties: {
    value: { type: ["string", "null"], description },
    source: { type: "string", enum: ["label", "inference", "unknown"] },
    confidence: { type: "number", description: "0-100" },
    evidence: { type: ["string", "null"], description: "Exact snippet from label_text" },
  },
  required: ["value", "source", "confidence", "evidence"],
  additionalProperties: false,
});

const wineTool = {
  type: "function",
  function: {
    name: "extract_wine",
    description: "Transcribe the label, then report what it says about the wine.",
    parameters: {
      type: "object",
      properties: {
        label_text: {
          type: "string",
          description: "Verbatim transcription of all visible label text (empty string if none)",
        },
        identity: {
          type: "object",
          properties: {
            producer: identityField("Producer / winery exactly as printed"),
            wine_name: identityField("Wine name / cuvée exactly as printed"),
            vintage: identityField("Vintage year as printed, e.g. '2023' or '23'"),
            region: identityField("Region or appellation as printed"),
            country: identityField("Country as printed or unambiguously given by the appellation"),
            wine_type: identityField("red, white, rose, sparkling, dessert, fortified, orange"),
            grape_varieties: {
              type: "array",
              items: identityField("Grape variety as printed"),
              description: "Only grapes actually named on the label",
            },
          },
          required: [
            "producer",
            "wine_name",
            "vintage",
            "region",
            "country",
            "wine_type",
            "grape_varieties",
          ],
          additionalProperties: false,
        },
        taste: {
          type: "object",
          description: "ESTIMATES derived from the identified wine/style, not read from the label",
          properties: {
            description: { type: ["string", "null"] },
            fruit: { type: ["number", "null"] },
            tannin: { type: ["number", "null"] },
            acidity: { type: ["number", "null"] },
            oak: { type: ["number", "null"] },
            sweetness: { type: ["number", "null"] },
            body: { type: ["number", "null"] },
            primary_notes: { type: "array", items: { type: "string" } },
            secondary_notes: { type: "array", items: { type: "string" } },
            tertiary_notes: { type: "array", items: { type: "string" } },
            food_pairings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  dish: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["dish", "reason"],
                additionalProperties: false,
              },
            },
            serving_temp: { type: ["string", "null"] },
            glass_type: { type: ["string", "null"] },
            decant: { type: ["boolean", "null"] },
          },
          required: [
            "description",
            "fruit",
            "tannin",
            "acidity",
            "oak",
            "sweetness",
            "body",
            "primary_notes",
            "secondary_notes",
            "tertiary_notes",
            "food_pairings",
            "serving_temp",
            "glass_type",
            "decant",
          ],
          additionalProperties: false,
        },
      },
      required: ["label_text", "identity", "taste"],
      additionalProperties: false,
    },
  },
};

type Field = { value: unknown; source?: string; confidence?: number; evidence?: string | null };

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_BASE64_CHARS = 18_000_000; // ~13 MB binary

/** Defence in depth: strip identity the model did not claim to have read. */
function scrubIdentity(identity: Record<string, unknown> | undefined) {
  if (!identity || typeof identity !== "object") return {};
  const clean = (f: unknown): Field | null => {
    if (!f || typeof f !== "object") return null;
    const field = f as Field;
    const source = String(field.source ?? "unknown").toLowerCase();
    const confidence = Number(field.confidence ?? 0) || 0;
    if (source !== "label" || confidence < 50 || field.value == null || field.value === "") {
      return { value: null, source: "unknown", confidence, evidence: field.evidence ?? null };
    }
    return { value: field.value, source: "label", confidence, evidence: field.evidence ?? null };
  };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(identity)) {
    if (key === "grape_varieties") {
      const list = Array.isArray(value) ? value : [];
      out[key] = list.map(clean).filter((f): f is Field => Boolean(f && f.value));
    } else {
      out[key] = clean(value);
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { imageBase64, imageUrl, mimeType, text } = await req.json();
    if (!imageBase64 && !imageUrl && !text) {
      return json({ error: "imageBase64, imageUrl or text is required" }, 400);
    }
    if (imageBase64 && String(imageBase64).length > MAX_BASE64_CHARS) {
      return json({ error: "Image is too large. Please use a smaller photo." }, 413);
    }
    const mime = ALLOWED_MIME.includes(String(mimeType ?? "").toLowerCase())
      ? String(mimeType).toLowerCase()
      : "image/jpeg";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    let userContent: unknown;
    if (imageBase64 || imageUrl) {
      const imageContent = imageBase64
        ? { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } }
        : { type: "image_url", image_url: { url: imageUrl } };
      userContent = [
        {
          type: "text",
          text: text
            ? `Transcribe this wine label, then identify it strictly from the transcription. Extra context from the user (may be wrong, do not let it override the label): ${text}`
            : "Transcribe this wine label, then identify it strictly from the transcription.",
        },
        imageContent,
      ];
    } else {
      userContent = `There is no label image. Treat the user's own words as label_text and identify the wine strictly from them; leave anything they did not state as unknown. User text: "${text}"`;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-terra",
        reasoning_effort: "none",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [wineTool],
        tool_choice: { type: "function", function: { name: "extract_wine" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error:", aiRes.status, t);
      if (aiRes.status === 429) {
        return json({ error: "Too many requests, please try again shortly." }, 429);
      }
      if (aiRes.status === 402) {
        return json({ error: "AI credits exhausted. Add credits in workspace." }, 402);
      }
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returned no tool call");
    const parsed = JSON.parse(toolCall.function.arguments);

    const wine = {
      label_text: typeof parsed.label_text === "string" ? parsed.label_text : "",
      identity: scrubIdentity(parsed.identity),
      taste: parsed.taste ?? {},
    };

    return json({ wine });
  } catch (e) {
    console.error("analyze-wine error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
