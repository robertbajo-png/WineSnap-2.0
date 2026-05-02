// Edge function: analyze-wine
// Receives { imageBase64, mimeType } or { imageUrl } and returns structured wine data via Lovable AI vision (GPT-5).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an experienced sommelier. When given a wine label image, identify the wine and return structured data.
If you cannot identify a specific wine, make your BEST inference from visible clues (region, grape, producer, vintage) and fill in plausible details.
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
        grape_varieties: { type: "array", items: { type: "string" }, description: "Grape varieties" },
        region: { type: "string", description: "Region (e.g. Rioja, Burgundy)" },
        country: { type: "string", description: "Country" },
        wine_type: {
          type: "string",
          enum: ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange", "unknown"],
        },
        description: { type: "string", description: "Sommelier-style description, 2-3 sentences in English" },
        fruit: { type: "number", description: "Fruit 0-10" },
        tannin: { type: "number", description: "Tannin 0-10 (0 for white/sparkling)" },
        acidity: { type: "number", description: "Acidity 0-10" },
        oak: { type: "number", description: "Oak 0-10" },
        sweetness: { type: "number", description: "Sweetness 0-10" },
        body: { type: "number", description: "Body 0-10" },
        primary_notes: { type: "array", items: { type: "string" }, description: "Primary aroma notes (fruit, flowers)" },
        secondary_notes: { type: "array", items: { type: "string" }, description: "Secondary notes (yeast, malolactic)" },
        tertiary_notes: { type: "array", items: { type: "string" }, description: "Tertiary notes (aging, oak, leather)" },
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
      ],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, imageUrl, mimeType } = await req.json();
    if (!imageBase64 && !imageUrl) {
      return new Response(JSON.stringify({ error: "imageBase64 or imageUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const imageContent = imageBase64
      ? { type: "image_url", image_url: { url: `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}` } }
      : { type: "image_url", image_url: { url: imageUrl } };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this wine from the label and return structured data." },
              imageContent,
            ],
          },
        ],
        tools: [wineTool],
        tool_choice: { type: "function", function: { name: "extract_wine" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error:", aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returned no tool call");
    const wine = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ wine }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-wine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
