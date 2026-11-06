import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import {
  snapshotProject,
  snapshotRestoreSql,
  validateSnapshot,
  snapshotTablesFor,
} from "./lib/snapshot-recovery.mjs";

assert.equal(process.argv.length, 2);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const invocation = process.env.WINESNAP_RESTORE_ID ?? randomUUID().replaceAll("-", "").slice(0, 16);
assert.match(invocation, /^[a-f0-9]{16}$/);
const name = `winesnap-snapshot-restore-${invocation}`;
const scope = "local-snapshot-restore";
let container;
let phase = "input";
const report = {
  project: snapshotProject,
  completed: false,
  fullDatabaseBackup: false,
  productionTouched: false,
  scope: "application SQL and image-byte restore; mocked Auth/Storage platform, no password hashes",
  schemaSource: "repository migrations",
  cleanupCompleted: false,
};
async function command(args, input) {
  const child = execFile(docker, ["--context", "desktop-linux", ...args], {
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const output = new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (part) => {
      stdout += part;
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error("isolated_restore_command_failed")),
    );
  });
  child.stdin.on("error", () => {});
  child.stdin.end(input ?? "");
  return output;
}
try {
  const chunks = [];
  let length = 0;
  for await (const part of process.stdin) {
    length += part.length;
    assert.ok(length <= 80 * 1024 * 1024);
    chunks.push(part);
  }
  const snapshot = validateSnapshot(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  chunks.length = 0;
  phase = "engine";
  const context = JSON.parse(await command(["context", "inspect", "desktop-linux"]));
  assert.equal(context[0].Endpoints.docker.Host, "npipe:////./pipe/dockerDesktopLinuxEngine");
  phase = "image";
  const image = (
    await command(["image", "inspect", "postgres:17-bookworm", "--format", "{{.Id}}"])
  ).trim();
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  phase = "isolated_database";
  container = (
    await command([
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      `winesnap.scope=${scope}`,
      "--network",
      "none",
      "--read-only",
      "--user",
      "postgres",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--pids-limit",
      "64",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=256m,uid=999,gid=999,mode=0700",
      "--tmpfs",
      "/var/run/postgresql:rw,noexec,nosuid,nodev,size=1m,uid=999,gid=999,mode=0770",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=64m,uid=999,gid=999,mode=0700",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      image,
    ])
  ).trim();
  assert.match(container, /^[a-f0-9]{64}$/);
  const isolated = JSON.parse(await command(["inspect", container]))[0];
  assert.equal(isolated.HostConfig.NetworkMode, "none");
  assert.equal(isolated.HostConfig.ReadonlyRootfs, true);
  assert.equal(isolated.Config.User, "postgres");
  assert.equal(isolated.Mounts.length, 0);
  assert.equal(Object.keys(isolated.HostConfig.PortBindings ?? {}).length, 0);
  assert.ok(isolated.HostConfig.CapDrop.includes("ALL"));
  for (let attempt = 0; ; attempt++) {
    try {
      await command(["exec", container, "pg_isready", "-U", "postgres"]);
      break;
    } catch {
      if (attempt >= 30) throw new Error("isolated_database_not_ready");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  phase = "schema";
  const migrations = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let schema = await readFile(
    new URL("../supabase/tests/bootstrap.local.sql", import.meta.url),
    "utf8",
  );
  for (const migration of migrations)
    schema +=
      "\n" +
      (await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  const psql = [
    "exec",
    "--interactive",
    container,
    "psql",
    "-X",
    "-q",
    "-t",
    "-A",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  await command(psql, schema);
  phase = "restore";
  const result = JSON.parse((await command(psql, snapshotRestoreSql(snapshot))).trim());
  assert.equal(result.tables, snapshotTablesFor(snapshot.version).length);
  Object.assign(report, result, { completed: true });
} catch {
  report.failure = "isolated_application_restore_failed";
  report.phase = phase;
  process.exitCode = 1;
} finally {
  if (container) {
    try {
      const identity = (
        await command([
          "inspect",
          "--format",
          '{{index .Config.Labels "winesnap.scope"}}|{{.HostConfig.NetworkMode}}',
          container,
        ])
      ).trim();
      assert.equal(identity, `${scope}|none`);
      await command(["rm", "--force", container]);
      report.cleanupCompleted = true;
    } catch {
      report.completed = false;
      report.cleanupCompleted = false;
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ ...report, checkedAt: new Date().toISOString() }));
}
