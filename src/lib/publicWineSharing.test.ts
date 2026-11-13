import { describe, expect, it } from "vitest";
import { publicWineSharingAllowed } from "./publicWineSharing";

describe("public wine sharing availability, not an authorization boundary", () => {
  it("keeps private owned installations unavailable even on their HTTPS origin", () => {
    expect(publicWineSharingAllowed("https://winesnap.boleoai.se", true)).toBe(false);
  });
  it.each([
    null,
    "http://127.0.0.1:5212",
    "http://localhost:5212",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "http://wine.example.com",
    "https://wine.example.test",
    "https://wine.example.invalid",
    "https://wine.example.local",
    "https://owner:secret@wine.example.com",
    "https://wine.example.com/path",
    "not a URL",
  ])("does not offer an unusable local/private link", (origin) => {
    expect(publicWineSharingAllowed(origin, false)).toBe(false);
  });
  it("retains public HTTPS sharing for non-owned builds", () => {
    expect(publicWineSharingAllowed("https://wine-scene-snap.lovable.app", false)).toBe(true);
  });
});
