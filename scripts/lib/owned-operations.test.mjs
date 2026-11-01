import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessOwnedOperations, readOwnedOperations } from "./owned-operations.mjs";

const now = Date.parse("2026-11-01T16:00:00Z");
const project = "winesnap-owned-local";
const appFile = "owned-20261101-150000000.dpapi";
const gateFile = "gate-20261101-150000000.dpapi";
function fixture() {
  const base = { project, checkedAt: "2026-11-01T15:59:00Z" };
  const success = { ...base, completed: true, productionTouched: false, hostedTestTouched: false };
  const gate = { ...success, publicTunnelStarted: false, dnsChanged: false, publishedPorts: 0 };
  return {
    runtime: {
      ...base,
      productionTouched: false,
      readOnly: true,
      healthy: true,
      ...Object.fromEntries(
        [
          "heartbeatFresh",
          "jobsHealthy",
          "currentSupervisorVersion",
          "privateIngressHealthy",
          "publicTunnelHealthy",
          "taskVerified",
          "taskRunning",
          "supervisorRunning",
        ].map((name) => [name, true]),
      ),
    },
    reports: {
      maintain: {
        ...success,
        jobs: Object.fromEntries(
          ["prices", "privacy"].map((name) => [name, { status: 200, failed: 0, remaining: 0 }]),
        ),
      },
      backup: {
        ...success,
        backupFile: appFile,
        encryptedRoundtripVerified: true,
        backupIncludesAuthHashes: true,
        backupIncludesImageBytes: true,
      },
      restore: {
        ...success,
        backupFile: appFile,
        archiveVersion: 2,
        cleanupCompleted: true,
        isolatedOwnedRestoreVerified: true,
        runningInstallationStopped: false,
        sourceDatabaseConnected: false,
        providerCredentialsLoaded: false,
        publicPorts: 0,
        permanentVolumesCreated: 0,
        originalUserPasswordsEnteredOrReset: false,
        authHashesAndIdentitiesMatched: true,
        grantsPoliciesAndFunctionsMatched: true,
        allTableRowsAndShareIdsMatched: true,
        syntheticCloneLoginAndWrongPassword: true,
        restoredOwnerIsolationWithRealJwt: true,
        tablesVerified: 75,
        storageFilesVerified: 1,
        restoredObjectsDownloaded: 1,
      },
      "ingress-control": { ...base, enabled: true },
      "tunnel-control": { ...base, enabled: true },
      "gate-backup": {
        ...gate,
        backupFile: gateFile,
        backupQuiesced: true,
        resumedAfterBackup: true,
        encryptedRoundtripVerified: true,
      },
      "gate-restore": {
        ...gate,
        backupFile: gateFile,
        restored: true,
        integrity: true,
        cleanupCompleted: true,
        credentialRecoveryVerified: true,
        tables: 26,
        files: 1,
      },
    },
    archives: { application: [appFile], gate: [gateFile] },
  };
}

