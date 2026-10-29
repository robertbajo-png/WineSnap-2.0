import { beforeEach, describe, expect, it, vi } from "vitest";

const { download, imageFetch, getSession } = vi.hoisted(() => ({
  download: vi.fn(),
  imageFetch: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ download }) },
    auth: { getSession },
  },
}));
import { downloadWineImage } from "./wineImageUrls";

describe("authenticated wine image downloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "false");
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.example.invalid");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
    vi.stubGlobal("fetch", imageFetch);
    download.mockReset();
    imageFetch.mockReset();
    getSession.mockReset();
  });

  it("downloads without browser caching and releases the local blob URL", async () => {
    const blob = new Blob(["image"]);
    const controller = new AbortController();
    download.mockResolvedValue({ data: blob, error: null });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-image");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const result = await downloadWineImage("owner/photo.jpg", controller.signal);
    expect(download).toHaveBeenCalledWith(
      "owner/photo.jpg",
      { cacheNonce: expect.any(String) },
      {
        cache: "no-store",
        signal: controller.signal,
      },
    );
    expect(result?.url).toBe("blob:private-image");
    result?.release();
    expect(revoke).toHaveBeenCalledWith("blob:private-image");
  });

  it("does not expose denied or aborted reads", async () => {
    download.mockResolvedValue({ data: null, error: new Error("Denied") });
    expect(await downloadWineImage("private.jpg", new AbortController().signal)).toBeNull();
    const controller = new AbortController();
    controller.abort();
    download.mockResolvedValue({ data: new Blob(["image"]), error: null });
    expect(await downloadWineImage("private.jpg", controller.signal)).toBeNull();
  });

  it("uses a new cache nonce even when reading the same image twice", async () => {
    download.mockResolvedValue({ data: new Blob(["image"]), error: null });
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const controller = new AbortController();
    const first = await downloadWineImage("owner/photo.jpg", controller.signal);
    const second = await downloadWineImage("owner/photo.jpg", controller.signal);

    expect(download.mock.calls.map(([, options]) => options.cacheNonce)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(download.mock.calls.every(([, , options]) => options.cache === "no-store")).toBe(true);
    first?.release();
    second?.release();
  });

  it("uses the verified server image path when explicitly enabled", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({
      data: { session: { access_token: "synthetic-user-token" } },
      error: null,
    });
    imageFetch.mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:server-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const signal = new AbortController().signal;
    const image = await downloadWineImage("owner/photo.jpg", signal);
    expect(imageFetch).toHaveBeenCalledWith(
      new URL("https://test.example.invalid/functions/v1/wine-image"),
      {
        method: "POST",
        body: JSON.stringify({ path: "owner/photo.jpg" }),
        signal,
        cache: "no-store",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          apikey: "sb_publishable_synthetic",
          Authorization: "Bearer synthetic-user-token",
        },
      },
    );
    expect(download).not.toHaveBeenCalled();
    image?.release();
  });

  it("sends no user JWT for an anonymous share", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    imageFetch.mockResolvedValue(new Response("Denied", { status: 403 }));
    expect(await downloadWineImage("owner/photo.jpg", new AbortController().signal)).toBeNull();
    expect(imageFetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(download).not.toHaveBeenCalled();
  });

  it("uses only the same-origin proxy for an owned local build", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    vi.stubEnv("VITE_OWNED_BACKEND_ENABLED", "true");
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5212" } });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    imageFetch.mockResolvedValue(new Response("Denied", { status: 404 }));
    expect(await downloadWineImage("owner/photo.jpg", new AbortController().signal)).toBeNull();
    expect(imageFetch.mock.calls[0][0].href).toBe("http://127.0.0.1:5212/api/wine-image");
    expect(imageFetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(download).not.toHaveBeenCalled();
  });

  it("never falls back to direct Storage when the proxy is unavailable or returns JSON", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    imageFetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect(await downloadWineImage("owner/photo.jpg", new AbortController().signal)).toBeNull();
    imageFetch.mockResolvedValue(
      new Response(JSON.stringify({ url: "unsafe-direct-link" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await downloadWineImage("owner/photo.jpg", new AbortController().signal)).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it("does not request the image when the session cannot be read", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({ data: { session: null }, error: new Error("Session changed") });
    expect(await downloadWineImage("owner/photo.jpg", new AbortController().signal)).toBeNull();
    expect(imageFetch).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("preserves real JPEG bytes instead of decoding them as text", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const bytes = new Uint8Array([255, 216, 255, 224, 0, 128, 254, 217]);
    imageFetch.mockResolvedValue(
      new Response(bytes, { headers: { "Content-Type": "image/jpeg" } }),
    );
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:jpeg-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const image = await downloadWineImage("owner/photo.jpg", new AbortController().signal);
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    image?.release();
  });

  it("rejects active content, empty images and oversized responses without Storage fallback", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const create = vi.spyOn(URL, "createObjectURL");
    for (const response of [
      new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
      new Response("<html/>", { headers: { "Content-Type": "text/html" } }),
      new Response(null, { headers: { "Content-Type": "image/png" } }),
      new Response("image", {
        headers: { "Content-Type": "image/png", "Content-Length": "10485761" },
      }),
      new Response(new Uint8Array(10485761), { headers: { "Content-Type": "image/png" } }),
    ]) {
      imageFetch.mockResolvedValue(response);
      expect(await downloadWineImage("owner/photo.jpg", new AbortController().signal)).toBeNull();
    }
    expect(create).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("does not create an image after cancellation or fall back after network failure", async () => {
    vi.stubEnv("VITE_WINE_IMAGE_PROXY_ENABLED", "true");
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const controller = new AbortController();
    imageFetch.mockImplementation(async () => {
      controller.abort();
      return new Response("image", { headers: { "Content-Type": "image/png" } });
    });
    const create = vi.spyOn(URL, "createObjectURL");
    expect(await downloadWineImage("owner/photo.jpg", controller.signal)).toBeNull();
    imageFetch.mockRejectedValue(new Error("network failure"));
    await expect(
      downloadWineImage("owner/photo.jpg", new AbortController().signal),
    ).rejects.toThrow("network failure");
    expect(create).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
