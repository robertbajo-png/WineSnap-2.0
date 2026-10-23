import { AI_MODELS } from "./aiModels.ts";

type Workload = keyof typeof AI_MODELS;
type Environment = (name: string) => string | undefined;

export class AiConfigurationError extends Error {
  constructor() {
    super("AI provider is not configured");
    this.name = "AiConfigurationError";
  }
}

// Fixed destinations: neither callers nor environment variables can redirect keys.
const providers = {
  labelReading: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    key: "OPENAI_API_KEY",
    model: "OPENAI_LABEL_MODEL",
    prefix: "gpt-",
    timeout: 45_000,
  },
  fast: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: "GEMINI_API_KEY",
    model: "GEMINI_FAST_MODEL",
    prefix: "gemini-",
    timeout: 25_000,
  },
} as const;

export function createAiClient(workload: Workload, env: Environment, send: typeof fetch = fetch) {
  const provider = providers[workload];
  const key = env(provider.key)?.trim();
  const model = env(provider.model)?.trim() || AI_MODELS[workload];
  if (
    !key ||
    /\s/.test(key) ||
    !model.startsWith(provider.prefix) ||
    !/^[a-zA-Z0-9._-]{1,128}$/.test(model)
  ) {
    throw new AiConfigurationError();
  }

  return {
    model,
    complete(body: Record<string, unknown>, timeoutMs: number = provider.timeout) {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) {
        throw new Error("Invalid AI timeout");
      }
      // Preserve existing strict-schema/tool contracts, bound output and never retry
      // or silently change provider. OpenAI storage is explicitly disabled.
      const tokenField = workload === "labelReading" ? "max_completion_tokens" : "max_tokens";
      const budget = body[tokenField] ?? (workload === "labelReading" ? 8192 : 4096);
      if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1 || budget > 8192) {
        throw new Error("Invalid AI output budget");
      }
      const payload: Record<string, unknown> = {
        ...body,
        [tokenField]: budget,
        model,
        stream: false,
      };
      if (workload === "labelReading") {
        delete payload.max_tokens;
        Object.assign(payload, { store: false });
      } else {
        delete payload.max_completion_tokens;
      }
      return send(provider.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
    },
  };
}
