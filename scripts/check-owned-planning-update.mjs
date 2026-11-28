import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ownedApp, ownedProject } from "./lib/owned-backend.mjs";
import { inspectOwnedContainers } from "./lib/owned-installed-state.mjs";
import { ownedResumeOrder } from "./lib/owned-lifecycle.mjs";
import { assessOwnedOperations, readOwnedOperations } from "./lib/owned-operations.mjs";
import {
  assessPlanningLedger,
  ownedContainerProjection,
  planningLedgerQuery,
  planningRollbackTag,
} from "./lib/owned-planning-preflight.mjs";
import {
  assessPantryLedger,
  pantryLedgerQuery,
  pantryRollbackTag,
} from "./lib/owned-pantry-preflight.mjs";
import { readOwnedRuntimeStatus } from "./lib/owned-runtime-status.mjs";
import { ownedConnectorName } from "./lib/owned-tunnel.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const systemEnv = Object.fromEntries(
  [
    "PATH",
    "Path",
    "PATHEXT",
    "COMSPEC",
    "SystemRoot",
    "WINDIR",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
  ].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])),
);
const names = ownedResumeOrder.map((name) => "winesnap-owned-" + name);
const pantry = process.argv[2] === "--pantry";

function command(binary, args) {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { cwd: root, env: systemEnv, windowsHide: true, timeout: 20000, maxBuffer: 256 * 1024 },
      (error, stdout) =>
        error ? reject(new Error("bounded_inspection_failed")) : resolve(stdout.trim()),
    );
  });
}

const report = {
  project: ownedProject,
  scope: pantry ? "dev07_owned_pantry_preflight" : "dev06_owned_planning_preflight",
  readOnly: true,
  productionTouched: false,
  hostedTestTouched: false,
  updateAuthorized: false,
  completed: false,
};
let phase = "platform";
try {
  assert.equal(process.platform, "win32");
  assert.equal(process.argv.length, pantry ? 3 : 2);
  const binary = join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe");
  const docker = (...args) =>
    command(binary, ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args]);
  phase = "candidate_source";
  const candidate = await command("git", ["rev-parse", "HEAD"]);
  assert.match(candidate, /^[a-f0-9]{40}$/);
  report.candidate = candidate;
  report.checkoutClean =
    (await command("git", ["status", "--porcelain=v1", "--untracked-files=normal"])) === "";
  const path = join(root, "supabase/migrations");
  const sources = [];
  for (const name of (await readdir(path)).filter((item) => item.endsWith(".sql")))
    sources.push({ name, source: await readFile(join(path, name), "utf8") });

  phase = "owned_container_identity";
  assert.equal(await docker("version", "--format", "{{.Server.Os}}"), "linux");
  const entries = (
    await docker("inspect", "--type", "container", "--format", ownedContainerProjection, ...names)
  )
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const installation = entries.find((item) => item.Name === "/winesnap-owned-db")?.Config.Labels[
    "winesnap.installation"
  ];
  const services = await inspectOwnedContainers(async (args) => {
    assert.deepEqual(args, ["inspect", ...names]);
    return entries;
  }, installation);
  assert.ok([...services.values()].every((value) => value.State.Running === true));
  const db = services.get("winesnap-owned-db");
  const web = services.get("winesnap-owned-web");
  const labels = web.Config.Labels;
  assert.ok(["dark-v1", "classic-v1"].includes(labels["winesnap.pilot-ui"]));
  assert.ok(["", "https://winesnap.boleoai.se"].includes(labels["winesnap.public-origin"]));
  report.pilotUi = labels["winesnap.pilot-ui"];
  report.retainedOriginLabel = Boolean(labels["winesnap.public-origin"]);

  phase = "owned_migration_ledger";
  const ledger = JSON.parse(
    await docker(
      "exec",
      db.Id,
      "psql",
      "-h",
      "/tmp",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      pantry ? pantryLedgerQuery : planningLedgerQuery,
    ),
  );
  report.migration = (pantry ? assessPantryLedger : assessPlanningLedger)(
    sources,
    ledger,
    installation,
  );

  phase = "rollback_and_health";
  report.rollbackImageTag = (pantry ? pantryRollbackTag : planningRollbackTag)(web.Image);
  assert.equal(await docker("image", "inspect", "--format", "{{.Id}}", web.Image), web.Image);
  report.rollbackImageAvailable = true;
  report.rollbackTagMatches = await docker(
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    report.rollbackImageTag,
  ).then(
    (value) => value === web.Image,
    () => false,
  );
  const health = await fetch(ownedApp + "/api/health", {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  report.loopbackHealth = health.status === 200;
  await health.body?.cancel();
  const observation = await readOwnedOperations(join(homedir(), "WineSnapOwned"));
  const runtime = await readOwnedRuntimeStatus(root);
  const operations = assessOwnedOperations({ ...observation, runtime });
  report.supervisorVerified = operations.runtimeHealthy;
  report.latestBackupAndRestoreCurrent = operations.applicationRecoveryCurrent;
  report.privateIngressEnabled = observation.reports["ingress-control"]?.enabled === true;
  const runningConnector = await docker(
    "ps",
    "--filter",
    `name=^/${ownedConnectorName}$`,
    "--format",
    "{{.Names}}",
  );
  report.publicTunnelPausedVerified =
    operations.internetControlsVerified &&
    observation.reports["tunnel-control"]?.enabled === false &&
    runningConnector === "";
  report.completed = true;
  report.remaining = [
    ...(!report.checkoutClean ? ["clean_candidate_source"] : []),
    ...(!report.loopbackHealth || !report.supervisorVerified ? ["verify_healthy_runtime"] : []),
    ...(!report.publicTunnelPausedVerified ? ["verify_paused_public_tunnel"] : []),
    ...(!report.rollbackTagMatches ? ["pin_exact_previous_web_image"] : []),
    ...(pantry ? ["verify_guarded_pantry_update_path"] : []),
    "rehearse_web_only_rollback_with_candidate_schema",
    "verify_exact_new_preupdate_backup_and_isolated_restore",
    "local_delivery_approval_and_owner_acceptance",
  ];
} catch {
  report.failure = phase;
}
report.checkedAt = new Date().toISOString();
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.completed ? 0 : 1;
