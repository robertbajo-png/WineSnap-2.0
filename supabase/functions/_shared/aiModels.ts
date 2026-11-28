// Direct provider IDs, reviewed against official API docs on 2026-10-23.
export const AI_MODELS = {
  // GPT-6.1 uses a JSON-schema response with low reasoning, not Chat Completions tools.
  // Account availability and real responses still require staging acceptance.
  labelReading: "gpt-6.1-sol",
  fast: "gemini-3.8-flash",
} as const;

// Only used by the owned Windows Responses adapter, not an Edge workload.
export const OWNED_OPENAI_TEXT_MODELS = ["gpt-6-luna", "gpt-6.2-sol"] as const;
