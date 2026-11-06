import assert from "node:assert/strict";
import { ownedGateConfiguration } from "./owned-gate.mjs";
import { validateOwnedGateKeys } from "./owned-private-ingress.mjs";

export function renewOwnedDeviceEnrollment(value, installationId, gate, ownerId) {
  if (value === null) return null;
  assert.deepEqual(Object.keys(value).sort(), [
    "expiresAt",
    "gate",
    "installationId",
    "ownerId",
    "password",
    "previousPasswordHash",
    "project",
    "version",
  ]);
  assert.equal(value.version, 1);
  assert.equal(value.project, "winesnap-owned-local");
  assert.equal(value.installationId, installationId);
  assert.equal(value.ownerId, ownerId);
  assert.match(value.password, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(Number.isFinite(Date.parse(value.expiresAt)));
  validateOwnedGateKeys(value.gate);
  validateOwnedGateKeys({ ...gate, passwordHash: value.previousPasswordHash });
  if (value.gate.passwordHash !== gate.passwordHash) return null;
  assert.deepEqual(value.gate, gate);
  return { ...value, expiresAt: new Date(Date.now() + 3600000).toISOString() };
}

export function validateOwnedDeviceBinding(value, installationId) {
  assert.deepEqual(Object.keys(value).sort(), [
    "enabled",
    "hostname",
    "installationId",
    "ownerId",
    "project",
    "version",
  ]);
  assert.equal(value.version, 1);
  assert.equal(value.project, "winesnap-owned-local");
  assert.equal(value.hostname, "winesnap.boleoai.se");
  assert.equal(value.installationId, installationId);
  assert.match(installationId, /^[a-f0-9]{32}$/);
  assert.match(value.ownerId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(typeof value.enabled, "boolean");
  return value;
}

export function ownedDeviceGateConfiguration(keys, enabled) {
  assert.equal(typeof enabled, "boolean");
  const config = ownedGateConfiguration(keys, { persistent: true });
  if (enabled)
    config.webauthn = {
      enable_passkey_login: true,
      display_name: "WineSnap",
      attestation_conveyance_preference: "none",
      selection_criteria: { discoverability: "required", user_verification: "required" },
    };
  return config;
}
