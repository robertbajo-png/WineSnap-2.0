import { lstat, readdir } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { readBoundedJson } from "./release-readiness.mjs";

const project = "winesnap-owned-local";
const hour = 3600000;
const archivePatterns = {
  application: /^owned-\d{8}-\d{9}\.dpapi$/,
  gate: /^gate-\d{8}-\d{9}\.dpapi$/,
};
const reports = [
  "maintain",
  "backup",
  "restore",
  "gate-backup",
  "gate-restore",
  "ingress-control",
  "tunnel-control",
];

export async function readOwnedOperations(directory) {
  const values = {};
  for (const name of reports)
    values[name] = (await readBoundedJson(join(directory, `${name}-status.json`))).value;
  const archives = {};
  for (const [kind, folder, limit] of [
    ["application", "backups", 130 * 1024 * 1024],
    ["gate", "internet-backups", 32 * 1024 * 1024],
  ]) {
    try {
      const path = resolve(directory, folder);
      for (let current = path; current !== parse(current).root; current = dirname(current)) {
        if ((await lstat(current)).isSymbolicLink()) throw new Error("redirected_path");
      }
      const names = (await readdir(path)).filter((name) => archivePatterns[kind].test(name));
      if (names.length > 128) throw new Error("unbounded_inventory");
      for (const name of names) {
        const file = await lstat(join(path, name));
        if (!file.isFile() || file.isSymbolicLink() || file.size < 1 || file.size > limit)
          throw new Error("invalid_archive");
      }
      archives[kind] = names.sort().reverse();
    } catch {
      archives[kind] = null;
    }
  }
  return { reports: values, archives };
}

