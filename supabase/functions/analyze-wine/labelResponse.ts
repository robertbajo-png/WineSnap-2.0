type LabelReading = {
  label_text: string;
  identity: Record<string, unknown>;
  taste: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function completedLabelReading(payload: unknown): LabelReading {
  const choice = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new Error("AI returned an invalid label response");
  }
  if (choice.message.refusal || choice.finish_reason === "content_filter") {
    throw new Error("AI could not process this label. Please try another photo.");
  }
  if (choice.finish_reason !== "stop") {
    throw new Error("AI returned an incomplete label reading. Please try again.");
  }
  const content = choice.message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty label reading");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid label JSON");
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.label_text !== "string" ||
    !isRecord(parsed.identity) ||
    !isRecord(parsed.taste)
  ) {
    throw new Error("AI returned an invalid label reading");
  }
  return { label_text: parsed.label_text, identity: parsed.identity, taste: parsed.taste };
}
