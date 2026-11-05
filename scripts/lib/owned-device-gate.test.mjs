import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ownedDeviceGateConfiguration,
  validateOwnedDeviceBinding,
  renewOwnedDeviceEnrollment,
} from "./owned-device-gate.mjs";
import { ownedGateConfiguration } from "./owned-gate.mjs";

const keys = {
  sessionSecret: "a".repeat(64),
  storageKey: "b".repeat(64),
  resetSecret: "c".repeat(64),
};

describe("explicit private enrollment renewal", () => {
  const installationId = "a".repeat(32),
    ownerId = "c5129119-b982-448f-b09a-971afcda0b42";
  const gate = {
    version: 1,
    project: "winesnap-owned-local",
    hostname: "winesnap.boleoai.se",
    username: "robert",
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=4$${"a".repeat(22)}$${"b".repeat(43)}`,
    ...keys,
  };
  const staged = {
    version: 1,
    project: "winesnap-owned-local",
    installationId,
    ownerId,
    gate,
    password: "x".repeat(43),
    previousPasswordHash: gate.passwordHash,
    expiresAt: "2000-01-01T00:00:00.000Z",
  };
  it("renews only the operator's setup window while preserving every live key and credential", () => {
    const result = renewOwnedDeviceEnrollment(staged, installationId, gate, ownerId);
    expect(result).toEqual({ ...staged, expiresAt: expect.any(String) });
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now() + 3590000);
    expect(result.gate).toBe(gate);
    expect(staged.expiresAt).toBe("2000-01-01T00:00:00.000Z");
  });
  it.each([
    { ownerId: "another-owner" },
    { installationId: "b".repeat(32) },
    { password: "short" },
    { project: "another-project" },
    { extra: true },
    { gate: { ...gate, storageKey: "f".repeat(64) } },
  ])("refuses foreign or altered enrollment: %j", (patch) => {
    expect(() =>
      renewOwnedDeviceEnrollment({ ...staged, ...patch }, installationId, gate, ownerId),
    ).toThrow();
  });
  it("does not reuse a setup credential that is not the currently installed gate login", () => {
    const changed = { ...gate, passwordHash: gate.passwordHash.replace(/b/g, "c") };
    expect(renewOwnedDeviceEnrollment(staged, installationId, changed, ownerId)).toBeNull();
    expect(renewOwnedDeviceEnrollment(null, installationId, gate, ownerId)).toBeNull();
  });
});
describe("owned device gate opt-in", () => {
  it("keeps the existing configuration identical when disabled", () => {
    expect(ownedDeviceGateConfiguration(keys, false)).toEqual(
      ownedGateConfiguration(keys, { persistent: true }),
    );
  });
  it("requires discoverable, user-verified passkeys while preserving owner-only authorization and session limits", () => {
    const before = ownedDeviceGateConfiguration(keys, false),
      after = ownedDeviceGateConfiguration(keys, true);
    expect(after.webauthn).toEqual({
      enable_passkey_login: true,
      display_name: "WineSnap",
      attestation_conveyance_preference: "none",
      selection_criteria: { discoverability: "required", user_verification: "required" },
    });
    expect(after.access_control).toEqual(before.access_control);
    expect(after.session).toEqual(before.session);
    expect(after.storage).toEqual(before.storage);
    expect(after.access_control.rules[0]).toEqual({
      domain: "winesnap.boleoai.se",
      subject: "user:robert",
      policy: "one_factor",
    });
    expect(after.webauthn.experimental_enable_passkey_uv_two_factors).toBeUndefined();
  });
  it("refuses unknown activation inputs", () => {
    for (const value of ["true", undefined, 1, {}])
      expect(() => ownedDeviceGateConfiguration(keys, value)).toThrow();
  });
});

describe("private installation-bound owner mapping", () => {
  it("protects staged credentials explicitly and uses a real null backup name for atomic replacement", () => {
    const wrapper = readFileSync(
      new URL("../configure-owned-device-access.ps1", import.meta.url),
      "utf8",
    );
    expect(wrapper).toContain("$acl.SetAccessRuleProtection($true,$false)");
    expect(wrapper).toContain("[IO.File]::Replace($pending,$path,[NullString]::Value,$false)");
    expect(wrapper).toContain("-Encrypted -RetainPrevious");
  });
  const installationId = "a".repeat(32);
  const binding = {
    version: 1,
    project: "winesnap-owned-local",
    hostname: "winesnap.boleoai.se",
    installationId,
    ownerId: "c5129119-b982-448f-b09a-971afcda0b42",
    enabled: true,
  };
  it("accepts only the complete expected mapping", () => {
    expect(validateOwnedDeviceBinding(binding, installationId)).toBe(binding);
    expect(validateOwnedDeviceBinding({ ...binding, enabled: false }, installationId).enabled).toBe(
      false,
    );
  });
  it.each([
    { enabled: "true" },
    { ownerId: "user-selected-email@example.org" },
    { hostname: "wine-scene-snap.lovable.app" },
    { project: "pzniyupmgwvlldvztzqh" },
    { installationId: "b".repeat(32) },
    { version: 2 },
    { redirect: "https://attacker.invalid" },
  ])("rejects foreign, malformed and extra configuration: %j", (patch) => {
    expect(() => validateOwnedDeviceBinding({ ...binding, ...patch }, installationId)).toThrow();
  });
});
