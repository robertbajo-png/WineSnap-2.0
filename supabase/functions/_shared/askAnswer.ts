export function completedAskAnswer(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("choices" in payload)) {
    throw new Error("AI returned an invalid answer");
  }
  const choices = payload.choices;
  const choice = Array.isArray(choices) ? choices[0] : undefined;
  if (choice?.finish_reason === "length") {
    throw new Error("AI answer exceeded its output budget");
  }
  const answer = choice?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("AI returned an empty answer");
  }
  return answer.trim();
}
