import { describe, expect, it } from "vitest";
import {
  hasRecoveryGrant,
  recoveryLinkError,
  recoveryRedirectUrl,
  safeInternalPath,
} from "./authRedirect";

describe("recoveryRedirectUrl", () => {
  it("always points at the dedicated reset page on the same origin", () => {
    expect(recoveryRedirectUrl("https://wine-scene-snap.lovable.app")).toBe(
      "https://wine-scene-snap.lovable.app/reset-password",
    );
    expect(recoveryRedirectUrl("https://example.com/")).toBe("https://example.com/reset-password");
  });
});

describe("safeInternalPath", () => {
  it("keeps plain internal paths", () => {
    expect(safeInternalPath("/cellar")).toBe("/cellar");
  });

  it("rejects external and protocol-relative targets", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "/x://evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(safeInternalPath(bad)).toBe("/");
    }
  });
});

describe("hasRecoveryGrant", () => {
  it("detects hash and query grants", () => {
    expect(hasRecoveryGrant("#access_token=abc&type=recovery", "")).toBe(true);
    expect(hasRecoveryGrant("", "?token_hash=abc&type=recovery")).toBe(true);
    expect(hasRecoveryGrant("", "?code=abc")).toBe(true);
  });

  it("is false for a direct visit", () => {
    expect(hasRecoveryGrant("", "")).toBe(false);
    expect(hasRecoveryGrant("#type=recovery", "")).toBe(false);
  });
});

describe("recoveryLinkError", () => {
  it("surfaces expired links", () => {
    expect(recoveryLinkError("#error_code=otp_expired&error=access_denied", "")).toBe("otp_expired");
    expect(recoveryLinkError("", "?error=access_denied")).toBe("access_denied");
    expect(recoveryLinkError("", "")).toBeNull();
  });
});
