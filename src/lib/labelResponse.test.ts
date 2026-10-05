import { describe, expect, it } from "vitest";
import { completedLabelReading } from "../../supabase/functions/analyze-wine/labelResponse";

const reading = { label_text: "ZEHN MORGEN 2023", identity: {}, taste: {} };
const response = (
  content: unknown = JSON.stringify(reading),
  finishReason: unknown = "stop",
  refusal?: string,
) => ({
  choices: [{ finish_reason: finishReason, message: { content, refusal } }],
});

describe("Completed structured label readings", () => {
  it("parses the new JSON response into the existing client contract", () => {
    expect(completedLabelReading(response())).toEqual(reading);
  });

  it("accepts an unreadable image with an empty transcription", () => {
    const empty = { label_text: "", identity: {}, taste: {} };
    expect(completedLabelReading(response(JSON.stringify(empty)))).toEqual(empty);
  });

  it.each([null, {}, { choices: [] }, { choices: [{ finish_reason: "stop" }] }])(
    "rejects invalid envelopes: %j",
    (payload) => {
      expect(() => completedLabelReading(payload)).toThrow("AI returned an invalid label response");
    },
  );

  it.each(["length", "tool_calls", "error", null, undefined])(
    "rejects incomplete or unexpected finish reason %s",
    (finishReason) => {
      const payload = response();
      payload.choices[0].finish_reason = finishReason;
      expect(() => completedLabelReading(payload)).toThrow(
        "AI returned an incomplete label reading",
      );
    },
  );

  it("rejects refusals even when the answer contains JSON", () => {
    expect(() =>
      completedLabelReading(
        response(JSON.stringify(reading), "stop", "Cannot process this image."),
      ),
    ).toThrow("AI could not process this label");
  });

  it("rejects filtered completions", () => {
    expect(() =>
      completedLabelReading(response(JSON.stringify(reading), "content_filter")),
    ).toThrow("AI could not process this label");
  });

  it.each([null, "", "   ", 12, {}])("rejects empty or non-text content: %j", (content) => {
    expect(() => completedLabelReading(response(content))).toThrow(
      "AI returned an empty label reading",
    );
  });

  it.each(["A white wine", '{"label_text":', "```json\n{}\n```"])(
    "rejects invalid JSON: %s",
    (content) => {
      expect(() => completedLabelReading(response(content))).toThrow(
        "AI returned invalid label JSON",
      );
    },
  );

  it.each([
    null,
    [],
    {},
    { ...reading, label_text: 2023 },
    { ...reading, identity: null },
    { ...reading, identity: [] },
    { ...reading, taste: "fresh" },
  ])("rejects invalid root blocks: %j", (payload) => {
    expect(() => completedLabelReading(response(JSON.stringify(payload)))).toThrow(
      "AI returned an invalid label reading",
    );
  });
});
