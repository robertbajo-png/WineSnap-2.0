// Workload defaults, reviewed against provider docs on 2026-10-05.
export const AI_MODELS = {
  // GPT-6.1 uses a JSON-schema response with low reasoning, not Chat Completions tools.
  // Project-specific gateway availability must be checked before deployment.
  labelReading: "openai/gpt-6.1-sol",
  fast: "google/gemini-3.8-flash",
} as const;
