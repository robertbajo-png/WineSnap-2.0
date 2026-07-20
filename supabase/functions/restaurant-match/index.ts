// Edge function: restaurant-match
// Given a list of wines from a restaurant menu (text or from a photo) and the
// user's taste profile, rank the best matches with sommelier reasoning.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
              wine_type: { type: "string", description: "red | white | rose | sparkling | dessert | fortified" },
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, image, profile, taste } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    if (!text && !image) {
      return new Response(JSON.stringify({ error: "Provide a wine list (text) or a menu photo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const favGrapes = Object.entries((taste?.favorite_grapes ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
    const favRegions = Object.entries((taste?.favorite_regions ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
    const favTypes = Object.entries((taste?.favorite_types ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", ") || "—";

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

    const userContent: any[] = [
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
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit, try again soon." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Out of credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { picks: [] };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("restaurant-match error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
