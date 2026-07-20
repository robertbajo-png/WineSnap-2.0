// Edge function: wine-suggestions
// Returns AI-generated similar wine recommendations based on a wine's profile.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const wine = await req.json();
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
    console.error("wine-suggestions error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
