import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError, createAiClient } from "../../supabase/functions/_shared/aiClient";

const values: Record<string, string> = {
  OPENAI_API_KEY: "synthetic-openai-key",
  GEMINI_API_KEY: "synthetic-gemini-key",
};
const environment = (name: string) => values[name];
const send = () => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [] }));

const retryEnvironment = (name: string) =>
  ({
    ...values,
    SUPABASE_URL: "https://pzniyupmgwvlldvztzqh.supabase.co",
    GEMINI_TRANSIENT_RETRY_ENABLED: "true",
  })[name];

describe("bounded local Gemini retry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accepts only the explicitly enabled owned Docker backend", async () => {
    const owned = {
      ...values,
      WINESNAP_OWNED_BACKEND_ENABLED: "true",
      SUPABASE_URL: "http://winesnap-owned-gateway:8080",
      GEMINI_TRANSIENT_RETRY_ENABLED: "true",
    };
    const fetcher = send();
    await createAiClient("fast", (name) => owned[name as keyof typeof owned], fetcher).complete({
      messages: [],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    for (const override of [
      { WINESNAP_OWNED_BACKEND_ENABLED: "false" },
      { SUPABASE_URL: "https://production.invalid" },
      { SUPABASE_URL: "http://localhost:54323" },
      { SUPABASE_URL: "https://pzniyupmgwvlldvztzqh.supabase.co" },
      { SUPABASE_URL: "http://winesnap-owned-gateway:8080/path" },
    ]) {
      const env = { ...owned, ...override };
      expect(() =>
        createAiClient("fast", (name) => env[name as keyof typeof env], fetcher),
      ).toThrow(AiConfigurationError);
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retries a transient 503 with identical destination, key, payload and total deadline", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ choices: [] }));
    const pending = createAiClient("fast", retryEnvironment, fetcher).complete({ messages: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toEqual(fetcher.mock.calls[0]);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(fetcher.mock.calls[1][1]?.signal);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
  });

  it("stops after two retries and leaves the final failure readable", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("busy", { status: 503 }));
    const pending = createAiClient("fast", retryEnvironment, fetcher).complete({ messages: [] });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).text()).toBe("busy");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 402, 403, 404, 429, 500, 502, 504])(
    "does not retry status %s or charge for another model",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
      expect(
        (await createAiClient("fast", retryEnvironment, fetcher).complete({ messages: [] })).status,
      ).toBe(status);
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it("honors Retry-After only when it fits the existing deadline", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 503, headers: { "retry-after": "120" } }));
    const response = await createAiClient("fast", retryEnvironment, fetcher).complete({
      messages: [],
    });
    expect(await response.text()).toBe("busy");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("waits for a fitting Retry-After HTTP date without resetting the budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { "retry-after": "Sat, 24 Oct 2026 12:00:05 GMT" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ choices: [] }));
    const pending = createAiClient("fast", retryEnvironment, fetcher).complete({ messages: [] });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
  });

  it("cancels backoff immediately when the original deadline expires", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const pending = createAiClient("fast", retryEnvironment, fetcher).complete({ messages: [] });
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new DOMException("deadline", "TimeoutError"));
    await rejected;
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("never retries a network timeout or a successful but malformed answer", async () => {
    const timeout = new DOMException("deadline", "TimeoutError");
    const failed = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    await expect(
      createAiClient("fast", retryEnvironment, failed).complete({ messages: [] }),
    ).rejects.toBe(timeout);
    expect(failed).toHaveBeenCalledOnce();
    const success = vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON"));
    await createAiClient("fast", retryEnvironment, success).complete({ messages: [] });
    expect(success).toHaveBeenCalledOnce();
  });

  it("leaves defaults and all OpenAI calls unchanged and refuses unapproved backends", async () => {
    for (const [task, env] of [
      ["fast", environment],
      ["labelReading", retryEnvironment],
    ] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
      await createAiClient(task, env, fetcher).complete({ messages: [] });
      expect(fetcher).toHaveBeenCalledOnce();
    }
    expect(() =>
      createAiClient("fast", (name) =>
        name === "SUPABASE_URL" ? "https://other.example.test" : retryEnvironment(name),
      ),
    ).toThrow(AiConfigurationError);
  });
});

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
    const path = `supabase/functions/${name}/handler.ts`;
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
