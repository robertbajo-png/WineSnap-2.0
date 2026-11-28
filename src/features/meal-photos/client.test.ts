import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const token = vi.hoisted(() => vi.fn());
vi.mock("@/lib/accountWriteScope", () => ({ accountAccessToken: token }));
import {
  analyzeMealPhoto,
  mealPhotoFrameSize,
  prepareMealPhoto,
  type PreparedMealPhoto,
} from "./client";

const source: PreparedMealPhoto = {
  width: 2,
  height: 1,
  pixels: new Uint8Array([13, 42, 173, 52, 94, 77]),
  preview: new Blob(["synthetic local preview"], { type: "image/jpeg" }),
};
const estimate = { items: [{ name: "Ris", confidence: "medium", portion: null }] };

beforeEach(() => token.mockReset().mockResolvedValue("synthetic-scoped-token"));
afterEach(() => vi.unstubAllGlobals());

describe("meal photo preparation", () => {
  it("bounds frames while preserving landscape, portrait and small dimensions", () => {
    expect(mealPhotoFrameSize(4032, 3024)).toEqual([1024, 768]);
    expect(mealPhotoFrameSize(3024, 4032)).toEqual([768, 1024]);
    expect(mealPhotoFrameSize(226, 84)).toEqual([226, 84]);
    expect(() => mealPhotoFrameSize(0, 500)).toThrow();
    expect(() => mealPhotoFrameSize(10000, 10000)).toThrow();
  });

  it("rejects unsupported files before decoding", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);
    await expect(
      prepareMealPhoto(
        new File(["synthetic"], "fake.gif", { type: "image/gif" }),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "format" });
    expect(decoder).not.toHaveBeenCalled();
  });

  it("flattens the decoded frame to RGB, creates a new preview, and releases the bitmap", async () => {
    const close = vi.fn();
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const bitmap = { width: 2, height: 1, close };
    const canvas = {
      width: 2,
      height: 1,
      getContext: vi.fn(() => ({
        fillRect,
        drawImage,
        getImageData: () => ({ data: new Uint8ClampedArray([13, 42, 173, 255, 52, 94, 77, 255]) }),
      })),
      toBlob: vi.fn((done: (blob: Blob) => void) => done(source.preview)),
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("document", { createElement: () => canvas });
    const file = new File(["synthetic original"], "not-transmitted.png", { type: "image/png" });
    const result = await prepareMealPhoto(file, new AbortController().signal);
    expect(result).toEqual(source);
    expect(result.preview).not.toBe(file);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 2, 1);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2, 1);
    expect(close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it("releases a decoded image returned after cancellation without building a preview", async () => {
    const close = vi.fn();
    const getContext = vi.fn();
    const controller = new AbortController();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        controller.abort();
        return { width: 2, height: 1, close };
      }),
    );
    vi.stubGlobal("document", { createElement: () => ({ getContext }) });
    await expect(
      prepareMealPhoto(
        new File(["synthetic"], "meal.png", { type: "image/png" }),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(close).toHaveBeenCalledOnce();
    expect(getContext).not.toHaveBeenCalled();
  });
});

describe("owned meal photo client", () => {
  const activeScope = () => ({ owner: "synthetic-owner", current: () => true });

  it("sends only normalized pixels to the local path with a verified owner token", async () => {
    const send = vi.fn().mockResolvedValue(Response.json(estimate));
    vi.stubGlobal("fetch", send);
    const scope = activeScope();
    expect(await analyzeMealPhoto(source, scope, new AbortController().signal)).toEqual(estimate);
    expect(token).toHaveBeenCalledWith(scope, 10_000, expect.any(AbortSignal));
    expect(send).toHaveBeenCalledExactlyOnceWith("/api/ai/analyze-meal-photo", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-scoped-token",
        "Content-Type": "application/octet-stream",
        "X-Meal-Photo-Width": "2",
        "X-Meal-Photo-Height": "1",
      },
      body: source.pixels,
      signal: expect.any(AbortSignal),
      cache: "no-store",
      redirect: "error",
    });
  });

  it("never uploads after the owner changes while verifying the token", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    let current = true;
    token.mockImplementationOnce(async () => {
      current = false;
      return "synthetic-stale-token";
    });
    await expect(
      analyzeMealPhoto(
        source,
        { owner: "first", current: () => current },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "auth" });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not expose an estimate when the attempt is interrupted during the reply", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        return Response.json(estimate);
      }),
    );
    await expect(analyzeMealPhoto(source, activeScope(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("rejects a malformed estimate and maps a redacted quota error without retrying", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...estimate, photo: "private-canary" }))
      .mockResolvedValueOnce(Response.json({ private: "upstream-canary" }, { status: 429 }));
    vi.stubGlobal("fetch", send);
    await expect(
      analyzeMealPhoto(source, activeScope(), new AbortController().signal),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      analyzeMealPhoto(source, activeScope(), new AbortController().signal),
    ).rejects.toMatchObject({ code: "quota" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
