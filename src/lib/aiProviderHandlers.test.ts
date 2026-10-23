import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AiConfigurationError, createAiClient } from "../../supabase/functions/_shared/aiClient";
import * as askAnswer from "../../supabase/functions/_shared/askAnswer";
import * as recommendationScoring from "../../supabase/functions/_shared/recommendationScoring";
import * as suggestionCatalog from "../../supabase/functions/_shared/suggestionCatalog";
import * as restaurantRanking from "../../supabase/functions/_shared/restaurantRanking";

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
  options: { status?: number; missingKey?: boolean; timeout?: boolean; denied?: boolean } = {},
) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (options.timeout) throw new DOMException("Timed out", "TimeoutError");
    return new Response("private-provider-error-and-credentials", {
      status: options.status ?? 429,
    });
  });
  const env = (key: string) => {
    if (key === "GEMINI_FAST_MODEL" || key === "OPENAI_LABEL_MODEL") return undefined;
    if (options.missingKey && key === "GEMINI_API_KEY") return undefined;
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
  const shared = ["ask-winesnap", "taste-suggestions", "wine-suggestions"].includes(name);
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
      createClient: () => ({ from }),
    });
  if (!handler) throw new Error("Missing Edge handler");
  return {
    fetcher,
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

  it.each([429, 404])(
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