describe("owned operational assessment", () => {
  it("rejects command-line paths or other arguments before inspecting local state", () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../check-owned-operations.mjs", import.meta.url)),
        "--directory=not-allowed",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("without arguments");
    expect(result.stderr).not.toContain("not-allowed");
  });
  it("reports current local evidence without approving public release", () => {
    const result = assessOwnedOperations(fixture(), now);
    expect(result.localOperationsReady).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.applicationRecoveryCurrent).toBe(true);
    expect(result.gateRecoveryCurrent).toBe(true);
    expect(result.publicReleaseAssessed).toBe(false);
    expect(result.notAssessed).toContain("physical_mobile_and_cellular");
    expect(result.notAssessed).toContain("portable_off_device_recovery");
  });
  it("fails closed when all reports are missing", () => {
    const result = assessOwnedOperations({}, now);
    expect(result.localOperationsReady).toBe(false);
    expect(result.runtimeHealthy).toBe(false);
    expect(result.applicationRecoveryCurrent).toBe(false);
    expect(result.internetControlsVerified).toBe(false);
  });
  it.each(["maintain", "backup", "restore", "gate-backup", "gate-restore"])(
    "rejects foreign, incomplete, future and stale %s reports",
    (name) => {
      for (const patch of [
        { project: "hosted-test" },
        { completed: false },
        { completed: "true" },
        { productionTouched: true },
        { skipped: "operation_already_running" },
        { checkedAt: "2026-11-02T16:00:00Z" },
        { checkedAt: "2026-10-30T16:00:00Z" },
        { checkedAt: "not-a-date" },
      ]) {
        const input = fixture();
        Object.assign(input.reports[name], patch);
        expect(assessOwnedOperations(input, now).localOperationsReady).toBe(false);
      }
    },
  );
  it.each([
    "heartbeatFresh",
    "jobsHealthy",
    "taskVerified",
    "taskRunning",
    "supervisorRunning",
    "currentSupervisorVersion",
    "privateIngressHealthy",
    "publicTunnelHealthy",
  ])("requires the runtime's %s check, not only its headline", (name) => {
    const input = fixture();
    input.runtime[name] = false;
    expect(assessOwnedOperations(input, now).runtimeHealthy).toBe(false);
  });
  it("rejects stale runtime and maintenance status", () => {
    const input = fixture();
    input.runtime.checkedAt = "2026-11-01T15:50:00Z";
    input.reports.maintain.checkedAt = "2026-11-01T13:00:00Z";
    const result = assessOwnedOperations(input, now);
    expect(result.runtimeHealthy).toBe(false);
    expect(result.maintenanceCurrent).toBe(false);
  });
  it.each(["failed", "remaining", "status"])("does not hide maintenance %s failures", (name) => {
    const input = fixture();
    input.reports.maintain.jobs.privacy[name] = 1;
    expect(assessOwnedOperations(input, now).maintenanceCurrent).toBe(false);
  });
  it.each(["application", "gate"])(
    "requires an existing latest %s archive and its matching rehearsal",
    (kind) => {
      for (const archives of [
        [],
        null,
        ["../secrets.dpapi"],
        [kind === "gate" ? "gate-20261101-155000000.dpapi" : "owned-20261101-155000000.dpapi"],
      ]) {
        const input = fixture();
        input.archives[kind] = archives;
        expect(assessOwnedOperations(input, now).localOperationsReady).toBe(false);
      }
      const input = fixture();
      input.reports[kind === "gate" ? "gate-restore" : "restore"].backupFile =
        kind === "gate" ? "gate-20261031-150000000.dpapi" : "owned-20261031-150000000.dpapi";
      expect(assessOwnedOperations(input, now).localOperationsReady).toBe(false);
    },
  );
  it("rejects a same-named but older rehearsal", () => {
    const input = fixture();
    input.reports.restore.checkedAt = "2026-11-01T15:00:00Z";
    input.reports["gate-restore"].checkedAt = "2026-11-01T15:00:00Z";
    const result = assessOwnedOperations(input, now);
    expect(result.applicationRecoveryCurrent).toBe(false);
    expect(result.gateRecoveryCurrent).toBe(false);
  });
  it.each(["application", "gate"])(
    "does not refresh an old or invalid %s archive through fresh reports",
    (kind) => {
      for (const stamp of ["20261030-150000000", "20261102-150000000", "20260230-150000000"]) {
        const input = fixture();
        const prefix = kind === "gate" ? "gate" : "owned";
        const file = `${prefix}-${stamp}.dpapi`;
        input.archives[kind] = [file];
        for (const name of kind === "gate"
          ? ["gate-backup", "gate-restore"]
          : ["backup", "restore"])
          input.reports[name].backupFile = file;
        expect(assessOwnedOperations(input, now).localOperationsReady).toBe(false);
      }
    },
  );
  it.each([
    "cleanupCompleted",
    "authHashesAndIdentitiesMatched",
    "grantsPoliciesAndFunctionsMatched",
    "allTableRowsAndShareIdsMatched",
    "syntheticCloneLoginAndWrongPassword",
    "restoredOwnerIsolationWithRealJwt",
    "isolatedOwnedRestoreVerified",
  ])("requires restore proof: %s", (name) => {
    const input = fixture();
    input.reports.restore[name] = false;
    expect(assessOwnedOperations(input, now).applicationRecoveryCurrent).toBe(false);
  });
  it("requires downloaded image counts and restore isolation", () => {
    for (const patch of [
      { restoredObjectsDownloaded: 0 },
      { runningInstallationStopped: true },
      { sourceDatabaseConnected: true },
      { providerCredentialsLoaded: true },
      { publicPorts: 1 },
      { permanentVolumesCreated: 1 },
      { originalUserPasswordsEnteredOrReset: true },
      { archiveVersion: 1 },
    ]) {
      const input = fixture();
      Object.assign(input.reports.restore, patch);
      expect(assessOwnedOperations(input, now).applicationRecoveryCurrent).toBe(false);
    }
  });
  it("requires gate credentials, integrity and writer resumption", () => {
    for (const [name, property] of [
      ["gate-restore", "integrity"],
      ["gate-restore", "credentialRecoveryVerified"],
      ["gate-restore", "cleanupCompleted"],
      ["gate-backup", "resumedAfterBackup"],
      ["gate-backup", "backupQuiesced"],
    ]) {
      const input = fixture();
      input.reports[name][property] = false;
      expect(assessOwnedOperations(input, now).localOperationsReady).toBe(false);
    }
  });
  it("supports deliberately disabled internet without allowing a tunnel without a gate", () => {
    const input = fixture();
    input.reports["ingress-control"].enabled = false;
    expect(assessOwnedOperations(input, now).internetControlsVerified).toBe(false);
    input.reports["tunnel-control"].enabled = false;
    delete input.reports["gate-backup"];
    delete input.reports["gate-restore"];
    const result = assessOwnedOperations(input, now);
    expect(result.localOperationsReady).toBe(true);
    expect(result.gateRecoveryCurrent).toBeNull();
  });
  it("does not echo unexpected fields, errors, credentials or paths", () => {
    const input = fixture();
    input.reports.backup.backupFile = "C:/private/do-not-print";
    input.reports.restore.token = "synthetic-secret-do-not-print";
    input.runtime.failure = "synthetic-secret-do-not-print";
    const result = JSON.stringify(assessOwnedOperations(input, now));
    expect(result).not.toContain("do-not-print");
    expect(result).not.toContain("C:/private");
  });
});

