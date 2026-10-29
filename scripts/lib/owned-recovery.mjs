import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ownedProject, ownedServices, validateOwnedKeys } from "./owned-backend.mjs";
import { checkBinaryPart } from "./platform-recovery.mjs";

export const ownedRestoreScope = "owned-backup-rehearsal";
export const ownedRestoreLimit = 128 * 1024 * 1024;
const hex = /^[a-f0-9]{64}$/;
const schemas = new Set(["public", "auth", "storage", "extensions", "winesnap_local"]);
const catalog = [
  "tables",
  "columns",
  "policies",
  "grants",
  "views",
  "sequences",
  "functions",
  "schemas",
  "schema_grants",
  "roles",
  "memberships",
];
export function ownedRestoreNames(id) {
  assert.match(id, /^[a-f0-9]{16}$/);
  const prefix = `winesnap-owned-restore-${id}`;
  return {
    network: prefix,
    db: `${prefix}-db`,
    auth: `${prefix}-auth`,
    storage: `${prefix}-storage`,
    rest: `${prefix}-rest`,
    probe: `${prefix}-probe`,
  };
}
export function ownedRoleRestoreSql(source) {
  // Match the existing platform rehearsal: initdb already creates postgres.
  // Keep every ALTER/GRANT and make all other SQL failures fatal.
  assert.equal((source.match(/^CREATE ROLE postgres;\r?$/gm) ?? []).length, 1);
  return source.replace(/^CREATE ROLE postgres;\r?\n/m, "");
}
export function validateOwnedManifest(value) {
  assert.ok(
    value &&
      Array.isArray(value.relations) &&
      value.relations.length > 0 &&
      value.relations.length <= 1000,
  );
  assert.equal(value.algorithm, "owned-logical-v1");
  assert.deepEqual(Object.keys(value).sort(), ["algorithm", "catalog", "relations"]);
  assert.deepEqual(Object.keys(value.catalog).sort(), [...catalog].sort());
  for (const hash of Object.values(value.catalog)) assert.match(hash, hex);
  const names = new Set();
  for (const relation of value.relations) {
    assert.ok(schemas.has(relation.schema));
    assert.match(relation.table, /^[a-z_][a-z0-9_]{0,62}$/);
    assert.ok(Number.isSafeInteger(relation.rows) && relation.rows >= 0);
    assert.match(relation.sha256, hex);
    assert.deepEqual(Object.keys(relation).sort(), ["rows", "schema", "sha256", "table"]);
    const name = `${relation.schema}.${relation.table}`;
    assert.ok(!names.has(name));
    names.add(name);
  }
  for (const name of [
    "auth.users",
    "auth.identities",
    "public.wines",
    "storage.objects",
    "winesnap_local.installation",
  ])
    assert.ok(names.has(name));
  return value;
}
export function validateOwnedArchive(bundle) {
  assert.equal(bundle?.version, 2);
  assert.equal(bundle.project, ownedProject);
  assert.equal(bundle.writeQuiesced, true);
  assert.ok(Number.isFinite(Date.parse(bundle.createdAt)));
  validateOwnedKeys(bundle.configuration);
  assert.equal(bundle.configuration.openai, undefined);
  assert.equal(bundle.configuration.gemini, undefined);
  assert.deepEqual(
    Object.keys(bundle).sort(),
    [
      "version",
      "project",
      "createdAt",
      "configuration",
      "database",
      "roles",
      "storage",
      "images",
      "writeQuiesced",
      "manifest",
    ].sort(),
  );
  assert.deepEqual(Object.keys(bundle.images).sort(), Object.keys(ownedServices).sort());
  for (const image of Object.values(bundle.images)) assert.match(image, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    checkBinaryPart(bundle.database, 64 * 1024 * 1024)
      .subarray(0, 5)
      .toString(),
    "PGDMP",
  );
  checkBinaryPart(bundle.roles, 1024 * 1024);
  checkBinaryPart(bundle.storage, 64 * 1024 * 1024);
  assert.deepEqual(Object.keys(bundle.manifest).sort(), ["database", "files"]);
  validateOwnedManifest(bundle.manifest.database);
  assert.ok(Array.isArray(bundle.manifest.files) && bundle.manifest.files.length <= 4096);
  const paths = new Set();
  for (const file of bundle.manifest.files) {
    assert.deepEqual(Object.keys(file).sort(), ["bytes", "path", "sha256"]);
    assert.match(file.path, /^winesnap-owned\/(?!.*(?:\\|[\x00-\x1f]|:)).{1,1000}$/);
    assert.ok(file.path.split("/").every((part) => part && ![".", ".."].includes(part)));
    assert.ok(
      Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= 64 * 1024 * 1024,
    );
    assert.match(file.sha256, hex);
    assert.ok(!paths.has(file.path));
    paths.add(file.path);
  }
  return bundle;
}
export function inspectOwnedTar(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 64 * 1024 * 1024);
  const python =
    process.platform === "win32"
      ? `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`
      : "python3";
  return new Promise((resolve, reject) => {
    const child = execFile(
      python,
      ["-I", "-B", fileURLToPath(new URL("./inspect-owned-tar.py", import.meta.url))],
      { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(new Error("owned_storage_archive_rejected"));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("owned_storage_archive_rejected"));
        }
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(bytes);
  });
}
export function assertOwnedRestoreContainer(value, names, run) {
  assert.ok(
    Object.values(names).includes(value.Name.slice(1)) && value.Name !== `/${names.network}`,
  );
  assert.equal(value.Config.Labels["winesnap.scope"], ownedRestoreScope);
  assert.equal(value.Config.Labels["winesnap.restore"], run);
  assert.equal(value.HostConfig.NetworkMode, names.network);
  assert.equal(value.HostConfig.ReadonlyRootfs, true);
  assert.ok(value.HostConfig.CapDrop.includes("ALL"));
  assert.ok(value.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.equal(value.HostConfig.LogConfig.Type, "none");
  assert.ok(["postgres", "node", "1000:1000", "65534:65534"].includes(value.Config.User));
  assert.equal(value.HostConfig.Privileged, false);
  assert.ok(!value.HostConfig.Binds?.length && !value.HostConfig.Mounts?.length);
  assert.ok(value.Mounts.every((m) => m.Type === "tmpfs"));
  assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
  assert.notEqual(value.HostConfig.PublishAllPorts, true);
  assert.deepEqual(Object.keys(value.NetworkSettings.Networks), [names.network]);
}
