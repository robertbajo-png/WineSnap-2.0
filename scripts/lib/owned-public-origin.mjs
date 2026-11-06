import assert from "node:assert/strict";
import { ownedApp, ownedApi } from "./owned-backend.mjs";
import { ownedInternetOrigin } from "./owned-internet.mjs";

export function ownedPublicOriginSettings(value = "") {
  assert.ok(value === "" || value === ownedInternetOrigin, "Only the approved hostname is allowed");
  return {
    origin: value,
    build: value ? { VITE_OWNED_PUBLIC_ORIGIN: value } : {},
    auth: {
      API_EXTERNAL_URL: value ? value + "/backend" : ownedApi,
      GOTRUE_SITE_URL: value || ownedApp,
      GOTRUE_URI_ALLOW_LIST: [
        ownedApp + "/**",
        "http://localhost:5212/**",
        ...(value ? [value + "/**"] : []),
      ].join(","),
      // Preserve existing local sessions and Storage JWT validation across this change.
      GOTRUE_JWT_ISSUER: ownedApi + "/auth/v1",
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: value ? "/backend/auth/v1/verify" : "/auth/v1/verify",
      GOTRUE_MAILER_URLPATHS_RECOVERY: value ? "/backend/auth/v1/verify" : "/auth/v1/verify",
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: value ? "/backend/auth/v1/verify" : "/auth/v1/verify",
    },
    authConfig: value
      ? "owned-auth-v4-private-host-email-prefix:" + value
      : "owned-auth-v2-authenticated-default",
  };
}

export function selectOwnedPublicOrigin({ requested, reset, installed = "", action }) {
  ownedPublicOriginSettings(installed);
  assert.ok(reset === undefined || reset === "1");
  if (reset === "1") {
    assert.equal(requested, undefined);
    assert.equal(action, "Update", "Changing the app origin requires an explicit Update");
    return ownedPublicOriginSettings();
  }
  if (requested !== undefined) {
    assert.equal(action, "Update", "Changing the app origin requires an explicit Update");
    return ownedPublicOriginSettings(requested);
  }
  return ownedPublicOriginSettings(installed);
}

export function localOwnedFixtureConfirmation(value) {
  const source = new URL(value);
  assert.ok(!source.username && !source.password && !source.hash);
  assert.ok(
    (source.origin === ownedApi && source.pathname === "/auth/v1/verify") ||
      (source.origin === ownedInternetOrigin && source.pathname === "/backend/auth/v1/verify"),
  );
  const local = new URL(ownedApi + "/auth/v1/verify");
  local.search = source.search;
  return local;
}
