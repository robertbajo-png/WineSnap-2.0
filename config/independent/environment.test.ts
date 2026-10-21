import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { independentEnvironment, publicEnvironmentKeys } from "./environment";

const input = {
  VITE_SUPABASE_URL: "https://staging.example.invalid",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_only",
};

describe("independent build configuration", () => {
  it("ignores even inherited production values in runtime-check mode", () => {
    const values = independentEnvironment("runtime-check", {
      ...input,
      VITE_PRIVACY_CONTROLS_ENABLED: "true",
      VITE_PRIVACY_OPERATIONS_VERIFIED: "true",
      VITE_WINE_IMAGE_PROXY_ENABLED: "true",
      VITE_SUPPORT_EMAIL: "not-public@example.invalid",
    });
    expect(values.VITE_SUPABASE_URL).toBe("https://example.invalid");
    expect(values.VITE_PRIVACY_CONTROLS_ENABLED).toBe("false");
    expect(values.VITE_PRIVACY_OPERATIONS_VERIFIED).toBe("false");
    expect(values.VITE_WINE_IMAGE_PROXY_ENABLED).toBe("false");
    expect(values).not.toHaveProperty("VITE_SUPPORT_EMAIL");
  });

  it("requires deliberate public configuration outside the check mode", () => {
    expect(() => independentEnvironment("production", {})).toThrow("VITE_SUPABASE_URL");
    expect(() =>
      independentEnvironment("production", { VITE_SUPABASE_URL: input.VITE_SUPABASE_URL }),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("only forwards the known public allowlist", () => {
    const values = independentEnvironment("production", {
      ...input,
      SUPABASE_SERVICE_ROLE_KEY: "private-canary",
      VITE_UNKNOWN_SECRET: "private-canary",
      LOVABLE_API_KEY: "private-canary",
    });
    expect(values).toEqual(input);
    expect(
      Object.keys(values).every((key) =>
        publicEnvironmentKeys.includes(key as (typeof publicEnvironmentKeys)[number]),
      ),
    ).toBe(true);
  });

  it("rejects secret/service-role keys and insecure remote URLs", () => {
    for (const key of [
      "sb_secret_private",
      "invalid",
      `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`,
    ]) {
      expect(() =>
        independentEnvironment("production", { ...input, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toThrow();
    }
    for (const url of [
      "http://remote.example.invalid",
      "https://user:password@example.invalid",
      "https://example.invalid?token=private",
    ]) {
      expect(() =>
        independentEnvironment("production", { ...input, VITE_SUPABASE_URL: url }),
      ).toThrow();
    }
  });

  it("supports public legacy anon keys and local Supabase", () => {
    const key = `e30.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(
      independentEnvironment("production", {
        ...input,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_PUBLISHABLE_KEY: key,
      }).VITE_SUPABASE_PUBLISHABLE_KEY,
    ).toBe(key);
  });

  it("only enables the image proxy from deliberate public configuration", () => {
    expect(
      independentEnvironment("production", { ...input, VITE_WINE_IMAGE_PROXY_ENABLED: "true" })
        .VITE_WINE_IMAGE_PROXY_ENABLED,
    ).toBe("true");
  });

  it("keeps the alternate build separate from the original and Chef prototype", () => {
    const config = readFileSync("vite.independent.config.ts", "utf8");
    expect(config).not.toContain("@lovable");
    expect(config).toContain('preset: "node_server"');
    expect(config).toContain("dist/independent-runtime");
    expect(config).toContain("envDir: false");
    expect(config).toContain("envPrefix: []");
    expect(config).toContain('behavior: "error"');
    expect(readFileSync("vite.config.ts", "utf8")).toContain("@lovable.dev/vite-tanstack-config");
    expect(readFileSync("prototypes/chef/vite.config.ts", "utf8")).toContain("dist/chef-prototype");
  });
});
