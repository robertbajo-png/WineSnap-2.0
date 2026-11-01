import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ownedServices } from "../lib/owned-backend.mjs";
import { ownedRestoreProbeImage } from "../lib/owned-recovery.mjs";
import { ownedGateArchiveCode } from "../lib/owned-gate-archive.mjs";
import { portableLimit, sealPortable, openPortable, validatePortableBundle } from "./bundle.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.WINESNAP_PORTABLE_PIPE, "1");
assert.equal(process.argv.length, 3);
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
const action = process.argv[2];
assert.ok(["CheckSource", "Create", "Rehearse", "RecoverFiles"].includes(action));
const environment = Object.fromEntries(
  [
    "PATH",
    "PATHEXT",
    "COMSPEC",
    "SystemRoot",
    "WINDIR",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
  ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const report = {
  project: "winesnap-owned-local",
  completed: false,
  productionTouched: false,
  sourceDatabaseConnected: false,
  publicTunnelStarted: false,
  providerCredentialsLoaded: false,
  windowsDpapiRequiredForDecryption: false,
  actualOtherComputerTested: false,
};
let input, password, bundle, recovery, ciphertext, gateName, run;
let phase = "private_input";
const execute = (file, args, data, env = environment, timeout = 30000, maxBuffer = 65536) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { env, windowsHide: true, timeout, maxBuffer },
      (error, stdout) => (error ? reject(new Error("portable_child_failed")) : resolve(stdout)),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(data);
  });
const command = (args, data, timeout = 30000) =>
  execute(
    docker,
    ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
    data,
    environment,
    timeout,
    1024 * 1024,
  );
