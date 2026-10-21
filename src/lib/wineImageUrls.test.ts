import { beforeEach, describe, expect, it, vi } from "vitest";

const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ download }) } },
}));
import { downloadWineImage } from "./wineImageUrls";

describe("authenticated wine image downloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    download.mockReset();
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
});