const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), "winesnap-operations-"));
  directories.push(directory);
  return directory;
}
describe("bounded owned report and archive reading", () => {
  it("reads only named reports and archive metadata, without decrypting archives or opening keys", async () => {
    const directory = await temporary();
    await mkdir(join(directory, "backups"));
    await mkdir(join(directory, "internet-backups"));
    await writeFile(
      join(directory, "backup-status.json"),
      '\uFEFF{"project":"winesnap-owned-local"}',
    );
    await writeFile(join(directory, "backups", appFile), "synthetic-encrypted-placeholder");
    await writeFile(
      join(directory, "internet-backups", gateFile),
      "synthetic-encrypted-placeholder",
    );
    await mkdir(join(directory, "backend.dpapi"));
    const result = await readOwnedOperations(directory);
    expect(result.reports.backup.project).toBe(project);
    expect(result.archives).toEqual({ application: [appFile], gate: [gateFile] });
  });
  it("rejects oversized or malformed reports and non-file archive entries", async () => {
    const directory = await temporary();
    await writeFile(join(directory, "backup-status.json"), "invalid-json");
    await writeFile(join(directory, "restore-status.json"), " ".repeat(65537));
    await mkdir(join(directory, "backups", appFile), { recursive: true });
    const result = await readOwnedOperations(directory);
    expect(result.reports.backup).toBeNull();
    expect(result.reports.restore).toBeNull();
    expect(result.archives.application).toBeNull();
  });
  it("rejects empty, oversized or unbounded archives", async () => {
    const directory = await temporary();
    const backups = join(directory, "backups");
    await mkdir(backups);
    const file = join(backups, appFile);
    await writeFile(file, "");
    expect((await readOwnedOperations(directory)).archives.application).toBeNull();
    await truncate(file, 131 * 1024 * 1024);
    expect((await readOwnedOperations(directory)).archives.application).toBeNull();
    await truncate(file, 1);
    for (let i = 0; i < 128; i++)
      await writeFile(join(backups, `owned-20261101-${String(i).padStart(9, "0")}.dpapi`), "x");
    expect((await readOwnedOperations(directory)).archives.application).toBeNull();
  });
  it("does not follow a redirected archive directory", async () => {
    const directory = await temporary();
    const target = await temporary();
    await writeFile(join(target, appFile), "synthetic-encrypted-placeholder");
    await symlink(
      target,
      join(directory, "backups"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect((await readOwnedOperations(directory)).archives.application).toBeNull();
  });
});
