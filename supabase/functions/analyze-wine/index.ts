// Edge function: analyze-wine
// Receives { imageBase64, mimeType } or { imageUrl } and returns structured wine data via Lovable AI vision.

import { z } from "npm:zod@3.25.76";
import {
  corsHeaders as getCorsHeaders,
  enforceRateLimit,
  errorResponse,
  readJson,
} from "../_shared/http.ts";

const AnalyzeRequestSchema = z
  .object({
    imageBase64: z.string().max(14_000_000).optional(),
    imageUrl: z
      .string()
      .url()
      .max(2_048)
      .refine((url) => url.startsWith("https://"), "imageUrl must use HTTPS")
      .optional(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    text: z.string().trim().min(3).max(2_000).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.imageBase64 || value.imageUrl || value.text),
    "An image or text is required",
  );

const boundedText = z.string().max(2_000);
const WineResultSchema = z
  .object({
    producer: boundedText,
    wine_name: boundedText,
    vintage: z
      .number()
      .int()
      .min(1700)
      .max(new Date().getUTCFullYear() + 1)
      .nullable()
      .optional(),
    grape_varieties: z.array(z.string().max(100)).max(20),
    region: boundedText,
    country: boundedText,
    wine_type: z.enum([
      "red",
      "white",
      "rose",
      "sparkling",
      "dessert",
      "fortified",
      "orange",
      "unknown",
    ]),
    description: boundedText,
    fruit: z.number().min(0).max(10),
    tannin: z.number().min(0).max(10),
    acidity: z.number().min(0).max(10),
    oak: z.number().min(0).max(10),
    sweetness: z.number().min(0).max(10),
    body: z.number().min(0).max(10),
    primary_notes: z.array(z.string().max(100)).max(20),
    secondary_notes: z.array(z.string().max(100)).max(20),
    tertiary_notes: z.array(z.string().max(100)).max(20),
    food_pairings: z
      .array(z.object({ dish: z.string().max(200), reason: z.string().max(500) }).strict())
      .max(8),
    serving_temp: z.string().max(100),
    glass_type: z.string().max(100),
    decant: z.boolean(),
    confidence: z.enum(["high", "medium", "low"]),
    identification_basis: z.enum(["label", "description", "inference"]),
    inferred_fields: z.array(z.string().max(100)).max(30),
  })
  .strict();

const SYSTEM_PROMPT = `You are an experienced sommelier. When given a wine label image, identify the wine and return structured data.
Never present an inferred value as if it was read from the label. If you cannot identify a specific wine, make a cautious inference, set confidence to low, and list every inferred field.
ALWAYS respond in English. ALWAYS use the extract_wine tool to respond.`;

const wineTool = {
  type: "function",
  function: {
    name: "extract_wine",
    description: "Return structured wine data based on the label",
    parameters: {
      type: "object",
      properties: {
        producer: { type: "string", description: "Producer / winery" },
        wine_name: { type: "string", description: "Wine name (cuvée)" },
        vintage: { type: ["integer", "null"], description: "Vintage year or null" },
        grape_varieties: {
          type: "array",
          items: { type: "string" },
          description: "Grape varieties",
        },
        region: { type: "string", description: "Region (e.g. Rioja, Burgundy)" },
        country: { type: "string", description: "Country" },
        wine_type: {
          type: "string",
          enum: ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange", "unknown"],
        },
        description: {
          type: "string",
          description: "Sommelier-style description, 2-3 sentences in English",
        },
        fruit: { type: "number", description: "Fruit 0-10" },
        tannin: { type: "number", description: "Tannin 0-10 (0 for white/sparkling)" },
        acidity: { type: "number", description: "Acidity 0-10" },
        oak: { type: "number", description: "Oak 0-10" },
        sweetness: { type: "number", description: "Sweetness 0-10" },
        body: { type: "number", description: "Body 0-10" },
        primary_notes: {
          type: "array",
          items: { type: "string" },
          description: "Primary aroma notes (fruit, flowers)",
        },
        secondary_notes: {
          type: "array",
          items: { type: "string" },
          description: "Secondary notes (yeast, malolactic)",
        },
        tertiary_notes: {
          type: "array",
          items: { type: "string" },
          description: "Tertiary notes (aging, oak, leather)",
        },
        food_pairings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string", description: "Dish in English" },
              reason: { type: "string", description: "Short rationale in English" },
            },
            required: ["dish", "reason"],
            additionalProperties: false,
          },
          description: "3-5 food pairings",
        },
        serving_temp: { type: "string", description: "Serving temperature, e.g. '16-18°C'" },
        glass_type: { type: "string", description: "Glass type, e.g. 'Bordeaux glass'" },
        decant: { type: "boolean", description: "Should it be decanted?" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        identification_basis: { type: "string", enum: ["label", "description", "inference"] },
        inferred_fields: {
          type: "array",
          items: { type: "string" },
          description: "Fields that were inferred rather than read directly",
        },
      },
      required: [
        "producer",
        "wine_name",
        "grape_varieties",
        "region",
        "country",
        "wine_type",
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
        "confidence",
        "identification_basis",
        "inferred_fields",
      ],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await enforceRateLimit(req, "analyze-wine");
    const { imageBase64, imageUrl, mimeType, text } = AnalyzeRequestSchema.parse(
      await readJson(req, 14_500_000),
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    let userContent: unknown;
    if (imageBase64 || imageUrl) {
      const imageContent = imageBase64
        ? {
            type: "image_url",
            image_url: { url: `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}` },
          }
        : { type: "image_url", image_url: { url: imageUrl } };
      userContent = [
        {
          type: "text",
          text: text
            ? `Identify this wine from the label and return structured data. Additional context from the user: ${text}`
            : "Identify this wine from the label and return structured data.",
        },
        imageContent,
      ];
    } else {
      userContent = `Identify the following wine based on the user's description and return structured data. If details are missing, infer plausible values from the description. User description: "${text}"`;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-terra",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [wineTool],
        tool_choice: { type: "function", function: { name: "extract_wine" } },
      }),
    });

    if (!aiRes.ok) {
      console.error("AI gateway error", aiRes.status);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many requests, please try again shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in workspace." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returned no tool call");
    const wine = WineResultSchema.parse(JSON.parse(toolCall.function.arguments));

    return new Response(JSON.stringify({ wine }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(req, e);
  }
});
