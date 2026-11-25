import { z } from "zod";
import { AiConfigurationError, createAiClient } from "../../supabase/functions/_shared/aiClient";
import { OWNED_OPENAI_TEXT_MODELS } from "../../supabase/functions/_shared/aiModels";
import {
  observeAiCompletion,
  type AiObserver,
} from "../../supabase/functions/_shared/aiObservation";
import { ownedBackendOrigin } from "./backendScope";

const endpoint = "https://api.openai.com/v1/responses";
const responseLimit = 100_000;
const functionName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const jsonObject = z.object({}).passthrough();
const textPart = z.object({ type: z.literal("text"), text: z.string() }).strict();
const imagePart = z
  .object({
    type: z.literal("image_url"),
    image_url: z
      .object({
        url: z
          .string()
          .max(8_388_650)
          .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
        detail: z.enum(["auto", "low", "high"]).optional(),
      })
      .strict(),
  })
  .strict();

const requestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "developer", "user", "assistant"]),
            content: z.union([
              z.string(),
              z
                .array(z.union([textPart, imagePart]))
                .min(1)
                .max(4),
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    max_tokens: z.number().int().min(16).max(8192).default(4096),
    reasoning_effort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]).default("low"),
    response_format: z
      .object({
        type: z.literal("json_schema"),
        json_schema: z
          .object({
            name: functionName,
            schema: jsonObject,
            strict: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    tools: z
      .array(
        z
          .object({
            type: z.literal("function"),
            function: z
              .object({
                name: functionName,
                description: z.string().optional(),
                parameters: jsonObject,
                strict: z.boolean().optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .length(1)
      .optional(),
    tool_choice: z
      .object({
        type: z.literal("function"),
        function: z.object({ name: functionName }).strict(),
      })
      .strict()
      .optional(),
  })
  .strict();

type TextModel = (typeof OWNED_OPENAI_TEXT_MODELS)[number];

function responsesRequest(body: Record<string, unknown>, model: TextModel) {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) throw new Error("Unsupported owned AI request");
  const request = parsed.data;
  const tool = request.tools?.[0].function;
  if (
    (tool && (request.response_format || request.tool_choice?.function.name !== tool.name)) ||
    (!tool && request.tool_choice)
  )
    throw new Error("Unsupported owned AI output contract");
  const input = request.messages.map(({ role, content }) => {
    if (typeof content === "string") return { role, content };
    if (role !== "user") throw new Error("Unsupported owned AI input role");
    return {
      role,
      content: content.map((part) =>
        part.type === "text"
          ? { type: "input_text", text: part.text }
          : {
              type: "input_image",
              image_url: part.image_url.url,
              detail: part.image_url.detail ?? "auto",
            },
      ),
    };
  });
  return {
    model,
    input,
    store: false,
    stream: false,
    max_output_tokens: request.max_tokens,
    reasoning: { effort: request.reasoning_effort },
    ...(request.response_format
      ? { text: { format: { type: "json_schema", ...request.response_format.json_schema } } }
      : {}),
    ...(tool
      ? {
          // Keep existing optional schema fields; the app still validates the result.
          tools: [{ type: "function", ...tool, strict: tool.strict ?? false }],
          tool_choice: { type: "function", name: tool.name },
          parallel_tool_calls: false,
        }
      : {}),
  };
}

const counter = z.number().int().min(0).max(1_000_000_000);
const outputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reasoning") }),
  z.object({
    type: z.literal("message"),
    role: z.literal("assistant"),
    status: z.literal("completed").optional(),
    content: z.array(z.object({ type: z.literal("output_text"), text: z.string() })).min(1),
  }),
  z.object({
    type: z.literal("function_call"),
    status: z.literal("completed").optional(),
    call_id: z.string().min(1).max(128),
    name: functionName,
    arguments: z.string().min(1),
  }),
]);
const responseSchema = z.object({
  status: z.literal("completed"),
  model: z.string().max(128),
  output: z.array(outputSchema).min(1).max(32),
  usage: z
    .object({
      input_tokens: counter,
      output_tokens: counter,
      total_tokens: counter.optional(),
      input_tokens_details: z.object({ cached_tokens: counter }).optional(),
      output_tokens_details: z.object({ reasoning_tokens: counter }).optional(),
    })
    .nullish(),
});

async function readResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > responseLimit) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      return null;
    }
  } finally {
    reader.releaseLock();
  }
}

