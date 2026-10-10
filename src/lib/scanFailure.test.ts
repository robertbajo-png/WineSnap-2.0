import { describe, expect, it } from "vitest";
import { scanFailure } from "./scanFailure";

const httpError = (status: number, body: unknown) => ({
  context: new Response(JSON.stringify(body), { status }),
});

describe("safe scan failures", () => {
  it("distinguishes platform auth from application auth without returning raw details", async () => {
    expect(
      await scanFailure(
        httpError(401, { code: "UNAUTHORIZED_INVALID_JWT", msg: "private detail" }),
      ),
    ).toEqual({ key: "scan.error.auth", status: 401, category: "platform_authentication" });
    expect(await scanFailure(httpError(401, { error: "Unauthorized" }))).toEqual({
      key: "scan.error.auth",
      status: 401,
      category: "authentication",
    });
  });

  it("handles Supabase Invalid JWT responses", async () => {
    expect((await scanFailure(httpError(401, { msg: "Invalid JWT" }))).category).toBe(
      "platform_authentication",
    );
  });

  it.each([402, 500, 502, 503, 504])("shows unavailable for HTTP %s", async (status) => {
    expect((await scanFailure(httpError(status, {}))).key).toBe("scan.error.unavailable");
  });

  it("identifies quota and configuration failures", async () => {
    expect((await scanFailure(httpError(429, { error: "Too many requests" }))).category).toBe(
      "quota",
    );
    expect(
      (await scanFailure(httpError(500, { error: "Server configuration error" }))).category,
    ).toBe("configuration");
  });

  it("returns only an upstream status, never gateway payloads or request credentials", async () => {
    const error = httpError(500, {
      error: "AI gateway: 400",
      token: "secret",
      imageBase64: "private",
    });
    expect(await scanFailure(error)).toEqual({
      key: "scan.error.unavailable",
      status: 500,
      category: "gateway",
      upstreamStatus: 400,
    });
    expect(await error.context.json()).toHaveProperty("token", "secret");
  });

  it("does not expose malformed responses or arbitrary exception messages", async () => {
    expect(await scanFailure({ context: new Response("private HTML", { status: 502 }) })).toEqual({
      key: "scan.error.unavailable",
      status: 502,
      category: "unknown",
    });
    expect(await scanFailure(new Error("internal secret"))).toEqual({
      key: "scan.error.generic",
      status: null,
      category: "unknown",
    });
  });
});
