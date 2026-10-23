import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AiConfigurationError, createAiClient } from "../../supabase/functions/_shared/aiClient";

const values: Record<string, string> = {
  OPENAI_API_KEY: "synthetic-openai-key",
  GEMINI_API_KEY: "synthetic-gemini-key",
};
const environment = (name: string) => values[name];
const send = () => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [] }));

describe("owned AI transport", () => {
  it.each([
    ["labelReading", "https://api.openai.com/v1/chat/completions", "gpt-6.1-sol", "openai"],
    [
      "fast",
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      "gemini-3.8-flash",
      "gemini",
    ],
  ] as const)(
    "routes %s only to its own provider with its own key",
    async (task, url, model, key) => {
      const fetcher = send();
      const client = createAiClient(task, environment, fetcher);
      const body = {
        messages: [{ role: "user", content: "Synthetic test" }],
        max_completion_tokens: 8192,
        model: "untrusted-client-model",
        stream: true,
      };
      await client.complete(body);
      const [endpoint, request] = fetcher.mock.calls[0];
      expect(endpoint).toBe(url);
      expect(request?.headers).toMatchObject({ Authorization: `Bearer synthetic-${key}-key` });
      expect(request?.redirect).toBe("error");
      expect(request?.cache).toBe("no-store");
      expect(request?.signal).toBeInstanceOf(AbortSignal);
      const payload = JSON.parse(String(request?.body));
      expect(payload).toMatchObject({ model, stream: false, messages: body.messages });
      expect(client.model).toBe(model);
      if (task === "labelReading") {
        expect(payload).toHaveProperty("store", false);
        expect(payload).not.toHaveProperty("max_tokens");
      } else {
        expect(payload.max_tokens).toBe(4096);
        expect(payload).not.toHaveProperty("store");
      }
      expect(body.model).toBe("untrusted-client-model");
    },
  );

  it("preserves forced tools and schema contents without rewriting the contract", async () => {
    const fetcher = send();
    const tool = { type: "function", function: { name: "suggest_wines" } };
    await createAiClient("fast", environment, fetcher).complete({
      tools: [tool],
      tool_choice: tool,
      messages: [],
    });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      tools: [tool],
      tool_choice: tool,
    });
  });

  it("records an explicitly configured native model, not the old gateway ID", async () => {
    const fetcher = send();
    const client = createAiClient(
      "fast",
      (name) => (name === "GEMINI_FAST_MODEL" ? "gemini-test-pinned" : environment(name)),
      fetcher,
    );
    await client.complete({ messages: [] });
    expect(client.model).toBe("gemini-test-pinned");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).model).toBe(client.model);
  });

  it.each(["", "key\nInjected: header", "key with spaces"])(
    "fails closed on absent or malformed owned keys without exposing their value",
    (key) => {
      const fetcher = send();
      expect(() => createAiClient("fast", () => key, fetcher)).toThrow(AiConfigurationError);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(["openai/gpt-6.1-sol", "https://example.test/steal", "gemini-wrong-provider"])(
    "rejects an invalid label model %s instead of rerouting requests",
    (model) => {
      expect(() =>
        createAiClient("labelReading", (name) =>
          name === "OPENAI_LABEL_MODEL" ? model : environment(name),
        ),
      ).toThrow("AI provider is not configured");
    },
  );

  it.each([401, 402, 404, 429, 500])(
    "never retries or swaps providers after HTTP %s",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private detail", { status }));
      const response = await createAiClient("labelReading", environment, fetcher).complete({
        messages: [],
        max_completion_tokens: 8192,
      });
      expect(response.status).toBe(status);
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("propagates timeouts without retrying or disclosing request contents", async () => {
    const timeout = new DOMException("Timed out", "TimeoutError");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    await expect(
      createAiClient("fast", environment, fetcher).complete({ messages: [] }, 30_000),
    ).rejects.toBe(timeout);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([0, 45_001, Infinity, 1.5])("rejects unbounded timeout %s", (timeout) => {
    const fetcher = send();
    expect(() =>
      createAiClient("fast", environment, fetcher).complete({ messages: [] }, timeout),
    ).toThrow("Invalid AI timeout");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["labelReading", "fast"] as const)("caps the %s output budget", (task) => {
    const fetcher = send();
    const field = task === "fast" ? "max_tokens" : "max_completion_tokens";
    for (const value of [0, 8193, Infinity, "8192"]) {
      expect(() => createAiClient(task, environment, fetcher).complete({ [field]: value })).toThrow(
        "Invalid AI output budget",
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Edge migration integrity", () => {
  it.each([
    "analyze-wine",
    "ask-winesnap",
    "restaurant-match",
    "taste-suggestions",
    "wine-suggestions",
    "extract-preference-signals",
  ])("keeps %s valid, authenticated, rate-limited and gateway-free", (name) => {
    const path = `supabase/functions/${name}/${["analyze-wine", "ask-winesnap", "taste-suggestions", "wine-suggestions"].includes(name) ? "handler" : "index"}.ts`;
    const source = readFileSync(path, "utf8");
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true);
    expect((tree as typeof tree & { parseDiagnostics: unknown[] }).parseDiagnostics).toEqual([]);
    const guard = source.indexOf(
      name === "analyze-wine" ? "await dependencies.requireAccess(" : "await requireAiAccess(",
    );
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(source.indexOf('createAiClient("'));
    expect(source).toContain("instanceof AiConfigurationError");
    expect(source).toContain("503");
    expect(source).not.toMatch(/ai\.gateway\.lovable|LOVABLE_API_KEY/);
  });
});
