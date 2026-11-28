import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { createMealPhotoHandler, createOwnedMealPhotoCompletion } from "./mealPhoto.server";

const url = "http://127.0.0.1:5212/api/ai/analyze-meal-photo";
const rgb = [14, 84, 24, 247, 240, 190];
const estimate = { items: [{ name: "Ris", confidence: "medium", portion: null }] };
const headers = {
  Authorization: "Bearer synthetic-owner",
  "Content-Type": "application/octet-stream",
  "X-Meal-Photo-Width": "2",
  "X-Meal-Photo-Height": "1",
};

function upload(overrides: Record<string, string> = {}, bytes: readonly number[] = rgb) {
  return new Request(url, {
    method: "POST",
    headers: { ...headers, ...overrides },
    body: new Uint8Array(bytes),
  });
}

function completion(value: unknown = estimate) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
}

function fixture() {
  const deps = {
    enabled: vi.fn(() => true),
    requireAccess: vi.fn<Parameters<typeof createMealPhotoHandler>[0]["requireAccess"]>(
      async () => ({ userId: "synthetic" }),
    ),
    complete: vi.fn<Parameters<typeof createMealPhotoHandler>[0]["complete"]>(async () =>
      completion(),
    ),
  };
  return { deps, handle: createMealPhotoHandler(deps) };
}

describe("owned meal photo analysis", () => {
  it("returns only a proposal and sends a metadata-free PNG after the owner quota check", async () => {
    const { deps, handle } = fixture();
    const response = await handle(upload({ "X-Meal-Photo-Language": "en" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual(estimate);
    expect(deps.requireAccess).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        functionName: "analyze-meal-photo",
        limit: 8,
      }),
    );
    expect(deps.requireAccess.mock.invocationCallOrder[0]).toBeLessThan(
      deps.complete.mock.invocationCallOrder[0],
    );
    const [input] = deps.complete.mock.calls[0];
    expect(input).toMatchObject({
      response_format: { json_schema: { name: "meal_photo_estimate", strict: true } },
    });
    expect(JSON.stringify(input)).not.toContain("synthetic-owner");
    expect(JSON.stringify(input)).toContain(
      "For cropped, partly hidden or unscaled portions use null",
    );
    const requestText = JSON.stringify(input);
    const image = requestText.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)"/)?.[1];
    expect(image).toBeDefined();
    const png = Buffer.from(image!, "base64");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const chunks: string[] = [];
    for (let offset = 8; offset < png.length;) {
      const size = png.readUInt32BE(offset);
      const type = png.toString("ascii", offset + 4, offset + 8);
      chunks.push(type);
      if (type === "IDAT")
        expect([...inflateSync(png.subarray(offset + 8, offset + 8 + size))]).toEqual([0, ...rgb]);
      offset += size + 12;
    }
    expect(chunks).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("does not accept uploads when disabled or without authentication", async () => {
    const { deps, handle } = fixture();
    expect((await handle(upload({ Authorization: "" }))).status).toBe(401);
    deps.enabled.mockReturnValue(false);
    expect((await handle(upload())).status).toBe(404);
    expect(deps.requireAccess).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("uses the owned Responses transport with storage disabled and a separate output contract", async () => {
    const send = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        model: "gpt-6.2-sol",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(estimate) }],
          },
        ],
      }),
    );
    const { deps } = fixture();
    const handle = createMealPhotoHandler({
      ...deps,
      complete: createOwnedMealPhotoCompletion("synthetic-only", "gpt-6.2-sol", send),
    });
    expect(await (await handle(upload())).json()).toEqual(estimate);
    expect(send).toHaveBeenCalledOnce();
    const [endpoint, request] = send.mock.calls[0];
    expect(endpoint).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      store: false,
      text: { format: { name: "meal_photo_estimate", type: "json_schema", strict: true } },
      input: [expect.anything(), { role: "user", content: [{ type: "input_image" }] }],
    });
  });

  it.each([401, 403, 429])("does not send a photo when access fails with %i", async (status) => {
    const { deps, handle } = fixture();
    deps.requireAccess.mockResolvedValue(
      Response.json(
        { private: "raw upstream detail" },
        {
          status,
          headers: status === 429 ? { "Retry-After": "10" } : {},
        },
      ),
    );
    const response = await handle(upload());
    expect(response.status).toBe(status);
    expect(response.headers.get("retry-after")).toBe(status === 429 ? "10" : null);
    expect(await response.json()).toEqual({ error: "meal_photo_access" });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it.each([
    [{ "Content-Type": "image/png" }, rgb, 415],
    [{ "Content-Encoding": "gzip" }, rgb, 415],
    [{ "Content-Length": "5" }, rgb, 400],
    [{ "X-Meal-Photo-Width": "1025" }, rgb, 400],
    [{ "X-Meal-Photo-Width": "2.0" }, rgb, 400],
    [{ "X-Meal-Photo-Language": "other" }, rgb, 400],
    [{}, rgb.slice(1), 400],
    [{}, [...rgb, 7], 400],
  ] as const)(
    "rejects invalid frames without forwarding them",
    async (badHeaders, bytes, status) => {
      const { deps, handle } = fixture();
      expect((await handle(upload(badHeaders, bytes))).status).toBe(status);
      expect(deps.complete).not.toHaveBeenCalled();
    },
  );

  it("cancels an interrupted upload without contacting the provider", async () => {
    const { deps, handle } = fixture();
    const cancel = vi.fn();
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const controller = new AbortController();
    const init = {
      method: "POST",
      headers,
      signal: controller.signal,
      duplex: "half",
      body: new ReadableStream<Uint8Array>(
        { pull: () => notifyStarted(), cancel },
        { highWaterMark: 0 },
      ),
    };
    const pending = handle(new Request(url, init));
    await started;
    controller.abort();
    expect((await pending).status).toBe(504);
    expect(cancel).toHaveBeenCalledOnce();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("rejects model-invented claims and does not relay upstream errors", async () => {
    const { deps, handle } = fixture();
    deps.complete.mockResolvedValueOnce(
      completion({ items: [{ ...estimate.items[0], safe: true }] }),
    );
    const invalid = await handle(upload());
    expect(invalid.status).toBe(502);
    expect(await invalid.json()).toEqual({ error: "meal_photo_invalid_estimate" });
    deps.complete.mockRejectedValueOnce(new Error("Sensitive private response"));
    const failed = await handle(upload());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "meal_photo_unavailable" });
  });
});
