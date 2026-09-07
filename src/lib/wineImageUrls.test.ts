import { afterAll, expect, mock, spyOn, test } from "bun:test";

const download = mock(async () => ({ data: new Blob(["image"]), error: null }));
mock.module("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ download }) } },
}));
const { createWineLabelUrl } = await import("./wineImageUrls");
const revoke = spyOn(URL, "revokeObjectURL");
afterAll(() => {
  revoke.mockRestore();
  mock.restore();
});

test("downloads with no-store and releases the local object URL", async () => {
  const controller = new AbortController();
  const result = await createWineLabelUrl("owner/label.png", controller.signal);
  expect(download).toHaveBeenLastCalledWith(
    "owner/label.png",
    {},
    {
      cache: "no-store",
      signal: controller.signal,
    },
  );
  expect(result?.url.startsWith("blob:")).toBe(true);
  result?.release();
  expect(revoke).toHaveBeenCalledWith(result?.url);
});

test("does not reuse a previous download across requests", async () => {
  const before = download.mock.calls.length;
  const first = await createWineLabelUrl("owner/label.png");
  const second = await createWineLabelUrl("owner/label.png");
  expect(download.mock.calls.length - before).toBe(2);
  expect(first?.url).not.toBe(second?.url);
  first?.release();
  second?.release();
});

test("aborted download does not expose an object URL", async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await createWineLabelUrl("owner/label.png", controller.signal)).toBeNull();
});

test("external image and empty values do not hit Storage", async () => {
  const before = download.mock.calls.length;
  expect((await createWineLabelUrl("https://example.test/photo.png"))?.url).toBe(
    "https://example.test/photo.png",
  );
  expect(await createWineLabelUrl(null)).toBeNull();
  expect(download.mock.calls.length).toBe(before);
});