function completionBody(value: unknown, selected: TextModel, expectedTool: string | undefined) {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) return null;
  const { model, output, usage } = parsed.data;
  if (
    model !== selected &&
    !(
      model.startsWith(selected + "-") &&
      /^(?:\d{3}|\d{4}-\d{2}-\d{2})$/.test(model.slice(selected.length + 1))
    )
  )
    return null;
  const calls = output.filter((item) => item.type === "function_call");
  const text = output
    .flatMap((item) => (item.type === "message" ? item.content.map((part) => part.text) : []))
    .join("");
  if (
    expectedTool === undefined
      ? calls.length !== 0 || !text.trim()
      : calls.length !== 1 || calls[0].name !== expectedTool
  )
    return null;
  for (const call of calls) {
    try {
      if (!jsonObject.safeParse(JSON.parse(call.arguments)).success) return null;
    } catch {
      return null;
    }
  }
  return {
    model,
    choices: [
      {
        finish_reason: expectedTool === undefined ? "stop" : "tool_calls",
        message: {
          role: "assistant",
          content: expectedTool === undefined ? text : null,
          ...(calls.length
            ? {
                tool_calls: calls.map((call) => ({
                  id: call.call_id,
                  type: "function",
                  function: { name: call.name, arguments: call.arguments },
                })),
              }
            : {}),
        },
      },
    ],
    ...(usage
      ? {
          usage: {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            prompt_tokens_details: usage.input_tokens_details,
            completion_tokens_details: usage.output_tokens_details,
          },
        }
      : {}),
  };
}

export const createLocalAiClient: typeof createAiClient = (workload, env, send, observe) => {
  const selected = env("WINESNAP_LOCAL_TEXT_PROVIDER");
  if (workload === "labelReading") return createAiClient(workload, env, send, observe);
  const configuredModel = env("WINESNAP_LOCAL_TEXT_MODEL");
  if (selected === undefined) {
    if (configuredModel !== undefined) throw new AiConfigurationError();
    return createAiClient(workload, env, send, observe);
  }
  if (
    env("WINESNAP_OWNED_BACKEND_ENABLED") !== "true" ||
    env("SUPABASE_URL") !== ownedBackendOrigin ||
    (selected !== "openai" && selected !== "gemini")
  )
    throw new AiConfigurationError();
  if (selected === "gemini") {
    if (configuredModel !== undefined) throw new AiConfigurationError();
    return createAiClient(workload, env, send, observe);
  }

  const key = env("OPENAI_API_KEY")?.trim();
  const model = OWNED_OPENAI_TEXT_MODELS.find(
    (id) => id === (configuredModel ?? OWNED_OPENAI_TEXT_MODELS[0]),
  );
  if (!key || /\s/.test(key) || !model) throw new AiConfigurationError();
  const request = send ?? fetch;
  return {
    model,
    complete(body, timeoutMs = 25_000) {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000)
        throw new Error("Invalid AI timeout");
      const payload = responsesRequest(body, model);
      const started = Date.now();
      const signal = AbortSignal.timeout(timeoutMs);
      const execute = async () => {
        const response = await request(endpoint, {
          method: "POST",
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) {
          await response.body?.cancel();
          return Response.json(
            { error: "AI provider unavailable" },
            {
              status: response.status >= 400 ? response.status : 502,
            },
          );
        }
        const result = completionBody(
          await readResponse(response),
          model,
          payload.tool_choice?.name,
        );
        signal.throwIfAborted();
        return result
          ? Response.json(result)
          : Response.json({ error: "Invalid or incomplete AI response" }, { status: 502 });
      };
      return observe
        ? observeAiCompletion(execute, { model, started, timeoutMs, attempts: () => 1 }, observe)
        : execute();
    },
  };
};
