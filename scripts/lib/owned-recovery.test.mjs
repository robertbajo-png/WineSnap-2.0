import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ownedProject, ownedServices } from "./owned-backend.mjs";
import { binaryPart } from "./platform-recovery.mjs";
import {
  assertOwnedRestoreContainer,
  inspectOwnedTar,
  ownedRestoreNames,
  ownedRoleRestoreSql,
  ownedRestoreScope,
  validateOwnedArchive,
  validateOwnedManifest,
} from "./owned-recovery.mjs";

const run = "a".repeat(16),
  names = ownedRestoreNames(run),
  hash = "f".repeat(64);
const manifest = () => ({
  algorithm: "owned-logical-v1",
  relations: [
    ["auth", "users"],
    ["auth", "identities"],
    ["public", "wines"],
    ["storage", "objects"],
    ["winesnap_local", "installation"],
  ].map(([schema, table]) => ({ schema, table, rows: 1, sha256: hash })),
  catalog: Object.fromEntries(
    [
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
    ].map((key) => [key, hash]),
  ),
});
const bundle = () => ({
  version: 2,
  project: ownedProject,
  createdAt: "2026-10-26T12:00:00Z",
  writeQuiesced: true,
  configuration: {
    version: 1,
    project: ownedProject,
    installationId: "a".repeat(32),
    issuedAt: 1792915200,
    dbPassword: "b".repeat(64),
    jwtSecret: "c".repeat(64),
    cronSecret: "d".repeat(64),
    privacyCronSecret: "e".repeat(64),
  },
  images: Object.fromEntries(Object.keys(ownedServices).map((key) => [key, `sha256:${hash}`])),
  database: binaryPart(Buffer.from("PGDMPsynthetic-only")),
  roles: binaryPart(Buffer.from("synthetic roles")),
  storage: binaryPart(Buffer.from("synthetic tar contract only")),
  manifest: { database: manifest(), files: [] },
});
const container = () => ({
  Name: `/${names.db}`,
  Config: {
    Labels: { "winesnap.scope": ownedRestoreScope, "winesnap.restore": run },
    User: "postgres",
  },
  HostConfig: {
    NetworkMode: names.network,
    ReadonlyRootfs: true,
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"],
    LogConfig: { Type: "none" },
    Privileged: false,
    PortBindings: {},
    Binds: [],
    Mounts: [],
  },
  Mounts: [],
  NetworkSettings: { Networks: { [names.network]: {} } },
});

