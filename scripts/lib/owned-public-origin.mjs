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
    },
    authConfig: value
      ? "owned-auth-v3-private-host:" + value
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
