import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

export const recoveryProject = "pzniyupmgwvlldvztzqh";
export const recoveryScope = "local-platform-recovery";
export const recoveryLimit = 128 * 1024 * 1024;
export const recoveryImages = {
  database: "postgres:17-bookworm",
  auth: "supabase/gotrue:v2.197.0",
  storage: "supabase/storage-api:v1.81.0",
  probe: "winesnap-local:test",
};
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;

export function recoveryNames(id) {
  assert.match(id, /^[a-f0-9]{16}$/);
  const prefix = `winesnap-platform-${id}`;
  return {
    network: prefix,
    database: `${prefix}-db`,
    auth: `${prefix}-auth`,
    storage: `${prefix}-storage`,
    probe: `${prefix}-probe`,
  };
}

export function recoveryToken(secret, role) {
  assert.match(secret, hex);
  assert.ok(["anon", "service_role"].includes(role));
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role,
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
  })}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function binaryPart(bytes) {
  return { base64: bytes.toString("base64"), sha256: sha256(bytes) };
}

export function checkBinaryPart(part, limit = recoveryLimit) {
  assert.ok(part && typeof part.base64 === "string" && part.base64.length <= limit * 1.4);
  assert.match(part.base64, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
  const bytes = Buffer.from(part.base64, "base64");
  assert.ok(bytes.length > 0 && bytes.length <= limit);
  assert.equal(bytes.toString("base64"), part.base64);
  assert.equal(sha256(bytes), part.sha256);
  return bytes;
}

// Only our synthetic, local fixture can enter this path. A hosted export must
// have its own acquisition/consistency and encryption-key evidence first.
export function validatePlatformBundle(bundle) {
  assert.equal(bundle?.version, 1);
  assert.equal(bundle.kind, "winesnap-local-platform-fixture");
  assert.equal(bundle.project, recoveryProject);
  assert.equal(bundle.hostedTestExport, false);
  assert.ok(Number.isFinite(Date.parse(bundle.createdAt)));
  assert.match(bundle.jwtSecret, hex);
  assert.match(bundle.dbPassword, hex);
  assert.match(bundle.catalogHash, hex);
  assert.equal(bundle.erasureReceipts.length, 1);
  const receipt = bundle.erasureReceipts[0];
  assert.ok(Number.isFinite(Date.parse(receipt.requested_at)));
  assert.deepEqual(Object.keys(bundle.images).sort(), Object.keys(recoveryImages).sort());
  for (const image of Object.values(bundle.images)) assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const archive = checkBinaryPart(bundle.database);
  assert.equal(archive.subarray(0, 5).toString(), "PGDMP");
  checkBinaryPart(bundle.roles, 1024 * 1024);
  assert.equal(bundle.accounts.length, 2);
  for (const account of bundle.accounts) {
    assert.match(account.id, uuid);
    assert.match(account.email, /^recovery-(owner|peer)@example\.test$/);
    assert.match(account.password, hex);
  }
  assert.equal(new Set(bundle.accounts.map((account) => account.id)).size, 2);
  assert.equal(new Set(bundle.accounts.map((account) => account.email)).size, 2);
  assert.equal(receipt.user_id, bundle.accounts[0].id);
  assert.match(bundle.wineId, uuid);
  assert.match(bundle.shareId, /^recovery\+legacy\/[a-f0-9]{16}$/);
  assert.equal(bundle.files.length, 1);
  for (const file of bundle.files) {
    assert.equal(file.bucket, "wine-labels");
    assert.equal(file.path, `${bundle.accounts[0].id}/recovery.png`);
    assert.equal(file.type, "image/png");
    checkBinaryPart(file, 1024 * 1024);
  }
  return bundle;
}

export function assertSandbox(container, names) {
  assert.equal(container.Config.Labels["winesnap.scope"], recoveryScope);
  assert.equal(container.HostConfig.NetworkMode, names.network);
  assert.equal(container.HostConfig.ReadonlyRootfs, true);
  assert.ok(container.HostConfig.CapDrop.includes("ALL"));
  assert.ok(container.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.match(container.Config.User, /^(?:postgres|node|[1-9]\d*(?::[1-9]\d*)?)$/);
  assert.equal(container.Mounts.length, 0);
  assert.equal(Object.keys(container.HostConfig.PortBindings ?? {}).length, 0);
  assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [names.network]);
}
