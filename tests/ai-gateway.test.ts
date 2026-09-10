import { afterEach, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fetchLovable, parseAiTool } from "../supabase/functions/_shared/ai.ts";

const original = globalThis.fetch;
test("wine extraction retains Terra forced-tool compatibility", () => {
  const source = readFileSync(
    new URL("../supabase/functions/analyze-wine/index.ts", import.meta.url),
    "utf8",
  );
  expect(source).toMatch(
    /model:\s*"openai\/gpt-5\.6-terra",\s*(?:\/\/[^\n]*\n\s*)?reasoning_effort:\s*"none"/,
  );
});
afterEach(() => {
  globalThis.fetch = original;
});
const result = (name = "suggest_wines", args = '{"suggestions":[]}') =>
  Response.json({
    choices: [{ message: { tool_calls: [{ function: { name, arguments: args } }] } }],
  });
const schema = { parse: (value: unknown) => value };

test("accepts expected structured tool output", async () => {
  expect(await parseAiTool(result(), "suggest_wines", schema)).toEqual({ suggestions: [] });
});
test("missing, incorrect and malformed tools fail as upstream errors", async () => {
  for (const response of [
    Response.json({}),
    result("wrong"),
    result("suggest_wines", "bad json"),
    new Response("not JSON"),
  ]) {
    await expect(parseAiTool(response, "suggest_wines", schema)).rejects.toMatchObject({
      status: 502,
    });
  }
});
test("schema failures are not classified as bad user input", async () => {
  await expect(
    parseAiTool(result(), "suggest_wines", {
      parse() {
        throw new Error("private payload");
      },
    }),
  ).rejects.toMatchObject({ status: 502 });
});
test("truncated answers are rejected", async () => {
  const body = await result().json();
  body.choices[0].finish_reason = "length";
  await expect(parseAiTool(Response.json(body), "suggest_wines", schema)).rejects.toMatchObject({
    status: 502,
  });
});
test("preserves credit and rate-limit statuses without retrying", async () => {
  for (const status of [402, 429]) {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status }));
    expect((await fetchLovable({ method: "POST" })).status).toBe(status);
    expect(request).toHaveBeenCalledTimes(1);
    request.mockRestore();
  }
});
test("network and upstream server failures are sanitized", async () => {
  const request = spyOn(globalThis, "fetch").mockRejectedValue(new Error("secret"));
  await expect(fetchLovable({})).rejects.toMatchObject({
    status: 502,
    message: "AI service unavailable",
  });
  request.mockResolvedValue(new Response("secret", { status: 500 }));
  await expect(fetchLovable({})).rejects.toMatchObject({ status: 502 });
  request.mockRestore();
});
test("deadline aborts a stalled request", async () => {
  const request = spyOn(globalThis, "fetch").mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
  );
  await expect(fetchLovable({}, 10)).rejects.toMatchObject({ status: 504 });
  request.mockRestore();
});
test("deadline remains active while reading the body", async () => {
  const request = spyOn(globalThis, "fetch").mockImplementation(
    async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), {
              once: true,
            });
          },
        }),
      ),
  );
  await expect(fetchLovable({}, 10)).rejects.toMatchObject({ status: 504 });
  request.mockRestore();
});
