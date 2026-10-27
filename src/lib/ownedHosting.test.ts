import { describe, expect, it } from "vitest";
import { ownedBrowserOrigin } from "./backendScope";
import { ownedBrowserApiUrl, validatedOwnedPublicOrigin } from "./ownedHosting";
import { independentEnvironment } from "../../config/independent/environment";

const origin = "https://winesnap.boleoai.se";
describe("owned HTTPS browser routing", () => {
  it("does not enable owned internet routing in synthetic or hosted builds", () => {
    const values = {
      VITE_SUPABASE_URL: ownedBrowserOrigin,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
      VITE_OWNED_BACKEND_ENABLED: "true",
      VITE_OWNED_PUBLIC_ORIGIN: origin,
    };
    expect(independentEnvironment("production", values).VITE_OWNED_PUBLIC_ORIGIN).toBe(origin);
    expect(() =>
      independentEnvironment("production", { ...values, VITE_OWNED_BACKEND_ENABLED: "false" }),
    ).toThrow();
    expect(independentEnvironment("runtime-check", values)).not.toHaveProperty(
      "VITE_OWNED_PUBLIC_ORIGIN",
    );
  });
  it("uses the same HTTPS origin only on the configured internet site", () => {
    expect(ownedBrowserApiUrl(ownedBrowserOrigin, "true", origin, origin)).toBe(
      origin + "/backend",
    );
  });
  it("preserves SSR and both existing local origins", () => {
    for (const page of [undefined, "http://127.0.0.1:5212", "http://localhost:5212"])
      expect(ownedBrowserApiUrl(ownedBrowserOrigin, "true", origin, page)).toBe(ownedBrowserOrigin);
    expect(ownedBrowserApiUrl(ownedBrowserOrigin, "true", undefined, origin)).toBe(
      ownedBrowserOrigin,
    );
  });
  it("rejects unapproved websites and attempts to redirect hosted backends", () => {
    expect(() =>
      ownedBrowserApiUrl(ownedBrowserOrigin, "true", origin, "https://other.example.org"),
    ).toThrow();
    expect(() => ownedBrowserApiUrl("https://other.example.org", "true", origin, origin)).toThrow();
    expect(() => ownedBrowserApiUrl(ownedBrowserOrigin, "false", origin, origin)).toThrow();
  });
  it("requires a clean permanent DNS-based HTTPS origin", () => {
    expect(validatedOwnedPublicOrigin(origin)).toBe(origin);
    expect(validatedOwnedPublicOrigin(undefined)).toBeUndefined();
    for (const url of [
      "http://winesnap.boleoai.se",
      origin + "/",
      origin + "/path",
      origin + "?x=1",
      origin + "#x",
      "https://user:secret@winesnap.boleoai.se",
      "https://127.0.0.1",
      "https://localhost",
      "https://x.trycloudflare.com",
      "https://x.supabase.co",
      "https://wine-scene-snap.lovable.app",
      "https://winesnap.boleoai.se:8443",
    ])
      expect(() => validatedOwnedPublicOrigin(url)).toThrow();
  });
});
