// Edge function: wine-suggestions
// Returns AI-generated similar wine recommendations based on a wine's profile.

import { z } from "npm:zod@3.25.76";
import {
  corsHeaders as getCorsHeaders,
  enforceRateLimit,
  errorResponse,
  readJson,
} from "../_shared/http.ts";

const profileValue = z.number().min(0).max(10).nullable().optional();
const WineRequestSchema = z
  .object({
    producer: z.string().max(300).nullable().optional(),
    wine_name: z.string().max(300).nullable().optional(),
    vintage: z.number().int().nullable().optional(),
    region: z.string().max(200).nullable().optional(),
    country: z.string().max(100).nullable().optional(),
    wine_type: z.string().max(50).nullable().optional(),
    grape_varieties: z.array(z.string().max(100)).max(20).nullable().optional(),
    body: profileValue,
    tannin: profileValue,
    acidity: profileValue,
    oak: profileValue,
    sweetness: profileValue,
    fruit: profileValue,
    primary_notes: z.array(z.string().max(100)).max(20).nullable().optional(),
    secondary_notes: z.array(z.string().max(100)).max(20).nullable().optional(),
    tertiary_notes: z.array(z.string().max(100)).max(20).nullable().optional(),
  })
  .strict();
const SuggestionResultSchema = z
  .object({
    suggestions: z
      .array(
        z
          .object({
            producer: z.string().max(300),
            wine_name: z.string().max(300),
            region: z.string().max(200),
            country: z.string().max(100),
            grape_varieties: z.array(z.string().max(100)).max(20).optional(),
            price_range: z.string().max(100).optional(),
            match_score: z.number().min(0).max(100),
            reason: z.string().max(1_000),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

const SYSTEM_PROMPT = `You are an expert sommelier. Given a wine's profile, suggest 5 similar wines a drinker would likely enjoy.
Mix well-known and lesser-known picks across regions. Always respond in English. ALWAYS use the suggest_wines tool.`;

const tool = {
  type: "function",
  function: {
    name: "suggest_wines",
    description: "Return 5 similar wine recommendations",
    parameters: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              producer: { type: "string" },
              wine_name: { type: "string" },
              region: { type: "string" },
              country: { type: "string" },
              grape_varieties: { type: "array", items: { type: "string" } },
              price_range: { type: "string", description: "e.g. '$25-40'" },
              match_score: { type: "number", description: "0-100 similarity score" },
              reason: { type: "string", description: "1-2 sentences why it matches" },
            },
            required: ["producer", "wine_name", "region", "country", "match_score", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await enforceRateLimit(req, "wine-suggestions");
    const wine = WineRequestSchema.parse(await readJson(req, 50_000));
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const userPrompt = `Suggest 5 wines similar to:
Producer: ${wine.producer ?? "—"}
Wine: ${wine.wine_name ?? "—"} ${wine.vintage ?? ""}
Region: ${wine.region ?? "—"}, ${wine.country ?? "—"}
Type: ${wine.wine_type ?? "—"}
Grapes: ${(wine.grape_varieties ?? []).join(", ") || "—"}
Profile — body:${wine.body ?? "?"}/10, tannin:${wine.tannin ?? "?"}/10, acidity:${wine.acidity ?? "?"}/10, oak:${wine.oak ?? "?"}/10, sweetness:${wine.sweetness ?? "?"}/10, fruit:${wine.fruit ?? "?"}/10
Notes: ${[...(wine.primary_notes ?? []), ...(wine.secondary_notes ?? []), ...(wine.tertiary_notes ?? [])].join(", ") || "—"}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "suggest_wines" } },
      }),
    });

    if (!resp.ok) {
      console.error("AI gateway error", resp.status);
      if (resp.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit, try again soon." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (resp.status === 402)
        return new Response(
          JSON.stringify({ error: "Out of credits. Add funds in Workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = SuggestionResultSchema.parse(args ? JSON.parse(args) : { suggestions: [] });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(req, e);
  }
});
