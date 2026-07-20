import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/hooks/match-systembolaget
 * Body: { producer?, wine_name, vintage?, region?, country?, wine_type? }
 *
 * Searches the Systembolaget catalog (via the community bolaget.io mirror) for
 * candidate products and asks Lovable AI to pick the best match — or return
 * null if none of the candidates are clearly the same wine.
 *
 * Response: { match: { systembolaget_id, url, price, name, producer, vintage } | null,
 *             confidence: number, reason: string }
 */
export const Route = createFileRoute("/api/public/hooks/match-systembolaget")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) {
          return Response.json({ error: "LOVABLE_API_KEY missing" }, { status: 500 });
        }

        let body: MatchInput;
        try {
          body = (await request.json()) as MatchInput;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const wine_name = (body.wine_name ?? "").trim();
        if (!wine_name) {
          return Response.json({ error: "wine_name is required" }, { status: 400 });
        }

        try {
          const candidates = await searchCandidates(body);
          if (!candidates.length) {
            return Response.json({ match: null, confidence: 0, reason: "No candidates found in Systembolaget catalog." });
          }

          const pick = await pickBestMatch(LOVABLE_API_KEY, body, candidates);

          if (!pick || pick.index == null || pick.index < 0 || pick.index >= candidates.length) {
            return Response.json({ match: null, confidence: pick?.confidence ?? 0, reason: pick?.reason ?? "No confident match." });
          }

          const chosen = candidates[pick.index];
          return Response.json({
            match: {
              systembolaget_id: chosen.productNumber,
              url: chosen.url,
              price: chosen.price,
              name: chosen.name,
              producer: chosen.producer,
              vintage: chosen.vintage,
            },
            confidence: pick.confidence,
            reason: pick.reason,
          });
        } catch (e) {
          console.error("[match-systembolaget]", e);
          return Response.json(
            { error: e instanceof Error ? e.message : "Unknown error" },
            { status: 500 },
          );
        }
      },
    },
  },
});

type MatchInput = {
  producer?: string | null;
  wine_name?: string | null;
  vintage?: number | string | null;
  region?: string | null;
  country?: string | null;
  wine_type?: string | null;
};

type Candidate = {
  productNumber: string;
  name: string;
  producer: string | null;
  vintage: string | null;
  price: number;
  country: string | null;
  category: string | null;
  volume: string | null;
  url: string;
};

async function searchCandidates(input: MatchInput): Promise<Candidate[]> {
  const base = "https://api.bolaget.io/v1";
  const queries: string[] = [];

  const producer = (input.producer ?? "").trim();
  const name = (input.wine_name ?? "").trim();
  const vintage = input.vintage != null ? String(input.vintage).trim() : "";

  if (producer && name) queries.push(`${producer} ${name}`);
  if (producer && name && vintage) queries.push(`${producer} ${name} ${vintage}`);
  if (name) queries.push(name);
  if (producer) queries.push(producer);

  const seen = new Map<string, Candidate>();

  for (const q of queries) {
    if (seen.size >= 20) break;
    try {
      const url = `${base}/products?query=${encodeURIComponent(q)}&limit=8`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      const list = Array.isArray(json) ? json : [];
      for (const raw of list) {
        const c = toCandidate(raw as Record<string, unknown>);
        if (!c) continue;
        if (!seen.has(c.productNumber)) seen.set(c.productNumber, c);
      }
    } catch (e) {
      console.error("[match-systembolaget] search failed", q, e);
    }
  }

  return Array.from(seen.values()).slice(0, 15);
}

function toCandidate(p: Record<string, unknown>): Candidate | null {
  const productNumber =
    (p.productNumber as string | undefined) ??
    (p.productId as string | undefined) ??
    (p.nr as string | undefined);
  if (!productNumber) return null;

  const price = Number(
    (p.price as number | undefined) ??
      (p.priceInclVat as number | undefined) ??
      (p.salesPrice as number | undefined),
  );
  if (!Number.isFinite(price) || price <= 0) return null;

  const name = String(
    (p.productNameBold as string | undefined) ??
      (p.productNameThin as string | undefined) ??
      (p.name as string | undefined) ??
      "",
  ).trim();
  const producer = ((p.producerName as string | undefined) ?? null) || null;
  const vintage = ((p.vintage as string | number | undefined) ?? null)?.toString() ?? null;
  const country = ((p.country as string | undefined) ?? null) || null;
  const category = ((p.categoryLevel2 as string | undefined) ?? (p.categoryLevel1 as string | undefined) ?? null) || null;
  const volume = ((p.volumeText as string | undefined) ?? null) || null;

  return {
    productNumber,
    name,
    producer,
    vintage,
    price,
    country,
    category,
    volume,
    url: `https://www.systembolaget.se/produkt/vin/${productNumber}`,
  };
}

async function pickBestMatch(
  apiKey: string,
  input: MatchInput,
  candidates: Candidate[],
): Promise<{ index: number | null; confidence: number; reason: string } | null> {
  const listText = candidates
    .map(
      (c, i) =>
        `${i}. producer="${c.producer ?? ""}" name="${c.name}" vintage="${c.vintage ?? ""}" country="${c.country ?? ""}" category="${c.category ?? ""}" volume="${c.volume ?? ""}" price=${c.price} SEK`,
    )
    .join("\n");

  const userPrompt = `Target wine:
producer: ${input.producer ?? ""}
name: ${input.wine_name ?? ""}
vintage: ${input.vintage ?? ""}
region: ${input.region ?? ""}
country: ${input.country ?? ""}
type: ${input.wine_type ?? ""}

Candidates from Systembolaget:
${listText}

Pick the index of the candidate that is unambiguously the same wine (producer + cuvée match; vintage should match if the target specifies one, but a nearby vintage is acceptable). If no candidate is clearly the same wine, return index=null with a short reason.`;

  const tool = {
    type: "function",
    function: {
      name: "select_match",
      description: "Select the best matching Systembolaget candidate or null if none match confidently.",
      parameters: {
        type: "object",
        properties: {
          index: { type: ["integer", "null"], description: "0-based candidate index, or null if no confident match" },
          confidence: { type: "number", description: "0-100 confidence in the selection" },
          reason: { type: "string", description: "Short justification" },
        },
        required: ["index", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You match wines to Systembolaget catalog entries. Be strict: only pick a candidate you're confident is the same wine (same producer and same cuvée). Prefer null over a wrong pick.",
        },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "select_match" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("[match-systembolaget] AI error", resp.status, t);
    return null;
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;

  try {
    const parsed = JSON.parse(args) as { index: number | null; confidence: number; reason: string };
    const idx = parsed.index == null ? null : Number(parsed.index);
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
    // Require reasonable confidence to accept a match
    if (idx == null || !Number.isFinite(idx) || confidence < 55) {
      return { index: null, confidence, reason: parsed.reason || "Low confidence." };
    }
    return { index: idx, confidence, reason: parsed.reason || "" };
  } catch {
    return null;
  }
}
