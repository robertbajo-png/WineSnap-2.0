import { describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../supabase/functions/_shared/aiClient";
import { createLocalAiClient } from "./ownedTextAi.server";

const environment = {
  WINESNAP_LOCAL_TEXT_PROVIDER: "openai",
  WINESNAP_OWNED_BACKEND_ENABLED: "true",
  SUPABASE_URL: "http://winesnap-owned-gateway:8080",
  OPENAI_API_KEY: "sk-synthetic-not-a-real-key",
  GEMINI_API_KEY: "synthetic-gemini-test-key",
};
const env =
  (changes: Record<string, string | undefined> = {}) =>
  (name: string) =>
    (({ ...environment, ...changes }) as Record<string, string | undefined>)[name];
const messages = [
  { role: "system", content: "Application instructions" },
  { role: "user", content: "Scoped data" },
  { role: "assistant", content: "Earlier answer" },
  { role: "user", content: "Vilket vin passar?" },
];
const outputText = (text = "Ett torrt vitt vin.") => ({
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text }],
});
const envelope = (output: unknown[] = [outputText()]) => ({
  model: "gpt-6-luna",
  status: "completed",
  output,
  usage: {
    input_tokens: 67,
    output_tokens: 21,
    total_tokens: 88,
    input_tokens_details: { cached_tokens: 8 },
    output_tokens_details: { reasoning_tokens: 2 },
  },
});
const parameters = { type: "object", properties: { wines: { type: "array" } } };
const forced = {
  tools: [
    {
      type: "function",
      function: { name: "extract_menu_wines", description: "Menu result", parameters },
    },
  ],
  tool_choice: { type: "function", function: { name: "extract_menu_wines" } },
};
const functionCall = {
  type: "function_call",
  status: "completed",
  call_id: "call_synthetic",
  name: "extract_menu_wines",
  arguments: '{"wines":[]}',
};

