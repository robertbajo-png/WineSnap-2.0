// Edge function: analyze-wine
// Tar emot { imageBase64 } eller { imageUrl } och returnerar strukturerad vindata via Lovable AI vision.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du är en erfaren sommelier. När du får en bild av en vinetikett, identifiera vinet och returnera strukturerad data.
Om du inte kan identifiera ett specifikt vin, gör din BÄSTA bedömning utifrån synliga ledtrådar (region, druva, producent, årgång) och fyll på med rimlig info.
ALLT SVAR PÅ SVENSKA. Använd alltid verktyget extract_wine för att svara.`;

const wineTool = {
  type: "function",
  function: {
    name: "extract_wine",
    description: "Returnera strukturerad vindata baserat på etiketten",
    parameters: {
      type: "object",
      properties: {
        producer: { type: "string", description: "Producent / vingård" },
        wine_name: { type: "string", description: "Namn på vinet" },
        vintage: { type: ["integer", "null"], description: "Årgång (årtal) eller null" },
        grape_varieties: { type: "array", items: { type: "string" }, description: "Druvor" },
        region: { type: "string", description: "Region (t.ex. Rioja, Bourgogne)" },
        country: { type: "string", description: "Land" },
        wine_type: {
          type: "string",
          enum: ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange", "unknown"],
        },
        description: { type: "string", description: "Sommelierstil-beskrivning, 2-3 meningar på svenska" },
        fruit: { type: "number", description: "Frukt 0-10" },
        tannin: { type: "number", description: "Tannin 0-10 (0 för vitt/mousserande)" },
        acidity: { type: "number", description: "Syra 0-10" },
        oak: { type: "number", description: "Ek 0-10" },
        sweetness: { type: "number", description: "Sötma 0-10" },
        body: { type: "number", description: "Fyllighet 0-10" },
        primary_notes: { type: "array", items: { type: "string" }, description: "Primära aromnoter (frukt, blommor)" },
        secondary_notes: { type: "array", items: { type: "string" }, description: "Sekundära (jäst, mjölksyra)" },
        tertiary_notes: { type: "array", items: { type: "string" }, description: "Tertiära (lagring, ek, läder)" },
        food_pairings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string", description: "Maträtt på svenska" },
              reason: { type: "string", description: "Kort motivering på svenska" },
            },
            required: ["dish", "reason"],
            additionalProperties: false,
          },
          description: "3-5 matparningar",
        },
        serving_temp: { type: "string", description: "Serveringstemperatur, t.ex. '16-18°C'" },
        glass_type: { type: "string", description: "Glastyp, t.ex. 'Bordeauxglas'" },
        decant: { type: "boolean", description: "Bör dekanteras?" },
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
      return new Response(JSON.stringify({ error: "imageBase64 eller imageUrl krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY saknas");

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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Identifiera detta vin från etiketten och returnera strukturerad data." },
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
        return new Response(JSON.stringify({ error: "För många förfrågningar, försök igen om en stund." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut. Lägg till krediter i workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway: ${aiRes.status}`);
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returnerade inget tool call");
    const wine = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ wine }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-wine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Okänt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
