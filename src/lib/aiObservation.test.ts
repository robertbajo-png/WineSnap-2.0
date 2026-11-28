import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiClient } from "../../supabase/functions/_shared/aiClient";
import { AI_MODELS } from "../../supabase/functions/_shared/aiModels";
import {
  aiObservationHeaders,
  safeAiObservation,
  type AiCallObservation,
} from "../../supabase/functions/_shared/aiObservation";

const environment = (name: string) =>
  ({ OPENAI_API_KEY: "synthetic-openai-key", GEMINI_API_KEY: "synthetic-gemini-key" })[name];
const payload = {
  model: AI_MODELS.fast,
  choices: [{ message: { content: "private answer" } }],
  usage: { prompt_tokens: 12, completion_tokens: 0 },
};
const sample: AiCallObservation = {
  selectedModel: AI_MODELS.fast,
  returnedModel: null,
  providerStatus: 200,
  outcome: "http_ok",
  durationMs: 1,
  attempts: 1,
  inputTokens: 12,
  outputTokens: 0,
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bounded content-free AI observations", () => {
  it("reads usage without consuming or changing the original response", async () => {
    const response = Response.json(payload);
    const send = vi.fn<typeof fetch>().mockResolvedValue(response);
    const observe = vi.fn();
    expect(
      await createAiClient("fast", environment, send, observe).complete({
        messages: [{ role: "user", content: "private prompt" }],
      }),
    ).toBe(response);
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual(payload);
    expect(send).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledOnce();
    expect(observe.mock.calls[0][0]).toMatchObject({
      ...sample,
      returnedModel: AI_MODELS.fast,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(observe.mock.calls)).not.toMatch(
      /private|synthetic-.*key|messages|choices/,
    );
    expect(Object.isFrozen(observe.mock.calls[0][0])).toBe(true);
  });
  it("does no extra body work by default", async () => {
    const response = Response.json(payload);
    const clone = vi.spyOn(response, "clone");
    await createAiClient(
      "fast",
      environment,
      vi.fn<typeof fetch>().mockResolvedValue(response),
    ).complete({ messages: [] });
    expect(clone).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
  });
  it("keeps missing or invalid usage unknown instead of inventing zero", async () => {
    for (const usage of [
      undefined,
      { prompt_tokens: -1, completion_tokens: "123" },
      { prompt_tokens: Infinity, completion_tokens: 1e12 },
    ]) {
      const observe = vi.fn();
      await createAiClient(
        "fast",
        environment,
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ usage })),
        observe,
      ).complete({ messages: [] });
      expect(observe.mock.calls[0][0]).toMatchObject({ inputTokens: null, outputTokens: null });
    }
  });
  it.each([429, 503, 502, 401])(
    "does not read or publish the status %s provider error body",
    async (status) => {
      const response = new Response("private provider error sk-do-not-log-this", { status });
      const clone = vi.spyOn(response, "clone"),
        observe = vi.fn();
      await createAiClient(
        "fast",
        environment,
        vi.fn<typeof fetch>().mockResolvedValue(response),
        observe,
      ).complete({ messages: [] });
      expect(clone).not.toHaveBeenCalled();
      expect(observe.mock.calls[0][0]).toMatchObject({
        providerStatus: status,
        outcome: "http_error",
        inputTokens: null,
      });
      expect(JSON.stringify(observe.mock.calls)).not.toContain("private");
    },
  );
  it.each([
    ["TimeoutError", "timeout"],
    ["AbortError", "cancelled"],
    ["Error", "network_error"],
  ])("keeps %s distinct without changing the thrown object", async (name, outcome) => {
    const error = new Error("private provider detail");
    error.name = name;
    const observe = vi.fn(),
      send = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(
      createAiClient("fast", environment, send, observe).complete({ messages: [] }),
    ).rejects.toBe(error);
    expect(observe.mock.calls[0][0]).toMatchObject({
      outcome,
      providerStatus: null,
      attempts: 1,
      inputTokens: null,
      outputTokens: null,
    });
    expect(JSON.stringify(observe.mock.calls)).not.toContain(error.message);
    expect(send).toHaveBeenCalledOnce();
  });
  it("counts existing retry attempts without changing destination, payload or deadline", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const env = (name: string) =>
      ({
        SUPABASE_URL: "http://winesnap-owned-gateway:8080",
        WINESNAP_OWNED_BACKEND_ENABLED: "true",
        GEMINI_TRANSIENT_RETRY_ENABLED: "true",
      })[name] ?? environment(name);
    const send = vi.fn<typeof fetch>();
    send.mockResolvedValueOnce(new Response(null, { status: 503 }));
    send.mockResolvedValueOnce(Response.json(payload));
    const observe = vi.fn();
    const pending = createAiClient("fast", env, send, observe).complete({ messages: [] });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(observe.mock.calls[0][0]).toMatchObject({ attempts: 2, providerStatus: 200 });
  });
  it("keeps concurrent calls' counters, usage and observations separate", async () => {
    const send = vi.fn<typeof fetch>();
    send.mockResolvedValueOnce(Response.json(payload));
    send.mockResolvedValueOnce(
      Response.json({ usage: { prompt_tokens: 99, completion_tokens: 7 } }),
    );
    const observe = vi.fn(),
      client = createAiClient("fast", environment, send, observe);
    await Promise.all([client.complete({ messages: [] }), client.complete({ messages: [] })]);
    expect(observe.mock.calls.map(([s]) => s.inputTokens).sort((a, b) => a - b)).toEqual([12, 99]);
    expect(observe.mock.calls.every(([s]) => s.attempts === 1)).toBe(true);
  });
  it("does not let a broken observer fail an otherwise successful call", async () => {
    const response = Response.json(payload);
    await expect(
      createAiClient("fast", environment, vi.fn<typeof fetch>().mockResolvedValue(response), () => {
        throw Error("observer failed");
      }).complete({ messages: [] }),
    ).resolves.toBe(response);
    expect(await response.json()).toEqual(payload);
  });
  it.each(["not JSON", JSON.stringify({ private: "x".repeat(100001) })])(
    "bounds malformed/oversized response inspection",
    async (body) => {
      const response = new Response(body),
        observe = vi.fn();
      await createAiClient(
        "fast",
        environment,
        vi.fn<typeof fetch>().mockResolvedValue(response),
        observe,
      ).complete({ messages: [] });
      expect(await response.text()).toBe(body);
      expect(observe.mock.calls[0][0].inputTokens).toBe(null);
    },
  );
  it("does not wait beyond the metadata budget for a slow body or consume its other branch", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          stream = controller;
        },
      }),
    );
    const observe = vi.fn();
    const pending = createAiClient(
      "fast",
      environment,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      observe,
    ).complete({ messages: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBe(response);
    expect(observe.mock.calls[0][0].inputTokens).toBe(null);
    stream.enqueue(new TextEncoder().encode("original remains readable"));
    stream.close();
    expect(await response.text()).toBe("original remains readable");
  });
  it("does not extend the provider deadline to collect usage", async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream({ start() {} }));
    const observe = vi.fn();
    const pending = createAiClient(
      "fast",
      environment,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      observe,
    ).complete({ messages: [] }, 20);
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toBe(response);
    expect(observe.mock.calls[0][0].durationMs).toBe(20);
    void response.body?.cancel();
  });
  it("handles an uncloneable response without changing the operation", async () => {
    const response = Response.json(payload),
      observe = vi.fn();
    vi.spyOn(response, "clone").mockImplementation(() => {
      throw Error("clone unavailable");
    });
    expect(
      await createAiClient(
        "fast",
        environment,
        vi.fn<typeof fetch>().mockResolvedValue(response),
        observe,
      ).complete({ messages: [] }),
    ).toBe(response);
    expect(observe.mock.calls[0][0].inputTokens).toBe(null);
  });
  it("strips unknown models, private extra fields and invalid metrics at the response boundary", () => {
    const unsafe = {
      ...sample,
      selectedModel: "gpt-private-prompt",
      returnedModel: "private",
      inputTokens: -1,
      outputTokens: Infinity,
      durationMs: 1e20,
      attempts: 100,
      providerStatus: 200.5,
      prompt: "private",
      token: "private",
    };
    const result = safeAiObservation(unsafe);
    expect(result).toMatchObject({
      selectedModel: null,
      returnedModel: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: null,
      attempts: null,
      providerStatus: null,
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).not.toHaveProperty("prompt");
  });
  it("admits only configured public models and numeric snapshot suffixes", () => {
    expect(
      safeAiObservation({ ...sample, returnedModel: AI_MODELS.fast + "-001" }).returnedModel,
    ).toBe(AI_MODELS.fast + "-001");
    expect(
      safeAiObservation({ ...sample, returnedModel: AI_MODELS.fast + "-private-content" })
        .returnedModel,
    ).toBe(null);
  });
  it("separates provider HTTP success from an invalid app result, without creating headers for skipped calls", () => {
    expect(aiObservationHeaders("chef-chat", undefined, 429)).toEqual({});
    const headers = aiObservationHeaders("chef-generate", sample, 502);
    expect(JSON.parse(headers["X-WineSnap-AI-Metrics"])).toMatchObject({
      action: "chef-generate",
      providerStatus: 200,
      outcome: "http_ok",
      routeStatus: 502,
    });
    expect(aiObservationHeaders("private-action" as "chef-chat", sample, 200)).toEqual({});
  });
});
