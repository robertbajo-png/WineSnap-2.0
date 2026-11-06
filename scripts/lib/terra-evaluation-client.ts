import { createAiClient } from "../../supabase/functions/_shared/aiClient.ts";

export const terraModel = "gpt-6.1-terra";
export const solModel = "gpt-6.1-sol";
export type TerraSample = {
  status: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  model: string;
  kind: string;
  code?: string;
};

export function terraRequest(body: Record<string, unknown>) {
  if (!Array.isArray(body.messages)) throw new Error("Evaluation messages required");
  const input = body.messages.map((message: { role: string; content: unknown }) => ({
    role: message.role,
    content: Array.isArray(message.content)
      ? message.content.map((part) => {
          if (part.type === "text") return { type: "input_text", text: part.text };
          if (part.type === "image_url")
            return {
              type: "input_image",
              image_url: part.image_url.url,
              detail: part.image_url.detail ?? "auto",
            };
          throw new Error("Unsupported evaluation input");
        })
      : message.content,
  }));
  const budget = body.max_completion_tokens ?? body.max_tokens ?? 4096;
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1 || budget > 8192)
    throw new Error("Invalid evaluation budget");
  const reasoning = body.reasoning_effort ?? "low";
  if (!["none", "low", "medium", "high"].includes(String(reasoning)))
    throw new Error("Invalid evaluation reasoning");
  const format = body.response_format as
    { type?: string; json_schema?: Record<string, unknown> } | undefined;
  const tools = body.tools as
    | { type: string; function: { name: string; description?: string; parameters: object } }[]
    | undefined;
  const choice = body.tool_choice as { type?: string; function?: { name?: string } } | undefined;
  return {
    model: terraModel,
    store: false,
    stream: false,
    input,
    reasoning: { effort: reasoning },
    max_output_tokens: budget,
    ...(format?.type === "json_schema"
      ? { text: { format: { type: "json_schema", ...format.json_schema } } }
      : {}),
    ...(tools?.length
      ? {
          tools: tools.map((t) => {
            if (t.type !== "function") throw new Error("Unsupported evaluation tool");
            return { type: "function", ...t.function, strict: false };
          }),
          parallel_tool_calls: false,
        }
      : {}),
    ...(choice?.function?.name
      ? { tool_choice: { type: "function", name: choice.function.name } }
      : {}),
  };
}

export function terraCompletion(data: Record<string, unknown>) {
  const output = (Array.isArray(data.output) ? data.output : []) as {
    type: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: { type: string; text?: string; refusal?: string }[];
  }[];
  const text = output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("\n");
  const refusal = output
    .flatMap((item) => item.content ?? [])
    .find((item) => item.type === "refusal")?.refusal;
  const calls = output
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      id: item.call_id,
      type: "function",
      function: { name: item.name, arguments: item.arguments },
    }));
  const usage = data.usage as
    { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
  return {
    model: data.model,
    choices: [
      {
        finish_reason: data.status === "completed" ? "stop" : "length",
        message: {
          role: "assistant",
          content: text || null,
          ...(refusal ? { refusal } : {}),
          ...(calls.length ? { tool_calls: calls } : {}),
        },
      },
    ],
    usage: {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
    },
  };
}

export function createTerraEvaluationFactory(
  key: string,
  sample: (value: TerraSample) => void,
  send: typeof fetch = fetch,
): typeof createAiClient {
  if (!/^sk-[A-Za-z0-9_-]{20,4093}$/.test(key)) throw new Error("Evaluation key unavailable");
  let requests = 0;
  return () => ({
    model: terraModel,
    async complete(body, timeoutMs = 45000) {
      if (++requests > 20) throw new Error("Evaluation request limit reached");
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45000)
        throw new Error("Invalid evaluation timeout");
      const payload = terraRequest(body),
        started = Date.now();
      const kind = Array.isArray(body.tools)
        ? "function"
        : body.response_format
          ? "json_schema"
          : "text";
      const response = await send("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      const usage = data.usage ?? {};
      const code =
        typeof data.error?.code === "string" && /^[a-z_]{1,48}$/.test(data.error.code)
          ? data.error.code
          : undefined;
      sample({
        status: response.status,
        durationMs: Date.now() - started,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0,
        reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
        model: typeof data.model === "string" ? data.model : terraModel,
        kind,
        ...(code ? { code } : {}),
      });
      return Response.json(
        response.ok ? terraCompletion(data) : { error: { code: code ?? "provider_error" } },
        { status: response.status },
      );
    },
  });
}

// Compare the failing image using the deployed Sol transport, not the Terra bridge.
export function createSolImageEvaluationFactory(
  key: string,
  sample: (value: TerraSample) => void,
  send: typeof fetch = fetch,
): typeof createAiClient {
  let requests = 0;
  return (workload) => {
    if (workload !== "labelReading") throw new Error("Sol evaluation is image-only");
    return createAiClient(
      workload,
      (name) =>
        name === "OPENAI_API_KEY" ? key : name === "OPENAI_LABEL_MODEL" ? solModel : undefined,
      async (url, init) => {
        if (++requests > 4) throw new Error("Sol image evaluation limit reached");
        const started = Date.now();
        const response = await send(url, init);
        const data = await response
          .clone()
          .json()
          .catch(() => ({}));
        const usage = data.usage ?? {};
        sample({
          status: response.status,
          durationMs: Date.now() - started,
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
          model:
            typeof data.model === "string" && /^gpt-[a-z0-9.-]{1,100}$/.test(data.model)
              ? data.model
              : solModel,
          kind: JSON.parse(String(init?.body)).response_format ? "json_schema" : "text",
        });
        return response;
      },
    );
  };
}
