// Edge function: restaurant-match
// Given a list of wines from a restaurant menu (text or from a photo) and the
// user's taste profile, rank the best matches with sommelier reasoning.

import { z } from "npm:zod@3.25.76";
import {
  corsHeaders as getCorsHeaders,
  enforceRateLimit,
  errorResponse,
  readJson,
} from "../_shared/http.ts";

const score = z.number().min(0).max(10).nullable().optional();
const ProfileSchema = z
  .object({
    preferred_types: z.array(z.string().max(50)).max(20).nullable().optional(),
    preferred_regions: z.array(z.string().max(100)).max(30).nullable().optional(),
    preferred_grapes: z.array(z.string().max(100)).max(30).nullable().optional(),
    body: score,
    sweetness: score,
    oak: score,
    tannin: score,
    acidity: score,
    price_min: z.number().min(0).max(1_000_000).nullable().optional(),
    price_max: z.number().min(0).max(1_000_000).nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();
const countMap = z.record(z.string().max(100), z.number().min(0).max(100_000));
const TasteSchema = z
  .object({
    favorite_grapes: countMap.nullable().optional(),
    favorite_regions: countMap.nullable().optional(),
    favorite_types: countMap.nullable().optional(),
    total_wines: z.number().int().min(0).max(100_000).nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional();
const RestaurantRequestSchema = z
  .object({
    text: z.string().trim().max(30_000).optional(),
    image: z
      .string()
      .max(14_000_000)
      .refine(
        (value) => /^data:image\/(?:jpeg|png|webp);base64,/i.test(value),
        "Unsupported image data",
      )
      .optional(),
    profile: ProfileSchema,
    taste: TasteSchema,
  })
  .strict()
  .refine((value) => Boolean(value.text || value.image), "A menu image or text is required");
const RestaurantResultSchema = z
  .object({
    picks: z
      .array(
        z
          .object({
            producer: z.string().max(300).optional(),
            wine_name: z.string().max(300),
            vintage: z.string().max(40).optional(),
            region: z.string().max(200).optional(),
            country: z.string().max(100).optional(),
            wine_type: z.string().max(50).optional(),
            grape_varieties: z.array(z.string().max(100)).max(20).optional(),
            price: z.string().max(100).optional(),
            match_score: z.number().min(0).max(100),
            reason: z.string().max(1_000),
            confidence: z.enum(["safe", "balanced", "stretch"]).optional(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

const SYSTEM_PROMPT = `You are a personal sommelier at the table.
The user is at a restaurant and wants help picking a wine from the menu.
You will receive a list of wines (extracted from a menu or typed by the user) and the user's taste profile.
Your job:
1. If the input includes an image, first extract every wine you can read from the menu (producer, wine name, vintage, region, price if visible).
2. Rank the top matches for the user's palate — mix confident matches with 1-2 interesting stretches.
3. For each pick, explain in 1-2 sentences WHY it fits their profile (grape/region/body/tannin/etc.).
Return 5-8 picks, best first. Always respond in English. Always use the rank_wines tool.`;

const tool = {
  type: "function",
  function: {
    name: "rank_wines",
    description: "Return ranked wine picks from the menu.",
    parameters: {
      type: "object",
      properties: {
        picks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              producer: { type: "string" },
              wine_name: { type: "string" },
              vintage: { type: "string" },
              region: { type: "string" },
              country: { type: "string" },
              wine_type: {
                type: "string",
                description: "red | white | rose | sparkling | dessert | fortified",
              },
              grape_varieties: { type: "array", items: { type: "string" } },
              price: { type: "string", description: "Price as shown on menu, if visible" },
              match_score: { type: "number", description: "0-100 how well it fits the palate" },
              reason: { type: "string", description: "1-2 sentence sommelier rationale" },
              confidence: { type: "string", description: "safe | balanced | stretch" },
            },
            required: ["wine_name", "match_score", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["picks"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await enforceRateLimit(req, "restaurant-match");
    const { text, image, profile, taste } = RestaurantRequestSchema.parse(
      await readJson(req, 14_500_000),
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const favGrapes =
      Object.entries((taste?.favorite_grapes ?? {}) as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—";
    const favRegions =
      Object.entries((taste?.favorite_regions ?? {}) as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—";
    const favTypes =
      Object.entries((taste?.favorite_types ?? {}) as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—";

    const profileBlock = `User's taste profile:
- Preferred wine types: ${(profile?.preferred_types ?? []).join(", ") || "—"}
- Preferred regions: ${(profile?.preferred_regions ?? []).join(", ") || "—"}
- Preferred grapes: ${(profile?.preferred_grapes ?? []).join(", ") || "—"}
- Body ${profile?.body ?? "?"}/10, Sweetness ${profile?.sweetness ?? "?"}/10, Oak ${profile?.oak ?? "?"}/10, Tannin ${profile?.tannin ?? "?"}/10, Acidity ${profile?.acidity ?? "?"}/10
- Price range: ${profile?.price_min ?? "?"}-${profile?.price_max ?? "?"}

Computed from ${taste?.total_wines ?? 0} cellar wines:
- Favorite grapes: ${favGrapes}
- Favorite regions: ${favRegions}
- Favorite types: ${favTypes}`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: `${profileBlock}\n\nRestaurant wine list:\n${text || "(see image)"}` },
    ];
    if (image) {
      userContent.push({ type: "image_url", image_url: { url: image } });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "rank_wines" } },
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
        return new Response(JSON.stringify({ error: "Out of credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = RestaurantResultSchema.parse(args ? JSON.parse(args) : { picks: [] });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return errorResponse(req, e);
  }
});
