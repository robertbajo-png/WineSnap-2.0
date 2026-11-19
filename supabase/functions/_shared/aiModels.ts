// Direct provider IDs, reviewed against official API docs on 2026-10-23.
export const AI_MODELS = {
  // GPT-6.1 uses a JSON-schema response with low reasoning, not Chat Completions tools.
  // Account availability and real responses still require staging acceptance.
  labelReading: "gpt-6.1-sol",
  fast: "gemini-3.8-flash",
} as const;