describe("owned OpenAI Responses bridge", () => {
  it("keeps the text history, no-store behavior, and existing application response", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(envelope([{ type: "reasoning", summary: ["not returned"] }, outputText()])),
      );
    const observe = vi.fn();
    const client = createLocalAiClient("fast", env(), send, observe);
    const response = await client.complete({ max_tokens: 4096, messages });
    expect(client.model).toBe("gpt-6-luna");
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-6-luna",
      input: messages,
      store: false,
      stream: false,
      max_output_tokens: 4096,
      reasoning: { effort: "low" },
    });
    expect(await response.json()).toEqual({
      model: "gpt-6-luna",
      choices: [
        { finish_reason: "stop", message: { role: "assistant", content: "Ett torrt vitt vin." } },
      ],
      usage: {
        prompt_tokens: 67,
        completion_tokens: 21,
        total_tokens: 88,
        prompt_tokens_details: { cached_tokens: 8 },
        completion_tokens_details: { reasoning_tokens: 2 },
      },
    });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: "gpt-6-luna",
        returnedModel: "gpt-6-luna",
        inputTokens: 67,
        outputTokens: 21,
        attempts: 1,
        outcome: "http_ok",
      }),
    );
    expect(JSON.stringify(observe.mock.calls)).not.toContain("Scoped data");
  });

  it.each(["recipe_draft", "food_memory_candidates"])(
    "retains the Chef JSON contract for %s",
    async (name) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(envelope([outputText("{}")])));
      const schema = { type: "object", additionalProperties: false, required: [], properties: {} };
      const response = await createLocalAiClient("fast", env(), send).complete(
        {
          messages,
          max_tokens: 4096,
          reasoning_effort: "low",
          response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        },
        45_000,
      );
      expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name, strict: true, schema } },
      });
      expect((await response.json()).choices[0].message.content).toBe("{}");
    },
  );

  it("converts a menu photo and retains exactly the requested function result", async () => {
    const image = "data:image/png;base64,AAE=";
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope([functionCall])));
    const response = await createLocalAiClient("fast", env(), send).complete(
      {
        ...forced,
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Meny" },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      },
      30_000,
    );
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Meny" },
            { type: "input_image", image_url: image, detail: "auto" },
          ],
        },
      ],
      tools: [{ type: "function", name: "extract_menu_wines", parameters, strict: false }],
      tool_choice: { type: "function", name: "extract_menu_wines" },
      parallel_tool_calls: false,
      max_output_tokens: 8192,
    });
    expect((await response.json()).choices[0]).toEqual({
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            type: "function",
            id: "call_synthetic",
            function: { name: functionCall.name, arguments: functionCall.arguments },
          },
        ],
      },
    });
  });

  it.each([
    { ...envelope(), status: "incomplete" },
    { ...envelope(), status: "failed" },
    { ...envelope(), model: "not-an-approved-model" },
    envelope([{ ...outputText(), content: [{ type: "refusal", refusal: "not public" }] }]),
    envelope([{ ...outputText(), status: "incomplete" }]),
    envelope([outputText(" ")]),
    envelope([{ type: "web_search_call" }]),
    envelope([functionCall]),
  ])("does not return partial, refused or unexpected text output", async (body) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const result = await createLocalAiClient("fast", env(), send).complete({ messages });
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: "Invalid or incomplete AI response" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    { kind: "missing", output: [outputText()] },
    { kind: "wrong name", output: [{ ...functionCall, name: "other" }] },
    { kind: "malformed JSON", output: [{ ...functionCall, arguments: "[" }] },
    { kind: "non-object JSON", output: [{ ...functionCall, arguments: "[]" }] },
    { kind: "duplicate", output: [functionCall, functionCall] },
  ])("refuses the $kind function result", async ({ output }) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope(output)));
    const result = await createLocalAiClient("fast", env(), send).complete({ ...forced, messages });
    expect(result.status).toBe(502);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([402, 429, 503])(
    "keeps upstream status %s without headers, content or a retry",
    async (status) => {
      const send = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("private error", {
          status,
          headers: { "X-Private": "internal identifier" },
        }),
      );
      const result = await createLocalAiClient("fast", env(), send).complete({ messages });
      expect(result.status).toBe(status);
      expect(result.headers.get("X-Private")).toBeNull();
      expect(await result.text()).not.toContain("private error");
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds provider response bytes and keeps timeout classification", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(envelope([outputText("x".repeat(100_001))])))
      .mockRejectedValueOnce(new DOMException("test timeout", "TimeoutError"));
    const observe = vi.fn();
    const client = createLocalAiClient("fast", env(), send, observe);
    expect((await client.complete({ messages })).status).toBe(502);
    await expect(client.complete({ messages })).rejects.toHaveProperty("name", "TimeoutError");
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "timeout", attempts: 1 }),
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    { WINESNAP_OWNED_BACKEND_ENABLED: "false" },
    { SUPABASE_URL: "https://foreign.invalid" },
    { WINESNAP_LOCAL_TEXT_PROVIDER: "auto" },
    { WINESNAP_LOCAL_TEXT_MODEL: "gpt-6.2-astra" },
    { WINESNAP_LOCAL_TEXT_PROVIDER: undefined, WINESNAP_LOCAL_TEXT_MODEL: "gpt-6.2-sol" },
    { WINESNAP_LOCAL_TEXT_PROVIDER: "gemini", WINESNAP_LOCAL_TEXT_MODEL: "gpt-6.2-sol" },
    { OPENAI_API_KEY: undefined },
  ])("fails closed if OpenAI is not configured for this owned backend", (changes) => {
    const send = vi.fn<typeof fetch>();
    expect(() => createLocalAiClient("fast", env(changes), send)).toThrow(AiConfigurationError);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { model: "caller-model" },
    { stream: true },
    { max_tokens: 8193 },
    {
      messages: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "https://foreign.invalid/a.png" } }],
        },
      ],
    },
    { tools: forced.tools },
  ])("refuses unsupported request options before sending", (overrides) => {
    const send = vi.fn<typeof fetch>();
    const client = createLocalAiClient("fast", env(), send);
    expect(() => client.complete({ messages, ...overrides })).toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the label path and explicit Gemini alternative unchanged", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ choices: [] }));
    await createLocalAiClient("labelReading", env(), send).complete({ messages });
    await createLocalAiClient(
      "fast",
      env({ WINESNAP_LOCAL_TEXT_PROVIDER: "gemini" }),
      send,
    ).complete({ messages });
    expect(send.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    ]);
    expect(send.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model)).toEqual([
      "gpt-6.1-sol",
      "gemini-3.8-flash",
    ]);
  });

  it("uses GPT-6.2 Sol only when chosen and forbids a silent model change", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...envelope(), model: "gpt-6.2-sol-2026-11-25" }))
      .mockResolvedValueOnce(Response.json(envelope()));
    const observe = vi.fn();
    const client = createLocalAiClient(
      "fast",
      env({ WINESNAP_LOCAL_TEXT_MODEL: "gpt-6.2-sol" }),
      send,
      observe,
    );
    expect(client.model).toBe("gpt-6.2-sol");
    expect((await client.complete({ messages })).status).toBe(200);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).model).toBe("gpt-6.2-sol");
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ returnedModel: "gpt-6.2-sol-2026-11-25" }),
    );
    expect((await client.complete({ messages })).status).toBe(502);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
