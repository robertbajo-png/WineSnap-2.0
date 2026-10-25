import { describe, expect, it } from "vitest";
import {
  approvedLocalBackend,
  approvedCookingBrowser,
  ownedBackendOrigin,
  ownedBrowserOrigin,
  hostedTestOrigin,
} from "./backendScope";
import { independentEnvironment } from "../../config/independent/environment";

describe("owned-local backend boundary", () => {
  it("requires the owned flag and exact Docker gateway name", () => {
    expect(approvedLocalBackend({ SUPABASE_URL: ownedBackendOrigin })).toBe(null);
    expect(
      approvedLocalBackend({
        WINESNAP_OWNED_BACKEND_ENABLED: "true",
        SUPABASE_URL: ownedBackendOrigin,
      }),
    ).toBe(ownedBackendOrigin);
    expect(
      approvedLocalBackend({
        WINESNAP_OWNED_BACKEND_ENABLED: "true",
        SUPABASE_URL: hostedTestOrigin,
      }),
    ).toBe(null);
    expect(approvedLocalBackend({ SUPABASE_URL: hostedTestOrigin })).toBe(hostedTestOrigin);
  });
  it.each([
    "https://production.invalid",
    "http://localhost:54323",
    "http://winesnap-owned-gateway:8080.evil.test",
    "http://winesnap-owned-gateway:8080/other",
    "http://winesnap-owned-gateway:8080?token=x",
  ])("refuses %s", (url) => {
    expect(
      approvedLocalBackend({ WINESNAP_OWNED_BACKEND_ENABLED: "true", SUPABASE_URL: url }),
    ).toBe(null);
  });
  it("does not treat every loopback or private-network URL as approved", () => {
    expect(approvedCookingBrowser(ownedBrowserOrigin, "true")).toBe(true);
    expect(approvedCookingBrowser("http://127.0.0.1:54321", "true")).toBe(false);
    expect(approvedCookingBrowser(hostedTestOrigin, "true")).toBe(false);
    expect(approvedCookingBrowser(ownedBrowserOrigin, "false")).toBe(false);
  });
  it("keeps cooking/privacy gates on the owned build", () => {
    const input = {
      VITE_OWNED_BACKEND_ENABLED: "true",
      VITE_SUPABASE_URL: ownedBrowserOrigin,
      VITE_SUPABASE_PUBLISHABLE_KEY: "e30.eyJyb2xlIjoiYW5vbiJ9.signature",
      VITE_COOKING_CORE_ENABLED: "true",
      VITE_LOCAL_AI_ENABLED: "true",
      VITE_PRIVACY_CONTROLS_ENABLED: "true",
      VITE_PRIVACY_OPERATIONS_VERIFIED: "true",
    };
    expect(independentEnvironment("production", input).VITE_OWNED_BACKEND_ENABLED).toBe("true");
    expect(() =>
      independentEnvironment("production", { ...input, VITE_PRIVACY_OPERATIONS_VERIFIED: "false" }),
    ).toThrow("privacy");
    expect(() =>
      independentEnvironment("production", { ...input, VITE_SUPABASE_URL: hostedTestOrigin }),
    ).toThrow("exact local gateway");
  });
});
