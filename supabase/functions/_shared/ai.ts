import { HttpError } from "./http.ts";

// Keep credentials server-side and do not retry billable requests automatically.
export async function fetchLovable(init: RequestInit, timeoutMs = 45_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      ...init,
      signal: controller.signal,
    });
    // Keep the deadline active while the response body is being downloaded.
    const body = await response.text();
    if (controller.signal.aborted) throw new HttpError(504, "AI request timed out");
    if (!response.ok && response.status !== 402 && response.status !== 429) {
      throw new HttpError(502, "AI service could not complete the request");
    }
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (controller.signal.aborted) throw new HttpError(504, "AI request timed out");
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "AI service unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export async function parseAiTool<T>(
  response: Response,
  name: string,
  schema: { parse(value: unknown): T },
): Promise<T> {
  try {
    const body = await response.json();
    const choice = body?.choices?.[0];
    const calls = choice?.message?.tool_calls;
    if (
      choice?.finish_reason === "length" ||
      choice?.finish_reason === "content_filter" ||
      !Array.isArray(calls) ||
      calls.length !== 1 ||
      calls[0]?.function?.name !== name ||
      typeof calls[0]?.function?.arguments !== "string"
    )
      throw new Error("Invalid tool response");
    return schema.parse(JSON.parse(calls[0].function.arguments));
  } catch {
    // Never report upstream schema errors as invalid user input or log AI payloads.
    throw new HttpError(502, "AI returned an invalid response. Please try again.");
  }
}
