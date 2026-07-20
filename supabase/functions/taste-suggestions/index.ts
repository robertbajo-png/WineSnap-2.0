// Edge function: taste-suggestions
// Generates AI wine recommendations based on a user's full taste profile + cellar.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
              vintage: { type: "string", description: "Suggested vintage or year range, e.g. '2019' or '2018-2020'" },
              region: { type: "string" },
              country: { type: "string" },
              wine_type: { type: "string", description: "red | white | rose | sparkling | dessert | fortified" },
              grape_varieties: { type: "array", items: { type: "string" } },
              price_range: { type: "string", description: "e.g. '$25-40'" },
              match_score: { type: "number", description: "0-100 similarity score" },
              reason: { type: "string", description: "1-2 sentences why this matches their taste" },
            },
            required: ["producer", "wine_name", "region", "country", "wine_type", "match_score", "reason"],
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { profile, taste, cellar } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const favGrapes = Object.entries((taste?.favorite_grapes ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
    const favRegions = Object.entries((taste?.favorite_regions ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join(", ") || "—";
    const favTypes = Object.entries((taste?.favorite_types ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", ") || "—";

    const cellarList = (cellar ?? []).slice(0, 20).map((w: any) =>
      `- ${w.producer ?? "?"} ${w.wine_name ?? ""} ${w.vintage ?? ""} (${w.region ?? "?"}, ${w.country ?? "?"})${w.user_rating ? ` ★${w.user_rating}` : ""}`
    ).join("\n") || "(empty cellar)";

    const userPrompt = `User's stated preferences:
- Preferred wine types: ${(profile?.preferred_types ?? []).join(", ") || "—"}
- Preferred regions: ${(profile?.preferred_regions ?? []).join(", ") || "—"}
- Preferred grapes: ${(profile?.preferred_grapes ?? []).join(", ") || "—"}
- Body: ${profile?.body ?? "?"}/10, Sweetness: ${profile?.sweetness ?? "?"}/10, Oak: ${profile?.oak ?? "?"}/10, Tannin: ${profile?.tannin ?? "?"}/10, Acidity: ${profile?.acidity ?? "?"}/10
- Price range: ${profile?.price_min ?? "?"}-${profile?.price_max ?? "?"}

Computed taste from ${taste?.total_wines ?? 0} cellar wines:
- Favorite grapes (count): ${favGrapes}
- Favorite regions (count): ${favRegions}
- Favorite types (count): ${favTypes}
- Avg body ${taste?.avg_body ?? "?"}, tannin ${taste?.avg_tannin ?? "?"}, acidity ${taste?.avg_acidity ?? "?"}, oak ${taste?.avg_oak ?? "?"}, sweetness ${taste?.avg_sweetness ?? "?"}, fruit ${taste?.avg_fruit ?? "?"}

Wines already in cellar (do not re-suggest):
${cellarList}

Suggest 8 new wines they'd enjoy.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "suggest_wines" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit, try again soon." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Out of credits. Add funds in Workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { suggestions: [] };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("taste-suggestions error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
