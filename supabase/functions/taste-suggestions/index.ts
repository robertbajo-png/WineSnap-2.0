// Edge function: taste-suggestions
// Generates AI wine recommendations based on a user's full taste profile + cellar.

import { z } from "npm:zod@3.25.76";
import {
  corsHeaders as getCorsHeaders,
  enforceRateLimit,
  errorResponse,
  readJson,
} from "../_shared/http.ts";

const numericPreference = z.number().min(0).max(10).nullable().optional();
const TasteRequestSchema = z
  .object({
    profile: z
      .object({
        preferred_types: z.array(z.string().max(50)).max(20).nullable().optional(),
        preferred_regions: z.array(z.string().max(100)).max(30).nullable().optional(),
        preferred_grapes: z.array(z.string().max(100)).max(30).nullable().optional(),
        body: numericPreference,
        sweetness: numericPreference,
        oak: numericPreference,
        tannin: numericPreference,
        acidity: numericPreference,
        price_min: z.number().min(0).max(1_000_000).nullable().optional(),
        price_max: z.number().min(0).max(1_000_000).nullable().optional(),
        personalized_recs: z.boolean().optional(),
        hide_disliked: z.boolean().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    taste: z
      .object({
        favorite_grapes: z.record(z.number().min(0).max(100_000)).nullable().optional(),
        favorite_regions: z.record(z.number().min(0).max(100_000)).nullable().optional(),
        favorite_types: z.record(z.number().min(0).max(100_000)).nullable().optional(),
        total_wines: z.number().int().min(0).max(100_000).nullable().optional(),
        avg_body: z.number().nullable().optional(),
        avg_tannin: z.number().nullable().optional(),
        avg_acidity: z.number().nullable().optional(),
        avg_oak: z.number().nullable().optional(),
        avg_sweetness: z.number().nullable().optional(),
        avg_fruit: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    cellar: z
      .array(
        z
          .object({
            producer: z.string().max(300).nullable().optional(),
            wine_name: z.string().max(300).nullable().optional(),
            vintage: z.number().int().nullable().optional(),
            region: z.string().max(200).nullable().optional(),
            country: z.string().max(100).nullable().optional(),
            user_rating: z.number().min(0).max(5).nullable().optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
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
            vintage: z.string().max(50).optional(),
            region: z.string().max(200),
            country: z.string().max(100),
            wine_type: z.string().max(50),
            grape_varieties: z.array(z.string().max(100)).max(20).optional(),
            price_range: z.string().max(100).optional(),
            match_score: z.number().min(0).max(100),
            reason: z.string().max(1_000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

const SYSTEM_PROMPT = `You are an expert sommelier helping someone discover new wines.
Given a user's taste preferences and the wines they've already saved/loved, suggest 8 wines they're likely to enjoy.
Mix safe picks (close to their favorites) with a couple of adventurous picks that expand their palate.
Vary regions, producers, and price points. Avoid suggesting wines they already own.
Always respond in English. ALWAYS use the suggest_wines tool.`;

const tool = {
  type: "function",
  function: {
    name: "suggest_wines",
    description: "Return 8 personalized wine recommendations",
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
              vintage: {
                type: "string",
                description: "Suggested vintage or year range, e.g. '2019' or '2018-2020'",
              },
              region: { type: "string" },
              country: { type: "string" },
              wine_type: {
                type: "string",
                description: "red | white | rose | sparkling | dessert | fortified",
              },
              grape_varieties: { type: "array", items: { type: "string" } },
              price_range: { type: "string", description: "e.g. '$25-40'" },
              match_score: { type: "number", description: "0-100 similarity score" },
              reason: { type: "string", description: "1-2 sentences why this matches their taste" },
            },
            required: [
              "producer",
              "wine_name",
              "region",
              "country",
              "wine_type",
              "match_score",
              "reason",
            ],
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
    await enforceRateLimit(req, "taste-suggestions");
    const { profile, taste, cellar } = TasteRequestSchema.parse(await readJson(req, 200_000));
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const personalized = profile?.personalized_recs !== false;
    const favGrapes =
      Object.entries(taste?.favorite_grapes ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—";
    const favRegions =
      Object.entries(taste?.favorite_regions ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—";
    const favTypes =
      Object.entries(taste?.favorite_types ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—";

    const cellarList =
      (cellar ?? [])
        .slice(0, 20)
        .map(
          (w) =>
            `- ${w.producer ?? "?"} ${w.wine_name ?? ""} ${w.vintage ?? ""} (${w.region ?? "?"}, ${w.country ?? "?"})${w.user_rating ? ` ★${w.user_rating}` : ""}`,
        )
        .join("\n") || "(empty cellar)";
    const disliked = profile?.hide_disliked
      ? (cellar ?? [])
          .filter((wine) => wine.user_rating != null && wine.user_rating <= 2)
          .map((wine) => `${wine.producer ?? ""} ${wine.wine_name ?? ""}`.trim())
          .filter(Boolean)
          .join(", ")
      : "";

    const preferenceBlock = personalized
      ? `User's stated preferences:
- Preferred wine types: ${(profile?.preferred_types ?? []).join(", ") || "—"}
- Preferred regions: ${(profile?.preferred_regions ?? []).join(", ") || "—"}
- Preferred grapes: ${(profile?.preferred_grapes ?? []).join(", ") || "—"}
- Body: ${profile?.body ?? "?"}/10, Sweetness: ${profile?.sweetness ?? "?"}/10, Oak: ${profile?.oak ?? "?"}/10, Tannin: ${profile?.tannin ?? "?"}/10, Acidity: ${profile?.acidity ?? "?"}/10
- Price range: ${profile?.price_min ?? "?"}-${profile?.price_max ?? "?"}

Computed taste from ${taste?.total_wines ?? 0} cellar wines:
- Favorite grapes (count): ${favGrapes}
- Favorite regions (count): ${favRegions}
- Favorite types (count): ${favTypes}
- Avg body ${taste?.avg_body ?? "?"}, tannin ${taste?.avg_tannin ?? "?"}, acidity ${taste?.avg_acidity ?? "?"}, oak ${taste?.avg_oak ?? "?"}, sweetness ${taste?.avg_sweetness ?? "?"}, fruit ${taste?.avg_fruit ?? "?"}`
      : "Personalization is disabled. Suggest a varied, balanced selection without using taste-profile attributes.";

    const userPrompt = `${preferenceBlock}

Wines already in cellar (do not re-suggest):
${cellarList}
${disliked ? `\nExplicitly avoid wines similar to these low-rated wines: ${disliked}` : ""}

Suggest 8 new wines they'd enjoy.`;

    const resp = await fetchLovable({
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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

    const parsed = await parseAiTool(resp, "suggest_wines", SuggestionResultSchema);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(req, e);
  }
});
import { fetchLovable, parseAiTool } from "../_shared/ai.ts";
