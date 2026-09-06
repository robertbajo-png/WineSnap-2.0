import { describe, expect, test } from "bun:test";
import { getWineLabelPath } from "./wineImages";

describe("getWineLabelPath", () => {
  test("keeps a private storage path", () => {
    expect(getWineLabelPath("user-id/label.webp")).toBe("user-id/label.webp");
  });

  test("extracts and decodes a legacy public URL", () => {
    expect(
      getWineLabelPath(
        "https://example.supabase.co/storage/v1/object/public/wine-labels/user-id/My%20Wine.webp",
      ),
    ).toBe("user-id/My Wine.webp");
  });

  test("does not treat an external image as a storage object", () => {
    expect(getWineLabelPath("https://images.example.com/wine.jpg")).toBeNull();
  });

  test("handles empty values", () => {
    expect(getWineLabelPath(null)).toBeNull();
  });
});
