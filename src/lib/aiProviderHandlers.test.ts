import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AiConfigurationError, createAiClient } from "../../supabase/functions/_shared/aiClient";
import { OWNED_OPENAI_TEXT_MODELS } from "../../supabase/functions/_shared/aiModels";
import * as askAnswer from "../../supabase/functions/_shared/askAnswer";
import * as recommendationScoring from "../../supabase/functions/_shared/recommendationScoring";
import * as suggestionCatalog from "../../supabase/functions/_shared/suggestionCatalog";
import * as restaurantRanking from "../../supabase/functions/_shared/restaurantRanking";
import { createLocalAiClient } from "./ownedTextAi.server";

type Handler = (request: Request) => Promise<Response>;
const cases = [
  ["ask-winesnap", { message: "Synthetic question" }],
  ["wine-suggestions", { wineId: "synthetic-wine" }],
  ["taste-suggestions", {}],
  ["restaurant-match", { text: "Synthetic wine menu" }],
  ["extract-preference-signals", { tastingNoteId: "synthetic-note" }],
] as const;

function loadHandler(
  name: string,
  options: {
    status?: number;
    missingKey?: boolean;
    timeout?: boolean;
    denied?: boolean;
    openAiModel?: (typeof OWNED_OPENAI_TEXT_MODELS)[number];
    responsesOutput?: unknown[];
    incomplete?: boolean;
  } = {},
) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (options.timeout) throw new DOMException("Timed out", "TimeoutError");
    if (options.openAiModel && options.responsesOutput)
      return Response.json({
        model: options.openAiModel,
        status: options.incomplete ? "incomplete" : "completed",
        output: options.responsesOutput,
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      });
    return new Response("private-provider-error-and-credentials", {
      status: options.status ?? 429,
    });
  });
  const env = (key: string) => {
    if (key === "GEMINI_FAST_MODEL" || key === "OPENAI_LABEL_MODEL") return undefined;
    if (key === "WINESNAP_LOCAL_TEXT_PROVIDER") return options.openAiModel && "openai";
    if (key === "WINESNAP_LOCAL_TEXT_MODEL") return options.openAiModel;
    if (key === "WINESNAP_OWNED_BACKEND_ENABLED") return "true";
    if (key === "SUPABASE_URL") return "http://winesnap-owned-gateway:8080";
    if (options.missingKey && key === (options.openAiModel ? "OPENAI_API_KEY" : "GEMINI_API_KEY"))
      return undefined;
    return "synthetic-server-key";
  };
  const rows: Record<string, unknown[]> = {
    wines: [{ id: "synthetic-wine", user_id: "owner", producer: "Test", wine_name: "Test" }],
    tasting_notes: [{ id: "synthetic-note", notes: "Fresh", rating: 4, wines: {} }],
  };
  // Test-only fluent queries; no real database or model provider is contacted.
  const from = (table: string) => {
    const data = rows[table] ?? [];
    const result = { data, error: null };
    const query: Record<string, unknown> = {};
    const chain = new Proxy(query, {
      get: (_, method) => {
        if (method === "maybeSingle") return async () => ({ data: data[0] ?? null, error: null });
        if (method === "then") return Promise.resolve(result).then.bind(Promise.resolve(result));
        return () => chain;
      },
    });
    return chain;
  };
  const requireAiAccess = vi.fn(async () =>
    options.denied ? new Response("Unauthorized", { status: 401 }) : { userId: "owner" },
  );
  const rpc = vi.fn(async (name: string, _args: unknown) => {
    if (name === "store_ai_exchange") {
      const timestamp = "2026-11-15T12:00:00Z";
      return {
        data: [
          {
            conversation_id: "synthetic-conversation",
            user_message_id: "synthetic-user-message",
            assistant_message_id: "synthetic-assistant-message",
            user_created_at: timestamp,
            assistant_created_at: timestamp,
          },
        ],
        error: null,
      };
    }
    if (name !== "replace_extracted_preference_signals") throw new Error("Unexpected test RPC");
    return { data: null, error: null };
  });
  const imports: Record<string, unknown> = {
    "npm:@supabase/supabase-js@2.105.1": { createClient: () => ({ from }) },
    "../_shared/aiSecurity.ts": { requireAiAccess },
    "../_shared/aiClient.ts": {
      AiConfigurationError,
      createAiClient: (workload: "fast") => createAiClient(workload, env, fetcher),
    },
    "../_shared/askAnswer.ts": askAnswer,
    "../_shared/recommendationScoring.ts": recommendationScoring,
    "../_shared/suggestionCatalog.ts": suggestionCatalog,
    "../_shared/restaurantRanking.ts": restaurantRanking,
  };
  let handler: Handler | undefined;
  const shared = true;
  const exported: { createHandler?: (dependencies: unknown) => Handler } = {};
  const source = readFileSync(
    `supabase/functions/${name}/${shared ? "handler" : "index"}.ts`,
    "utf8",
  );
  runInNewContext(
    transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: exported,
      require: (path: string) => {
        if (!(path in imports)) throw new Error(`Unexpected Edge import: ${path}`);
        return imports[path];
      },
      Deno: { env: { get: env }, serve: (callback: Handler) => (handler = callback) },
      Request,
      Response,
      DOMException,
      Error,
      console: { error: vi.fn() },
    },
  );
  if (shared)
    handler = exported.createHandler?.({
      env,
      requireAccess: requireAiAccess,
      createClient: () => ({ from, rpc }),
      ...(options.openAiModel
        ? { aiClient: (workload: "fast") => createLocalAiClient(workload, env, fetcher) }
        : {}),
    });
  if (!handler) throw new Error("Missing Edge handler");
  return {
    fetcher,
    rpc,
    call: (body: unknown) =>
      handler!(
        new Request(`https://example.test/${name}`, {
          method: "POST",
          headers: { Authorization: "Bearer synthetic-user", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
  };
}

describe.each(cases)("%s direct AI handler", (name, body) => {
  it("denies unauthorized calls before any model expense", async () => {
    const api = loadHandler(name, { denied: true });
    expect((await api.call(body)).status).toBe(401);
    expect(api.fetcher).not.toHaveBeenCalled();
  });

  it("fails closed with a safe 503 when the owned key is missing", async () => {
    const api = loadHandler(name, { missingKey: true });
    const response = await api.call(body);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AI provider is not configured" });
    expect(api.fetcher).not.toHaveBeenCalled();
  });

  it.each([429, 404, 503])(
    "handles HTTP %s without leaking details or trying another provider",
    async (status) => {
      const api = loadHandler(name, { status });
      const response = await api.call(body);
      expect(response.status).toBe(
        status === 429 && name !== "extract-preference-signals" ? 429 : 502,
      );
      expect(await response.text()).not.toContain("private-provider");
      expect(api.fetcher).toHaveBeenCalledOnce();
      expect(api.fetcher.mock.calls[0][0]).toBe(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      );
      const payload = JSON.parse(String(api.fetcher.mock.calls[0][1]?.body));
      expect(payload.model).toBe("gemini-3.8-flash");
      if (["ask-winesnap", "taste-suggestions", "wine-suggestions"].includes(name)) {
        expect(payload.reasoning_effort).toBe("low");
        expect(payload).not.toHaveProperty("temperature");
      }
      if (name !== "ask-winesnap") expect(payload.tool_choice.type).toBe("function");
    },
  );

  it("maps provider timeout to 504 without retrying", async () => {
    const api = loadHandler(name, { timeout: true });
    expect((await api.call(body)).status).toBe(504);
    expect(api.fetcher).toHaveBeenCalledOnce();
  });
});

describe.each(OWNED_OPENAI_TEXT_MODELS)("%s through actual WineSnap handlers", (openAiModel) => {
  const answer = "A synthetic tasting answer.";
  const catalogId = suggestionCatalog.availableSuggestionIds([])[0];
  const menuWine = { wine_name: "Synthetic menu wine", price: 100, body: 4 };
  const signal = {
    attribute: "acidity",
    direction: "like",
    value_text: null,
    value_number: 7,
    strength: 0.8,
    confidence: 0.9,
    evidence: "Fresh acidity",
  };
  const assistantOutput = [
    { type: "message", role: "assistant", content: [{ type: "output_text", text: answer }] },
  ];
  const suggestions = {
    suggestions: [
      { catalog_id: "not-in-catalog", style_reason: "Must not be shown" },
      { catalog_id: catalogId, style_reason: "Synthetic verified style." },
    ],
  };

  it.each(cases)(
    "validates and returns %s results via the scoped Responses client",
    async (name, body) => {
      let tool: { name: string; result: object } | undefined;
      if (name === "wine-suggestions" || name === "taste-suggestions")
        tool = { name: "suggest_wines", result: suggestions };
      if (name === "restaurant-match")
        tool = { name: "extract_menu_wines", result: { wines: [menuWine] } };
      if (name === "extract-preference-signals")
        tool = {
          name: "extract_preference_signals",
          result: { signals: [signal, { ...signal, confidence: 10 }] },
        };
      const api = loadHandler(name, {
        openAiModel,
        responsesOutput: tool
          ? [
              {
                type: "function_call",
                name: tool.name,
                call_id: "synthetic-call",
                arguments: JSON.stringify(tool.result),
              },
            ]
          : assistantOutput,
      });
      const image = "data:image/png;base64,AAE=";
      const response = await api.call(name === "restaurant-match" ? { image } : body);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(api.fetcher).toHaveBeenCalledOnce();
      const [url, request] = api.fetcher.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/responses");
      const payload = JSON.parse(String(request?.body));
      expect(payload).toMatchObject({ model: openAiModel, store: false, stream: false });
      if (tool) expect(payload.tool_choice).toEqual({ type: "function", name: tool.name });

      if (name === "ask-winesnap") {
        expect(data.message.content).toBe(answer);
        expect(api.rpc).toHaveBeenCalledExactlyOnceWith(
          "store_ai_exchange",
          expect.objectContaining({
            _user_id: "owner",
            _assistant_content: answer,
            _model: openAiModel,
            _token_usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          }),
        );
      } else if (name === "restaurant-match") {
        expect(payload.input.at(-1).content).toContainEqual({
          type: "input_image",
          image_url: image,
          detail: "auto",
        });
        expect(data.extracted_wines[0]).toMatchObject(menuWine);
        expect(data.picks[0].wine_name).toBe(menuWine.wine_name);
      } else if (name === "extract-preference-signals") {
        expect(data.signals).toEqual([signal]);
        expect(api.rpc).toHaveBeenCalledExactlyOnceWith("replace_extracted_preference_signals", {
          _user_id: "owner",
          _tasting_note_id: "synthetic-note",
          _signals: [signal],
        });
      } else {
        expect(data.suggestions).toHaveLength(1);
        expect(data.suggestions[0]).toMatchObject({
          catalog_id: catalogId,
          identity_verified: true,
        });
      }
    },
  );

  it("does not save or retry an incomplete answer", async () => {
    const api = loadHandler("ask-winesnap", {
      openAiModel,
      responsesOutput: assistantOutput,
      incomplete: true,
    });
    expect((await api.call(cases[0][1])).status).toBe(502);
    expect(api.fetcher).toHaveBeenCalledOnce();
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("never calls OpenAI for unauthorized requests or uses Gemini when the key is missing", async () => {
    for (const [options, status] of [
      [{ denied: true }, 401],
      [{ missingKey: true }, 503],
    ] as const) {
      const api = loadHandler("ask-winesnap", { openAiModel, ...options });
      expect((await api.call(cases[0][1])).status).toBe(status);
      expect(api.fetcher).not.toHaveBeenCalled();
      expect(api.rpc).not.toHaveBeenCalled();
    }
  });
});
