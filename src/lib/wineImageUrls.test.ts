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
});
