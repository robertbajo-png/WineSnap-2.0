import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ownedPublicOriginSettings,
  selectOwnedPublicOrigin,
  localOwnedFixtureConfirmation,
} from "./owned-public-origin.mjs";

const origin = "https://winesnap.boleoai.se";
describe("owned app hostname staging", () => {
  it("keeps disposable confirmation probes local after the approved public-origin change", () => {
    const query =
      "?token=synthetic-fixture-only&type=signup&redirect_to=http%3A%2F%2F127.0.0.1%3A5212%2F";
    for (const prefix of [
      "http://127.0.0.1:54323/auth/v1/verify",
      origin + "/backend/auth/v1/verify",
    ])
      expect(localOwnedFixtureConfirmation(prefix + query).href).toBe(
        "http://127.0.0.1:54323/auth/v1/verify" + query,
      );
    for (const value of [
      "https://foreign.example.org/auth/v1/verify",
      origin + "/other",
      "http://127.0.0.1:8026/auth/v1/verify",
      "https://user:password@winesnap.boleoai.se/backend/auth/v1/verify",
    ])
      expect(() => localOwnedFixtureConfirmation(value)).toThrow();
  });
  it("leaves the installed loopback setup unchanged unless explicitly opted in", () => {
    expect(ownedPublicOriginSettings()).toEqual({
      origin: "",
      build: {},
      authConfig: "owned-auth-v2-authenticated-default",
      auth: {
        API_EXTERNAL_URL: "http://127.0.0.1:54323",
        GOTRUE_SITE_URL: "http://127.0.0.1:5212",
        GOTRUE_URI_ALLOW_LIST: "http://127.0.0.1:5212/**,http://localhost:5212/**",
        GOTRUE_JWT_ISSUER: "http://127.0.0.1:54323/auth/v1",
        GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify",
        GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
        GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: "/auth/v1/verify",
      },
    });
  });
  it("aligns browser API and email redirects without changing the existing JWT issuer", () => {
    const config = ownedPublicOriginSettings(origin);
    expect(config.build).toEqual({ VITE_OWNED_PUBLIC_ORIGIN: origin });
    expect(config.auth.API_EXTERNAL_URL).toBe(origin + "/backend");
    expect(config.auth.GOTRUE_SITE_URL).toBe(origin);
    expect(config.auth.GOTRUE_MAILER_URLPATHS_CONFIRMATION).toBe("/backend/auth/v1/verify");
    expect(config.auth.GOTRUE_MAILER_URLPATHS_RECOVERY).toBe("/backend/auth/v1/verify");
    expect(config.auth.GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE).toBe("/backend/auth/v1/verify");
    expect(config.auth.GOTRUE_URI_ALLOW_LIST.split(",")).toEqual([
      "http://127.0.0.1:5212/**",
      "http://localhost:5212/**",
      origin + "/**",
    ]);
    expect(config.auth.GOTRUE_JWT_ISSUER).toBe(ownedPublicOriginSettings().auth.GOTRUE_JWT_ISSUER);
  });
  it("never broadens access to the apex, another app or wildcard domain", () => {
    for (const value of [
      "https://boleoai.se",
      "http://winesnap.boleoai.se",
      origin + "/",
      "https://*.boleoai.se",
      "https://wine-scene-snap.lovable.app",
      "https://pzniyupmgwvlldvztzqh.supabase.co",
      origin + ":443",
      "https://other.example.org",
    ])
      expect(() => ownedPublicOriginSettings(value)).toThrow();
  });
  it("preserves an installed origin during ordinary updates and requires explicit rebuild to change it", () => {
    for (const action of ["Resume", "Verify", "Update", "Backup"])
      expect(selectOwnedPublicOrigin({ installed: origin, action }).origin).toBe(origin);
    expect(
      selectOwnedPublicOrigin({ requested: "", installed: origin, action: "Update" }).origin,
    ).toBe("");
    expect(
      selectOwnedPublicOrigin({ reset: "1", installed: origin, action: "Update" }).origin,
    ).toBe("");
    expect(() =>
      selectOwnedPublicOrigin({ reset: "1", requested: origin, action: "Update" }),
    ).toThrow();
    expect(() =>
      selectOwnedPublicOrigin({ reset: "1", installed: origin, action: "Verify" }),
    ).toThrow();
    expect(selectOwnedPublicOrigin({ requested: origin, action: "Update" }).origin).toBe(origin);
    for (const action of ["Start", "Resume", "Verify", "Backup"])
      expect(() => selectOwnedPublicOrigin({ requested: origin, action })).toThrow();
    expect(() =>
      selectOwnedPublicOrigin({ installed: "https://untrusted.example.org", action: "Verify" }),
    ).toThrow();
  });
  it("keeps origin settings public-only and does not read an inherited deployment environment", () => {
    const wrapper = readFileSync(new URL("../run-owned-windows.ps1", import.meta.url), "utf8");
    expect(wrapper).toContain("$start.Environment.Clear()");
    expect(wrapper).toContain(
      "if($PublicOrigin){$start.Environment['WINESNAP_OWNED_PUBLIC_ORIGIN']=$PublicOrigin}",
    );
    expect(wrapper).toContain(
      "if($LocalOnly){$start.Environment['WINESNAP_OWNED_ORIGIN_RESET']='1'}",
    );
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(manager).toContain('installedWeb?.Config.Labels["winesnap.public-origin"] ?? ""');
    expect(manager).toContain("`winesnap.public-origin=${publicOrigin}`");
    expect(manager).toContain("...originSettings.auth");
    expect(manager).toContain("...originSettings.build");
  });
});
