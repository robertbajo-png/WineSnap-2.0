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

function waitForRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function sendGeminiWithRetry(
  send: typeof fetch,
  endpoint: string,
  init: RequestInit,
  budget: number,
) {
  const started = Date.now();
  const signal = init.signal!;
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await send(endpoint, init);
    if (response.status !== 503 || attempt === 2) return response;
    const hint = response.headers.get("retry-after");
    const retryAfter =
      hint === null
        ? 0
        : /^\d+(?:\.\d+)?$/.test(hint)
          ? Number(hint) * 1000
          : Math.max(0, Date.parse(hint) - Date.now());
    const delay = Math.max(
      1000 * 2 ** attempt + Math.floor(Math.random() * 250),
      Number.isFinite(retryAfter) ? retryAfter : 0,
    );
    // Never extend the original deadline, retry another provider, or replay a successful answer.
    if (Date.now() - started + delay >= budget) return response;
    await response.body?.cancel();
    await waitForRetry(delay, signal);
  }
}

export function createAiClient(workload: Workload, env: Environment, send: typeof fetch = fetch) {
  const provider = providers[workload];
  const key = env(provider.key)?.trim();
  const model = env(provider.model)?.trim() || AI_MODELS[workload];
  const retryGemini = workload === "fast" && env("GEMINI_TRANSIENT_RETRY_ENABLED") === "true";
  const retryBackendAllowed =
    env("WINESNAP_OWNED_BACKEND_ENABLED") === "true"
      ? env("SUPABASE_URL") === "http://winesnap-owned-gateway:8080"
      : env("SUPABASE_URL") === "https://pzniyupmgwvlldvztzqh.supabase.co";
  if (
    !key ||
    /\s/.test(key) ||
    !model.startsWith(provider.prefix) ||
    !/^[a-zA-Z0-9._-]{1,128}$/.test(model) ||
    (retryGemini && !retryBackendAllowed)
  ) {
    throw new AiConfigurationError();
  }

  return {
    model,
    complete(body: Record<string, unknown>, timeoutMs: number = provider.timeout) {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) {
        throw new Error("Invalid AI timeout");
      }
      // Preserve schema/tool contracts. Retry is an explicit isolated-runtime opt-in.
      // OpenAI storage is disabled and its calls are never retried or rerouted.
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
      const init: RequestInit = {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        cache: "no-store",
        body: JSON.stringify(payload),
      };
      return retryGemini
        ? sendGeminiWithRetry(send, provider.endpoint, init, timeoutMs)
        : send(provider.endpoint, init);
    },
  };
}