const normalize = (reference) =>
  reference.replace(/^docker\.io\/library\//, "").replace(/^docker\.io\//, "");
async function imageReferences(application) {
  const references = {};
  for (const [service, tag] of Object.entries(ownedServices)) {
    const image = JSON.parse(await command(["image", "inspect", application.images[service]]))[0];
    assert.equal(image.Id, application.images[service]);
    references[service] = image.RepoDigests?.map(normalize).find((ref) =>
      ref.startsWith(tag.split(":")[0] + "@sha256:"),
    );
    assert.ok(references[service]);
  }
  return references;
}
async function ensureImages(value, prepare) {
  for (const service of ["db", "auth", "rest", "storage"]) {
    const reference = value.imageReferences[service];
    let image;
    try {
      image = JSON.parse(await command(["image", "inspect", value.application.images[service]]))[0];
    } catch {
      assert.equal(prepare, true, "Recovery images must be prepared explicitly");
      await command(["pull", reference], undefined, 240000);
      image = JSON.parse(await command(["image", "inspect", value.application.images[service]]))[0];
    }
    assert.equal(image.Id, value.application.images[service]);
    assert.ok(image.RepoDigests?.map(normalize).includes(reference));
  }
  try {
    await command(["image", "inspect", ownedRestoreProbeImage]);
  } catch {
    assert.equal(prepare, true);
    await command(["pull", ownedRestoreProbeImage], undefined, 240000);
  }
}
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 256 * 1024 * 1024);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    bytes.fill(0);
    for (const chunk of chunks) chunk.fill(0);
    chunks.length = 0;
  }
  if (action !== "CheckSource") {
    password = Buffer.from(input.password, "base64");
    assert.equal(password.toString("base64"), input.password);
    delete input.password;
  }
  assert.match(input.run, /^[a-f0-9]{16}$/);
  run = input.run;
  if (["Create", "CheckSource"].includes(action)) {
    phase = "validate_source_snapshot";
    bundle = {
      version: 1,
      format: "winesnap-portable-age-v1",
      project: "winesnap-owned-local",
      createdAt: new Date().toISOString(),
      source: input.source,
      application: input.application,
      gate: input.gate,
      credentials: input.credentials,
      providersIncluded: false,
      imageReferences: await imageReferences(input.application),
    };
    validatePortableBundle(bundle);
    if (action === "Create") {
      phase = "encrypt_age";
      ciphertext = await sealPortable(bundle, password);
      phase = "verify_age_roundtrip";
      const reopened = await openPortable(ciphertext, password);
      assert.deepEqual(reopened, bundle);
      report.encryptedRoundtripVerified = true;
    } else report.sourceSnapshotsValidated = true;
  } else {
    phase = "decrypt_age_without_dpapi";
    ciphertext = Buffer.from(input.ciphertext, "base64");
    delete input.ciphertext;
    assert.ok(ciphertext.length <= portableLimit + 1024 * 1024);
    bundle = await openPortable(ciphertext, password);
    {
      phase = "validate_recovery_images";
      assert.equal(typeof input.prepareImages, "boolean");
      await ensureImages(bundle, input.prepareImages);
      phase = "isolated_application_restore";
      const archive = Buffer.from(JSON.stringify(bundle.application));
      let restored;
      try {
        restored = JSON.parse(
          await execute(
            process.execPath,
            [fileURLToPath(new URL("../rehearse-owned-recovery.mjs", import.meta.url))],
            archive,
            { ...environment, WINESNAP_OWNED_RESTORE_PIPE: "1", WINESNAP_OWNED_RESTORE_ID: run },
            600000,
          ),
        );
      } finally {
        archive.fill(0);
      }
      assert.equal(restored.completed, true);
      assert.equal(restored.cleanupCompleted, true);
      assert.equal(restored.isolatedOwnedRestoreVerified, true);
      assert.equal(restored.sourceDatabaseConnected, false);
      assert.equal(restored.publicPorts, 0);
      assert.equal(restored.permanentVolumesCreated, 0);
      report.applicationRestoreVerified = true;
      report.tablesVerified = restored.tablesVerified;
      report.storageFilesVerified = restored.storageFilesVerified;
      phase = "isolated_gate_restore";
      gateName = `winesnap-portable-gate-${run}`;
      const gate = JSON.parse(
        await command(
          [
            "run",
            "--rm",
            "--interactive",
            "--name",
            gateName,
            "--label",
            "winesnap.scope=owned-portable-recovery",
            "--label",
            `winesnap.portable=${run}`,
            "--network",
            "none",
            "--read-only",
            "--user",
            "1000:1000",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--log-driver",
            "none",
            "--memory",
            "256m",
            "--cpus",
            "0.5",
            "--pids-limit",
            "64",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,noexec,size=32m,uid=1000,gid=1000,mode=0700",
            "--entrypoint",
            "node",
            ownedRestoreProbeImage,
            "--input-type=module",
            "--eval",
            ownedGateArchiveCode,
          ],
          JSON.stringify({
            action: "restore",
            files: bundle.gate.files,
            manifest: bundle.gate.manifest,
          }),
        ),
      );
      assert.equal(gate.restored, true);
      assert.equal(gate.integrity, true);
      report.gateRestoreVerified = true;
      report.gateTablesVerified = gate.tables;
      report.credentialRecoveryVerified = true;
      report.cleanupCompleted = true;
      if (action === "RecoverFiles") {
        recovery = {
          application: bundle.application,
          gate: bundle.gate,
          credentials: bundle.credentials,
          source: bundle.source,
        };
        report.recoveryFilesPrepared = true;
      }
    }
  }
  report.completed = true;
} catch {
  report.failure = "portable_backup_not_accepted";
  report.phase = phase;
} finally {
  if (gateName) {
    try {
      const value = JSON.parse(await command(["inspect", gateName]))[0];
      assert.equal(value.Name, `/${gateName}`);
      assert.equal(value.Config.Labels["winesnap.portable"], run);
      assert.equal(value.Config.Labels["winesnap.scope"], "owned-portable-recovery");
      assert.equal(value.HostConfig.NetworkMode, "none");
      assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
      assert.equal(
        value.Mounts.every((m) => m.Type === "tmpfs"),
        true,
      );
      await command(["rm", "--force", gateName]);
    } catch {
      // A successful --rm helper no longer exists; distinguish it from failed cleanup.
      const exists = await command([
        "ps",
        "--all",
        "--filter",
        `name=^/${gateName}$`,
        "--format",
        "{{.ID}}",
      ]);
      if (exists.trim()) {
        report.cleanupCompleted = false;
        report.completed = false;
        report.failure = "portable_cleanup_not_verified";
      }
    }
  }
  password?.fill(0);
  password = undefined;
  input = undefined;
  bundle = undefined;
  console.log(
    JSON.stringify({
      report,
      ...(report.completed && action === "Create"
        ? { ciphertext: ciphertext.toString("base64") }
        : {}),
      ...(report.completed && recovery ? { recovery } : {}),
    }),
  );
  ciphertext?.fill(0);
  recovery = undefined;
  if (!report.completed) process.exitCode = 1;
}