describe("owned backup recovery scope and validation", () => {
  it("skips only initdb's exact duplicate postgres creation and retains its grants", () => {
    const source =
      "CREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER;\nCREATE ROLE anon;\nGRANT anon TO authenticator GRANTED BY postgres;\n";
    expect(ownedRoleRestoreSql(source)).toBe(source.replace("CREATE ROLE postgres;\n", ""));
    expect(() => ownedRoleRestoreSql(source + "CREATE ROLE postgres;\n")).toThrow();
    expect(() => ownedRoleRestoreSql("CREATE ROLE other;\n")).toThrow();
  });
  it("accepts only a complete version-two owned backup", () => {
    expect(validateOwnedArchive(bundle()).version).toBe(2);
    for (const change of [
      (b) => (b.version = 1),
      (b) => (b.project = "foreign"),
      (b) => (b.writeQuiesced = false),
      (b) => (b.createdAt = "bad"),
      (b) => (b.images.db = "postgres:latest"),
      (b) => (b.configuration.gemini = "g".repeat(32)),
      (b) => (b.extra = "ignored"),
      (b) => delete b.manifest,
      (b) => (b.database = binaryPart(Buffer.from("not a dump"))),
    ]) {
      const value = bundle();
      change(value);
      expect(() => validateOwnedArchive(value)).toThrow();
    }
  });
  it.each(["", "production", "../escape", "a".repeat(17)])(
    "rejects unsafe resource namespace %s",
    (id) => {
      expect(() => ownedRestoreNames(id)).toThrow();
    },
  );
  it("requires all protected schemas, count bounds and hashes", () => {
    expect(validateOwnedManifest(manifest()).relations).toHaveLength(5);
    for (const change of [
      (m) => m.relations.pop(),
      (m) => m.relations.push(m.relations[0]),
      (m) => (m.relations[0].rows = -1),
      (m) => (m.relations[0].schema = "pg_catalog"),
      (m) => (m.relations[0].table = "a;drop"),
      (m) => (m.relations[0].sha256 = "bad"),
      (m) => delete m.catalog.policies,
    ]) {
      const value = manifest();
      change(value);
      expect(() => validateOwnedManifest(value)).toThrow();
    }
  });
  it("refuses altered parts even before any restore target is created", () => {
    const value = bundle();
    value.database.sha256 = "0".repeat(64);
    expect(() => validateOwnedArchive(value)).toThrow();
  });
  it.each([
    "../escape",
    "winesnap-owned/../escape",
    "winesnap-owned/x\\y",
    "other/file",
    "winesnap-owned/x\nfile",
  ])("refuses unsafe stored file path %s", (path) => {
    const value = bundle();
    value.manifest.files = [{ path, bytes: 1, sha256: hash }];
    expect(() => validateOwnedArchive(value)).toThrow();
  });
  it("enforces isolation and refuses any source resource or permanent mount", () => {
    expect(() => assertOwnedRestoreContainer(container(), names, run)).not.toThrow();
    for (const change of [
      (c) => (c.Name = "/winesnap-owned-db"),
      (c) => (c.Config.User = "root"),
      (c) => (c.Config.Labels["winesnap.restore"] = "other"),
      (c) => (c.HostConfig.NetworkMode = "host"),
      (c) => (c.HostConfig.ReadonlyRootfs = false),
      (c) => (c.HostConfig.Privileged = true),
      (c) => (c.HostConfig.CapDrop = []),
      (c) => (c.HostConfig.SecurityOpt = []),
      (c) => (c.HostConfig.LogConfig.Type = "json-file"),
      (c) => (c.HostConfig.PortBindings = { "5432/tcp": [{}] }),
      (c) => (c.Mounts = [{ Type: "volume" }]),
      (c) => (c.HostConfig.Binds = ["/host:/data"]),
      (c) => (c.NetworkSettings.Networks.extra = {}),
    ]) {
      const value = container();
      change(value);
      expect(() => assertOwnedRestoreContainer(value, names, run)).toThrow();
    }
  });
  it("never connects to the running backend, imports provider keys or replays migrations", () => {
    const helper = readFileSync(new URL("../rehearse-owned-recovery.mjs", import.meta.url), "utf8");
    expect(helper).not.toMatch(
      /\.supabase\.co|127\.0\.0\.1:54|winesnap-owned-(?:db|auth|web)|supabase\/migrations|ai-keys|volume[", ]+rm/,
    );
    expect(helper).toContain("unix_socket_directories=/tmp,/var/run/postgresql");
    expect(helper).toMatch(/"pg_isready"[\s,]+"-h"[\s,]+"127\.0\.0\.1"/);
    for (const value of [
      '"--internal"',
      '"--single-transaction"',
      '"--exit-on-error"',
      "assertOwnedRestoreContainer",
      "compare_all_table_rows",
      "inspectOwnedTar(storage)",
      "ownedRoleRestoreSql",
    ])
      expect(helper).toContain(value);
    const wrapper = readFileSync(
      new URL("../rehearse-owned-recovery.ps1", import.meta.url),
      "utf8",
    );
    expect(wrapper).toContain("ProtectedData]::Unprotect");
    expect(wrapper).toContain("CurrentUser");
    expect(wrapper).toContain("$start.Environment.Clear()");
    expect(wrapper).not.toMatch(/prune|Set-Content.*\.sql/);
    expect(wrapper).toContain("owned-backup-rehearsal|$id|$prefix");
  });
});

const python =
  process.platform === "win32"
    ? `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`
    : "python3";
const makeTar = (entry) =>
  execFileSync(
    python,
    [
      "-I",
      "-B",
      "-c",
      `
import io,json,sys,tarfile
entry=json.loads(sys.stdin.read()); data=io.BytesIO()
with tarfile.open(fileobj=data,mode='w') as archive:
 item=tarfile.TarInfo(entry['name']);item.mode=entry.get('mode',0o600)
 if entry.get('link'): item.type=tarfile.SYMTYPE;item.linkname='target';archive.addfile(item)
 else: item.size=3;archive.addfile(item,io.BytesIO(b'abc'))
sys.stdout.buffer.write(data.getvalue())`,
    ],
    { input: JSON.stringify(entry), windowsHide: true },
  );
describe("owned storage archive parser", () => {
  it("uses the standard tar parser and hashes exact file bytes without extracting", async () => {
    const files = await inspectOwnedTar(
      makeTar({ name: "./winesnap-owned/wine-labels/owner/photo.webp" }),
    );
    expect(files).toEqual([
      {
        path: "winesnap-owned/wine-labels/owner/photo.webp",
        bytes: 3,
        sha256: binaryPart(Buffer.from("abc")).sha256,
      },
    ]);
    const parser = readFileSync(
      fileURLToPath(new URL("./inspect-owned-tar.py", import.meta.url)),
      "utf8",
    );
    expect(parser).not.toMatch(/extractall|\.extract\(/);
  });
  it.each([
    { name: "../escape" },
    { name: "/absolute" },
    { name: "other/file" },
    { name: "winesnap-owned/link", link: true },
    { name: "winesnap-owned/privileged", mode: 0o4600 },
  ])("refuses invalid tar entry %j", async (entry) => {
    await expect(inspectOwnedTar(makeTar(entry))).rejects.toThrow("owned_storage_archive_rejected");
  });
});