// These are advisory report checks, not a new restore or public-release approval.
export function assessOwnedOperations(input, now = Date.now()) {
  const issues = [];
  const check = (condition, code) => {
    if (!condition) issues.push(code);
    return Boolean(condition);
  };
  const values = input?.reports ?? {};
  const inventories = input?.archives ?? {};
  const timestamp = (value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
  const recent = (value, age) => {
    const time = timestamp(value?.checkedAt);
    return Number.isFinite(time) && time <= now + 300000 && now - time <= age;
  };
  const scoped = (value) =>
    value?.project === project && value.productionTouched === false && !value.skipped;
  const completed = (value, age, gate = false) =>
    scoped(value) &&
    value.completed === true &&
    recent(value, age) &&
    (gate
      ? value.publicTunnelStarted === false &&
        value.dnsChanged === false &&
        value.publishedPorts === 0
      : value.hostedTestTouched === false);
  const archive = (kind, value) => {
    const names = inventories[kind];
    const parts = /^(?:owned|gate)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(\d{3})\.dpapi$/.exec(
      value?.backupFile ?? "",
    );
    const issuedAt = parts
      ? `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.${parts[7]}Z`
      : "";
    const issuedTime = Date.parse(issuedAt);
    const currentName =
      Number.isFinite(issuedTime) &&
      new Date(issuedTime).toISOString() === issuedAt &&
      issuedTime <= now + 300000 &&
      now - issuedTime <= 26 * hour;
    return (
      currentName &&
      Array.isArray(names) &&
      names.length > 0 &&
      names.every((name) => typeof name === "string" && archivePatterns[kind].test(name)) &&
      archivePatterns[kind].test(value?.backupFile ?? "") &&
      [...names].sort().reverse()[0] === value.backupFile
    );
  };
  const afterBackup = (restore, backup) =>
    timestamp(restore?.checkedAt) >= timestamp(backup?.checkedAt) - 300000;
  const runtime = input?.runtime;
  const runtimeHealthy = check(
    scoped(runtime) &&
      runtime.readOnly === true &&
      runtime.healthy === true &&
      recent(runtime, 300000) &&
      [
        "heartbeatFresh",
        "jobsHealthy",
        "currentSupervisorVersion",
        "privateIngressHealthy",
        "publicTunnelHealthy",
        "taskVerified",
        "taskRunning",
        "supervisorRunning",
      ].every((name) => runtime[name] === true),
    "runtime_not_verified",
  );
  const maintenance = values.maintain;
  const maintenanceCurrent = check(
    completed(maintenance, 2 * hour) &&
      ["privacy", "prices"].every((name) => {
        const job = maintenance.jobs?.[name];
        return job?.status === 200 && job.failed === 0 && job.remaining === 0;
      }),
    "maintenance_not_current",
  );
  const backup = values.backup;
  const backupCurrent = check(
    completed(backup, 26 * hour) &&
      archive("application", backup) &&
      backup.encryptedRoundtripVerified === true &&
      backup.backupIncludesAuthHashes === true &&
      backup.backupIncludesImageBytes === true,
    "application_backup_not_current",
  );
  const restore = values.restore;
  const restoreCurrent = check(
    backupCurrent &&
      completed(restore, 26 * hour) &&
      afterBackup(restore, backup) &&
      restore.backupFile === backup.backupFile &&
      restore.archiveVersion === 2 &&
      restore.cleanupCompleted === true &&
      restore.isolatedOwnedRestoreVerified === true &&
      restore.runningInstallationStopped === false &&
      restore.sourceDatabaseConnected === false &&
      restore.providerCredentialsLoaded === false &&
      restore.publicPorts === 0 &&
      restore.permanentVolumesCreated === 0 &&
      restore.originalUserPasswordsEnteredOrReset === false &&
      [
        "authHashesAndIdentitiesMatched",
        "grantsPoliciesAndFunctionsMatched",
        "allTableRowsAndShareIdsMatched",
        "syntheticCloneLoginAndWrongPassword",
        "restoredOwnerIsolationWithRealJwt",
      ].every((name) => restore[name] === true) &&
      Number.isSafeInteger(restore.tablesVerified) &&
      restore.tablesVerified > 0 &&
      Number.isSafeInteger(restore.storageFilesVerified) &&
      restore.storageFilesVerified >= 0 &&
      restore.restoredObjectsDownloaded === restore.storageFilesVerified,
    "application_restore_not_current",
  );
  const ingress = values["ingress-control"];
  const tunnel = values["tunnel-control"];
  const control = (value) =>
    value?.project === project &&
    typeof value.enabled === "boolean" &&
    recent(value, Number.MAX_SAFE_INTEGER);
  const controlsVerified = check(
    control(ingress) && control(tunnel) && !(tunnel.enabled && !ingress.enabled),
    "internet_controls_not_verified",
  );
  let gateRecoveryCurrent = null;
  if (controlsVerified && ingress.enabled) {
    const gateBackup = values["gate-backup"];
    const gateRestore = values["gate-restore"];
    const gateBackupCurrent = check(
      completed(gateBackup, 26 * hour, true) &&
        archive("gate", gateBackup) &&
        gateBackup.backupQuiesced === true &&
        gateBackup.resumedAfterBackup === true &&
        gateBackup.encryptedRoundtripVerified === true,
      "gate_backup_not_current",
    );
    gateRecoveryCurrent = check(
      gateBackupCurrent &&
        completed(gateRestore, 26 * hour, true) &&
        afterBackup(gateRestore, gateBackup) &&
        gateRestore.backupFile === gateBackup.backupFile &&
        gateRestore.restored === true &&
        gateRestore.integrity === true &&
        gateRestore.cleanupCompleted === true &&
        gateRestore.credentialRecoveryVerified === true &&
        Number.isSafeInteger(gateRestore.tables) &&
        gateRestore.tables > 0 &&
        Number.isSafeInteger(gateRestore.files) &&
        gateRestore.files > 0,
      "gate_restore_not_current",
    );
  }
  return {
    project,
    readOnly: true,
    productionTouched: false,
    publicReleaseAssessed: false,
    localOperationsReady: issues.length === 0,
    runtimeHealthy,
    maintenanceCurrent,
    applicationRecoveryCurrent: backupCurrent && restoreCurrent,
    internetControlsVerified: controlsVerified,
    gateRecoveryCurrent,
    applicationBackup: backupCurrent ? backup.backupFile : null,
    gateBackup: gateRecoveryCurrent ? values["gate-backup"].backupFile : null,
    issues,
    notAssessed: [
      "portable_off_device_recovery",
      "external_email_delivery",
      "physical_mobile_and_cellular",
      "windows_cold_boot",
      "supplier_and_public_release_approval",
    ],
    checkedAt: Number.isFinite(now) ? new Date(now).toISOString() : null,
  };
}
