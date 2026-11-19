import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Encrypter, Decrypter } from "age-encryption";
import { validateOwnedArchive } from "../lib/owned-recovery.mjs";
import { validateOwnedGateKeys } from "../lib/owned-private-ingress.mjs";
import { validateOwnedTunnelStore } from "../lib/owned-tunnel.mjs";
import { ownedServices } from "../lib/owned-backend.mjs";

export const portableLimit = 176 * 1024 * 1024;
export const portableFormat = "winesnap-portable-age-v1";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ownKeys = (value, names) => assert.deepEqual(Object.keys(value).sort(), [...names].sort());
const repositories = {
  db: "postgres",
  auth: "supabase/gotrue",
  rest: "postgrest/postgrest",
  storage: "supabase/storage-api",
  mail: "axllent/mailpit",
  gateway: "nginxinc/nginx-unprivileged",
};

export function validatePortableBundle(value) {
  ownKeys(value, [
    "version",
    "format",
    "project",
    "createdAt",
    "source",
    "application",
    "gate",
    "credentials",
    "imageReferences",
    "providersIncluded",
  ]);
  assert.equal(value.version, 1);
  assert.equal(value.format, portableFormat);
  assert.equal(value.project, "winesnap-owned-local");
  assert.equal(value.providersIncluded, false);
  assert.ok(Number.isFinite(Date.parse(value.createdAt)));
  ownKeys(value.source, ["applicationBackup", "gateBackup", "toolCommit"]);
  assert.match(value.source.applicationBackup, /^owned-\d{8}-\d{9}\.dpapi$/);
  assert.match(value.source.gateBackup, /^gate-\d{8}-\d{9}\.dpapi$/);
  assert.match(value.source.toolCommit, /^[a-f0-9]{40}$/);
  validateOwnedArchive(value.application);
  const gate = value.gate;
  ownKeys(gate, [
    "version",
    "project",
    "installationId",
    "format",
    "createdAt",
    "files",
    "manifest",
  ]);
  assert.equal(gate.version, 1);
  assert.equal(gate.project, value.project);
  assert.equal(gate.installationId, value.application.configuration.installationId);
  assert.equal(gate.format, "owned-private-gate-sqlite-v1");
  assert.ok(Number.isFinite(Date.parse(gate.createdAt)));
  assert.ok(Array.isArray(gate.files) && gate.files.length >= 1 && gate.files.length <= 3);
  const names = new Set();
  let total = 0;
  for (const file of gate.files) {
    ownKeys(file, ["name", "base64", "sha256"]);
    assert.ok(["gate.sqlite3", "gate.sqlite3-wal", "gate.sqlite3-shm"].includes(file.name));
    assert.ok(!names.has(file.name));
    names.add(file.name);
    assert.equal(typeof file.base64, "string");
    assert.ok(file.base64.length <= 12 * 1024 * 1024);
    const bytes = Buffer.from(file.base64, "base64");
    try {
      total += bytes.length;
      assert.ok(total <= 16 * 1024 * 1024);
      assert.equal(bytes.toString("base64"), file.base64);
      assert.equal(hash(bytes), file.sha256);
    } finally {
      bytes.fill(0);
    }
  }
  assert.equal(gate.files[0].name, "gate.sqlite3");
  assert.ok(
    Array.isArray(gate.manifest) && gate.manifest.length > 0 && gate.manifest.length <= 100,
  );
  const tables = new Set();
  for (const table of gate.manifest) {
    ownKeys(table, ["name", "rows"]);
    assert.equal(typeof table.name, "string");
    assert.ok(table.name.length > 0 && table.name.length <= 128 && !tables.has(table.name));
    tables.add(table.name);
    assert.ok(Number.isSafeInteger(table.rows) && table.rows >= 0);
  }
  ownKeys(value.credentials, ["gate", "tunnel"]);
  validateOwnedGateKeys(value.credentials.gate);
  validateOwnedTunnelStore(value.credentials.tunnel);
  ownKeys(value.imageReferences, Object.keys(ownedServices));
  for (const [service, reference] of Object.entries(value.imageReferences)) {
    assert.equal(typeof reference, "string");
    assert.match(reference, /^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/);
    assert.equal(reference.split("@")[0], repositories[service]);
  }
  return value;
}

function passphrase(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 20 && bytes.length <= 512);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(text.length >= 20 && !/[\x00\r\n]/.test(text));
  return text;
}
export async function sealPortable(value, password) {
  validatePortableBundle(value);
  const bytes = Buffer.from(JSON.stringify(value));
  try {
    assert.ok(bytes.length <= portableLimit);
    const encrypter = new Encrypter();
    encrypter.setPassphrase(passphrase(password));
    encrypter.setScryptWorkFactor(18);
    return Buffer.from(await encrypter.encrypt(bytes));
  } catch {
    throw new Error("portable_encryption_failed");
  } finally {
    bytes.fill(0);
  }
}
export async function openPortable(ciphertext, password) {
  let bytes;
  try {
    assert.ok(
      Buffer.isBuffer(ciphertext) &&
        ciphertext.length > 128 &&
        ciphertext.length <= portableLimit + 1024 * 1024,
    );
    assert.equal(ciphertext.subarray(0, 22).toString(), "age-encryption.org/v1\n");
    assert.ok(ciphertext.subarray(0, 512).includes(Buffer.from("\n--- ")));
    const decrypter = new Decrypter();
    // Reject unsupported/expensive recipient policies before running the vendor KDF.
    decrypter.addIdentity({
      unwrapFileKey(stanzas) {
        assert.equal(stanzas.length, 1);
        assert.equal(stanzas[0].args[0], "scrypt");
        assert.equal(stanzas[0].args[2], "18");
        return null;
      },
    });
    decrypter.addPassphrase(passphrase(password));
    bytes = Buffer.from(await decrypter.decrypt(ciphertext));
    assert.ok(bytes.length <= portableLimit);
    return validatePortableBundle(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new Error("portable_archive_not_accepted");
  } finally {
    bytes?.fill(0);
  }
}
