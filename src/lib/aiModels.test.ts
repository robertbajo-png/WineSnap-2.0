import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AI_MODELS } from "../../supabase/functions/_shared/aiModels";
import * as labelValidation from "../../supabase/functions/analyze-wine/labelValidation";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
type Handler = (req: Request) => Promise<Response>;

const labelField = (value: string) => ({ value, source: "label", confidence: 95, evidence: value });
const reading = {
  label_text: "ZEHN MORGEN\n2023\nCHARDONNAY & WEISSER BURGUNDER\nNAHE",
  identity: {
    producer: labelField("Zehn Morgen"),
    vintage: labelField("2023"),
    region: labelField("Nahe"),
    grape_varieties: [labelField("Chardonnay"), labelField("Weisser Burgunder")],
  },
  taste: { description: "Estimated fresh white wine style." },
};

function toolResponse(payload: unknown = reading) {
  return Response.json({
    choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify(payload) } }] } }],
  });
}

function loadLabelReader(gatewayResponse = toolResponse(), denied?: Response) {
  let handler: Handler | undefined;
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => gatewayResponse);
  const requireAiAccess = vi.fn(async () => denied ?? { userId: "synthetic-test-user" });
  const imports: Record<string, unknown> = {
    "../_shared/aiModels.ts": { AI_MODELS },
    "../_shared/aiSecurity.ts": { requireAiAccess },
    "./labelValidation.ts": labelValidation,
  };
  const source = read("supabase/functions/analyze-wine/index.ts");

  // Execute the actual Deno handler in isolation; only auth and HTTP are mocked.
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports: {},
    require: (path: string) => {
      if (!(path in imports)) throw new Error(`Unexpected Edge import: ${path}`);
      return imports[path];
    },
    Deno: {
      env: { get: () => "synthetic-test-key" },
      serve: (callback: Handler) => (handler = callback),
    },
    Request,
    Response,
    fetch,
    console: { error: vi.fn() },
  });
  if (!handler) throw new Error("Label reader did not register a handler");

  return {
    fetch,
    requireAiAccess,
    call: (body: Record<string, unknown>) =>
      handler!(
        new Request("https://example.test/analyze-wine", {
          method: "POST",
          headers: {
            Authorization: "Bearer synthetic-test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
  };
}

describe("Gateway workload routing", () => {
  it.each([
    "supabase/functions/extract-preference-signals/index.ts",
    "supabase/functions/wine-suggestions/index.ts",
    "supabase/functions/taste-suggestions/index.ts",
    "supabase/functions/restaurant-match/index.ts",
    "src/routes/api/public/hooks/match-systembolaget.ts",
  ])("uses the shared Flash default in %s", (path) => {
    const source = read(path);
    expect(source).toContain("model: AI_MODELS.fast");
    expect(source).toContain("/v1/chat/completions");
    expect(source).toContain("tool_choice:");
    expect(source).not.toMatch(/model:\s*["'](?:google|openai)\//);
  });

  it("stores the same model ID that Ask actually requests", () => {
    const source = read("supabase/functions/ask-winesnap/index.ts");
    expect(source).toContain("const MODEL = AI_MODELS.fast;");
    expect(source).toContain("model: MODEL,");
    expect(source).toContain("_model: MODEL,");
  });
});

describe("GPT-6 label reader compatibility", () => {
  it("sends images with non-reasoning Chat Completions and the existing forced schema", async () => {
    const reader = loadLabelReader();
    const response = await reader.call({ imageBase64: "synthetic-image", mimeType: "image/webp" });
    expect(response.status).toBe(200);
    const [url, init] = reader.fetch.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(body.model).toBe("openai/gpt-6-sol");
    expect(body.reasoning_effort).toBe("none");
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "extract_wine" } });
    expect(body.tools[0].function.parameters.required).toEqual(["label_text", "identity", "taste"]);
    expect(body.tools[0].function.parameters.additionalProperties).toBe(false);
    expect(body.messages[1].content[1].image_url.url).toBe(
      "data:image/webp;base64,synthetic-image",
    );
    expect((await response.json()).wine.identity.producer.value).toBe("Zehn Morgen");
    expect(reader.requireAiAccess).toHaveBeenCalled();
  });

  it("removes unsupported identities even when the new model returns a confident value", async () => {
    const reader = loadLabelReader(
      toolResponse({
        ...reading,
        identity: {
          ...reading.identity,
          producer: { ...labelField("Chateau Margaux"), evidence: "ZEHN MORGEN" },
        },
      }),
    );
    const response = await reader.call({ imageUrl: "https://example.test/label.webp" });
    const { wine } = await response.json();
    expect(wine.identity.producer).toMatchObject({ value: null, source: "unknown" });
    expect(wine.identity.vintage.value).toBe("2023");
  });

  it("keeps user text authoritative instead of trusting a fabricated transcription", async () => {
    const reader = loadLabelReader(toolResponse({ ...reading, label_text: "invented label 1998" }));
    const response = await reader.call({ text: "Zehn Morgen 2023" });
    const { wine } = await response.json();
    expect(wine.label_text).toBe("Zehn Morgen 2023");
    expect(wine.identity.producer.value).toBe("Zehn Morgen");
    expect(wine.identity.region).toMatchObject({ value: null, source: "unknown" });
    expect(wine.identity.grape_varieties).toEqual([]);
  });

  it.each([402, 429])("preserves gateway error status %s", async (status) => {
    const reader = loadLabelReader(new Response("gateway unavailable", { status }));
    const response = await reader.call({ text: "Zehn Morgen 2023" });
    expect(response.status).toBe(status);
    expect(await response.json()).toHaveProperty("error");
  });

  it("rejects plain text when a structured tool result is missing", async () => {
    const reader = loadLabelReader(
      Response.json({ choices: [{ message: { content: "A wine." } }] }),
    );
    const response = await reader.call({ text: "Zehn Morgen 2023" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI returned no tool call" });
  });

  it.each([401, 429])(
    "does not spend gateway credits when the access guard denies with %s",
    async (status) => {
      const reader = loadLabelReader(toolResponse(), new Response("denied", { status }));
      const response = await reader.call({ text: "Zehn Morgen 2023" });
      expect(response.status).toBe(status);
      expect(reader.fetch).not.toHaveBeenCalled();
    },
  );
});
