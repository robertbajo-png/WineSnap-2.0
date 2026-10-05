// Gateway-compatible workload defaults, reviewed against provider docs on 2026-10-05.
export const AI_MODELS = {
  // GPT-6 Sol supports forced tools on Chat Completions only with reasoning_effort: "none".
  // GPT-6.1 Sol and GPT-6 Astra require Responses for tools; do not swap IDs alone.
  labelReading: "openai/gpt-6-sol",
  fast: "google/gemini-3.8-flash",
} as const;
