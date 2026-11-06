import { describe, expect, it, vi } from "vitest";
import {
  createTerraEvaluationFactory,
  terraCompletion,
  terraModel,
  terraRequest,
} from "../../scripts/lib/terra-evaluation-client";

describe("isolated Terra evaluation transport", () => {
  it("pins the exact model, disables storage, and preserves image and JSON contracts", () => {
    const result = terraRequest({
      model: "do-not-use",
      messages: [
        { role: "system", content: "Read only the label." },
        {
          role: "user",
          content: [
            { type: "text", text: "Read" },
            { type: "image_url", image_url: { url: "data:image/png;base64,synthetic" } },
          ],
        },
      ],
      max_completion_tokens: 8192,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: { name: "wine", strict: true, schema: { type: "object" } },
      },
    });
    expect(result).toMatchObject({
      model: terraModel,
      store: false,
      stream: false,
      max_output_tokens: 8192,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "wine", strict: true } },
    });
    expect(result.input[1].content).toEqual([
      { type: "input_text", text: "Read" },
      { type: "input_image", image_url: "data:image/png;base64,synthetic", detail: "auto" },
    ]);
  });
  it("converts forced functions without silently imposing strict optional-field semantics", () => {
    const result = terraRequest({
      messages: [{ role: "user", content: "Recommend" }],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_wines",
            description: "Candidate IDs",
            parameters: { type: "object" },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "suggest_wines" } },
    });
    expect(result.tools).toEqual([
      {
        type: "function",
        name: "suggest_wines",
        description: "Candidate IDs",
        parameters: { type: "object" },
        strict: false,
      },
    ]);
    expect(result.tool_choice).toEqual({ type: "function", name: "suggest_wines" });
    expect(result.parallel_tool_calls).toBe(false);
  });
  it("normalizes real Responses output for the existing handler validators", () => {
    const result = terraCompletion({
      status: "completed",
      model: terraModel,
      output: [
        { type: "reasoning" },
        { type: "message", content: [{ type: "output_text", text: '{"answer":"ok"}' }] },
        {
          type: "function_call",
          call_id: "synthetic-call",
          name: "extract",
          arguments: '{"signals":[]}',
        },
      ],
      usage: { input_tokens: 30, output_tokens: 20, total_tokens: 50 },
    });
    expect(result.choices[0]).toMatchObject({
      finish_reason: "stop",
      message: {
        content: '{"answer":"ok"}',
        tool_calls: [{ function: { name: "extract", arguments: '{"signals":[]}' } }],
      },
    });
    expect(result.usage).toEqual({ prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 });
    expect(terraCompletion({ status: "incomplete", output: [] }).choices[0].finish_reason).toBe(
      "length",
    );
  });
  it("never reroutes or retries, and does not expose provider errors or credentials in reports", async () => {
    const sample = vi.fn(),
      send = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(
          { error: { code: "model_not_found", message: "private-error-canary" } },
          { status: 404 },
        ),
      );
    const ai = createTerraEvaluationFactory(
      "sk-" + "x".repeat(30),
      sample,
      send,
    )("fast", () => undefined);
    const r = await ai.complete({ messages: [{ role: "user", content: "Synthetic" }] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(await r.text()).not.toContain("private-error-canary");
    expect(JSON.stringify(sample.mock.calls)).not.toContain("sk-");
    expect(sample).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, code: "model_not_found", kind: "text" }),
    );
  });
  it.each([0, 8193, 1.5])("rejects an invalid output budget %s", (budget) => {
    expect(() => terraRequest({ messages: [], max_tokens: budget })).toThrow();
  });
});
