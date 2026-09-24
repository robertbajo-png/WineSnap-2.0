import { describe, expect, it } from "vitest";
import { isManagedWineImage, wineImageStoragePath } from "./wineImages";

describe("wine image storage paths", () => {
  it("extracts a path from legacy public and signed URLs", () => {
    expect(
      wineImageStoragePath(
        "https://example.supabase.co/storage/v1/object/public/wine-labels/user/a%20b.webp",
      ),
    ).toBe("user/a b.webp");
    expect(
      wineImageStoragePath(
        "https://example.supabase.co/storage/v1/object/sign/wine-labels/user/photo.jpg?token=x",
      ),
    ).toBe("user/photo.jpg");
  });

  it("accepts new storage paths and leaves external or local images alone", () => {
    expect(wineImageStoragePath("user/wine/photo.jpg")).toBe("user/wine/photo.jpg");
    expect(wineImageStoragePath("wine-labels/user/photo.jpg")).toBe("user/photo.jpg");
    expect(wineImageStoragePath("https://images.example.com/bottle.jpg")).toBeNull();
    expect(wineImageStoragePath("data:image/jpeg;base64,abc")).toBeNull();
    expect(wineImageStoragePath("blob:https://app.example/id")).toBeNull();
    expect(isManagedWineImage("user/photo.jpg")).toBe(true);
  });
});
