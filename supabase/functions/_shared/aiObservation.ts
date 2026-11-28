import { AI_MODELS, OWNED_OPENAI_TEXT_MODELS } from "./aiModels.ts";

export type AiCallObservation = {
  selectedModel: string | null;
  returnedModel: string | null;
  providerStatus: number | null;
  outcome: "http_ok" | "http_error" | "timeout" | "cancelled" | "network_error";
  durationMs: number | null;
  attempts: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};
export type AiObserver = (value: AiCallObservation) => void;
const actions = [
  "analyze-wine",
  "ask-winesnap",
  "taste-suggestions",
  "wine-suggestions",
  "restaurant-match",
  "extract-preference-signals",
  "chef-chat",
  "chef-generate",
  "chef-adapt",
  "chef-extract",
] as const;
export type AiAction = (typeof actions)[number];
const outcomes: AiCallObservation["outcome"][] = [
  "http_ok",
  "http_error",
  "timeout",
  "cancelled",
  "network_error",
];
function count(value: unknown, max = 1_000_000_000) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}
function publicModel(value: unknown) {
  if (typeof value !== "string") return null;
  for (const model of [...Object.values(AI_MODELS), ...OWNED_OPENAI_TEXT_MODELS]) {
    if (value === model) return model;
    if (
      value.startsWith(model + "-") &&
      /^(?:\d{3}|\d{4}-\d{2}-\d{2})$/.test(value.slice(model.length + 1))
    )
      return value;
  }
  return null;
}
export function safeAiObservation(value: AiCallObservation): AiCallObservation {
  return Object.freeze({
    selectedModel: publicModel(value.selectedModel),
    returnedModel: publicModel(value.returnedModel),
    providerStatus:
      typeof value.providerStatus === "number" &&
      value.providerStatus >= 200 &&
      value.providerStatus <= 599
        ? count(value.providerStatus, 599)
        : null,
    outcome: outcomes.includes(value.outcome) ? value.outcome : "network_error",
    durationMs: count(value.durationMs, 3_600_000),
    attempts:
      typeof value.attempts === "number" && value.attempts > 0 ? count(value.attempts, 3) : null,
    inputTokens: count(value.inputTokens),
    outputTokens: count(value.outputTokens),
  });
}

// This bounded clone is discarded in memory. The original response remains unread.
async function responseUsage(response: Response, budgetMs: number) {
  if (!response.ok || budgetMs <= 0) return null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = response.clone().body?.getReader();
  } catch {
    return null;
  }
  if (!reader) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (!stopped) {
      const part = await reader!.read();
      if (part.done) {
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        try {
          return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
        } finally {
          bytes.fill(0);
        }
      }
      size += part.value.byteLength;
      if (size > 100_000) return null;
      chunks.push(part.value);
    }
    return null;
  };
  try {
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), Math.min(500, budgetMs));
      }),
    ]);
  } catch {
    return null;
  } finally {
    stopped = true;
    clearTimeout(timer);
    // A tee's cancellation may wait for its other branch; never await it here.
    void reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      /* A pending read is being cancelled. */
    }
  }
}

export async function observeAiCompletion(
  execute: () => Promise<Response>,
  options: { model: string; started: number; timeoutMs: number; attempts: () => number },
  observe: AiObserver,
) {
  const publish = (values: Partial<AiCallObservation>) => {
    const sample = safeAiObservation({
      selectedModel: options.model,
      returnedModel: null,
      providerStatus: null,
      outcome: "network_error",
      durationMs: Date.now() - options.started,
      attempts: options.attempts(),
      inputTokens: null,
      outputTokens: null,
      ...values,
    });
    try {
      observe(sample);
    } catch {
      /* Measurement must not change the AI operation. */
    }
  };
  let response: Response;
  try {
    response = await execute();
  } catch (error) {
    publish({
      outcome:
        error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : error instanceof Error && error.name === "AbortError"
            ? "cancelled"
            : "network_error",
    });
    throw error;
  }
  const data = await responseUsage(response, options.timeoutMs - (Date.now() - options.started));
  const usage =
    data?.usage && typeof data.usage === "object" ? (data.usage as Record<string, unknown>) : null;
  publish({
    returnedModel: publicModel(data?.model),
    providerStatus: response.status,
    outcome: response.ok ? "http_ok" : "http_error",
    inputTokens: count(usage?.prompt_tokens),
    outputTokens: count(usage?.completion_tokens),
  });
  return response;
}

// Only fixed metadata, no raw provider error, prompt, photo, owner or memory fields.
export function aiObservationHeaders(
  action: AiAction,
  value: AiCallObservation | undefined,
  routeStatus: number,
): Record<string, string> {
  if (!value || !actions.includes(action) || count(routeStatus, 599) === null || routeStatus < 200)
    return {};
  return {
    "X-WineSnap-AI-Metrics": JSON.stringify({ action, ...safeAiObservation(value), routeStatus }),
  };
}
