import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkOwnedContainer, ownedEgress, ownedScope } from "./lib/owned-backend.mjs";
import { ownedGateUsers, ownedGateImage } from "./lib/owned-gate.mjs";
import { ownedGateArchiveCode } from "./lib/owned-gate-archive.mjs";
import { ownedDeviceGateConfiguration } from "./lib/owned-device-gate.mjs";
import { ownedConnectorName, checkOwnedTunnelContainer } from "./lib/owned-tunnel.mjs";
import {
  privateIngress,
  validateOwnedGateKeys,
  gateEntrypoint,
  checkPrivateIngressContainer,
  checkPrivateIngressNetwork,
  checkPrivateIngressVolume,
} from "./lib/owned-private-ingress.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.WINESNAP_OWNED_INGRESS_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.equal(process.argv.length, 3);
const action = process.argv[2];
assert.ok(
  ["Install", "Resume", "Restart", "Verify", "Stop", "Backup", "Rehearse"].includes(action),
);
const report = {
  project: "winesnap-owned-local",
  completed: false,
  productionTouched: false,
  publicTunnelStarted: false,
  dnsChanged: false,
  publishedPorts: 0,
};
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const configPath = fileURLToPath(
  new URL("../config/owned-windows/gated-internet.conf", import.meta.url),
);
let phase = "private_input";
let gateKeys;
let installationId;
let expected;
let archive;
const paused = [];
const deadline = performance.now() + 240000;
const command = (args, input) =>
  new Promise((resolve, reject) => {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) return reject(new Error("private_ingress_deadline"));
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        windowsHide: true,
        timeout: Math.min(remaining, 30000),
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, output) =>
        error ? reject(new Error("private_ingress_command_failed")) : resolve(output),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
const inspect = async (name) => JSON.parse(await command(["inspect", name]))[0];
const labels = () => [
  "--label",
  `winesnap.scope=${ownedScope}`,
  "--label",
  `winesnap.installation=${installationId}`,
  "--label",
  `winesnap.component=${privateIngress.marker}`,
];
async function existing(service) {
  const name = privateIngress[service];
  const found = (
    await command(["ps", "--all", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"])
  ).trim();
  if (!found) return undefined;
  const value = await inspect(found);
  checkPrivateIngressContainer(value, service, installationId, expected);
  return value;
}
async function network(name) {
  const found = (
    await command(["network", "ls", "--filter", `name=^${name}$`, "--format", "{{.Name}}"])
  ).trim();
  if (!found) {
    assert.equal(action, "Install", "Explicit installation is required");
    await command(["network", "create", "--internal", ...labels(), name]);
  }
  const info = JSON.parse(await command(["network", "inspect", name]))[0];
  checkPrivateIngressNetwork(info, name, installationId);
  if (Object.values(info.Containers ?? {}).some((c) => c.Name === ownedConnectorName))
    checkOwnedTunnelContainer(await inspect(ownedConnectorName), installationId);
}
async function volume() {
  const found = (
    await command([
      "volume",
      "ls",
      "--filter",
      `name=^${privateIngress.volume}$`,
      "--format",
      "{{.Name}}",
    ])
  ).trim();
  if (!found) {
    assert.equal(action, "Install", "Explicit installation is required");
    await command(["volume", "create", ...labels(), privateIngress.volume]);
    await command([
      "run",
      "--rm",
      ...labels(),
      "--network",
      "none",
      "--read-only",
      "--user",
      "0",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "CHOWN",
      "--cap-add",
      "FOWNER",
      "--security-opt",
      "no-new-privileges:true",
      "--log-driver",
      "none",
      "--mount",
      `type=volume,source=${privateIngress.volume},target=/data`,
      "--entrypoint",
      "/bin/sh",
      ownedGateImage,
      "-c",
      "chown 1000:1000 /data && chmod 700 /data",
    ]);
  }
  checkPrivateIngressVolume(
    JSON.parse(await command(["volume", "inspect", privateIngress.volume]))[0],
    installationId,
  );
}
async function create(service) {
  const user = service === "gate" ? "1000:1000" : "101";
  const uid = service === "gate" ? "1000" : "101";
  await command([
    "create",
    "--name",
    privateIngress[service],
    ...labels(),
    "--label",
    `winesnap.config=${expected.fingerprint}`,
    "--network",
    service === "gate" ? privateIngress.gateNetwork : privateIngress.ingressNetwork,
    "--restart",
    "unless-stopped",
    "--read-only",
    "--user",
    user,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--log-driver",
    "none",
    "--memory",
    service === "gate" ? "256m" : "64m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "128",
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,noexec,size=32m,uid=${uid},gid=${uid},mode=0700`,
    "--mount",
    service === "gate"
      ? `type=volume,source=${privateIngress.volume},target=/var/lib/authelia`
      : `type=bind,source=${configPath},target=/etc/nginx/nginx.conf,readonly`,
    "--entrypoint",
    service === "gate" ? "/bin/sh" : "nginx",
    service === "gate" ? ownedGateImage : expected.proxyImage,
    ...(service === "gate" ? ["-c", gateEntrypoint] : ["-g", "daemon off;"]),
  ]);
  if (service === "proxy")
    for (const network of [privateIngress.gateNetwork, ownedEgress])
      await command(["network", "connect", network, privateIngress.proxy]);
  await existing(service);
}
async function installRamConfiguration() {
  const name = privateIngress.gate;
  // tmpfs is empty after a container restart. Never overwrite a running configuration.
  const ready = await command([
    "exec",
    name,
    "/bin/sh",
    "-c",
    "if [ -f /tmp/gate/ready ]; then echo ready; else echo empty; fi",
  ]);
  if (ready.trim() === "ready") return;
  await command(["exec", name, "mkdir", "-p", "/tmp/gate"]);
  for (const [file, value] of [
    [
      "configuration.yml",
      ownedDeviceGateConfiguration(gateKeys, process.env.WINESNAP_OWNED_DEVICE_ACCESS === "1"),
    ],
    ["users.json", ownedGateUsers(gateKeys.passwordHash)],
  ])
    await command(
      ["exec", "--interactive", name, "/bin/sh", "-c", `umask 077; cat > /tmp/gate/${file}`],
      JSON.stringify(value),
    );
  await command([
    "exec",
    name,
    "authelia",
    "config",
    "validate",
    "--config",
    "/tmp/gate/configuration.yml",
  ]);
  await command(["exec", name, "touch", "/tmp/gate/ready"]);
}
async function checkDenial() {
  const probe = `import http from 'node:http';
    const paths=['/','/login','/api/health','/backend/auth/v1/health','/backend/rest/v1/','/backend/storage/v1/status','/api/wine-image'];
    const get=path=>new Promise((resolve,reject)=>{const q=http.get('http://winesnap-owned-internet:8080'+path,{headers:{Host:'winesnap.boleoai.se',Cookie:'__Secure-winesnap_gate=forged','Remote-User':'robert'},timeout:7000},r=>{r.resume();resolve({status:r.statusCode,location:r.headers.location,cache:r.headers['cache-control']});});q.on('error',reject);q.on('timeout',()=>q.destroy(new Error()));});
    let ok=false;for(let i=0;i<20;i++){try{ok=(await get('/gate/api/health')).status===200;}catch{}if(ok)break;await new Promise(r=>setTimeout(r,500));}if(!ok)throw Error();
    for(const path of paths){const r=await get(path);if(r.status!==302||!r.location?.startsWith('https://winesnap.boleoai.se/gate')||!r.cache?.includes('no-store'))throw Error();}
    console.log(JSON.stringify({denials:paths.length}));`;
  return JSON.parse(
    await command(
      ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
      probe,
    ),
  );
}
async function archiveHelper(webImage, data, readVolume = false) {
  const id = randomBytes(8).toString("hex");
  const helper = `winesnap-owned-gate-archive-${id}`;
  try {
    return JSON.parse(
      await command(
        [
          "run",
          "--rm",
          "--interactive",
          "--name",
          helper,
          ...labels(),
          "--label",
          `winesnap.archive-check=${id}`,
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
          ...(readVolume
            ? ["--mount", `type=volume,source=${privateIngress.volume},target=/data,readonly`]
            : []),
          "--entrypoint",
          "node",
          webImage,
          "--input-type=module",
          "--eval",
          ownedGateArchiveCode,
        ],
        JSON.stringify(data),
      ),
    );
  } finally {
    const found = (
      await command(["ps", "--all", "--filter", `name=^/${helper}$`, "--format", "{{.ID}}"])
    ).trim();
    if (found) {
      const value = await inspect(found);
      assert.equal(value.Name, `/${helper}`);
      assert.equal(value.Config.Labels["winesnap.archive-check"], id);
      assert.equal(value.Config.Labels["winesnap.installation"], installationId);
      assert.equal(value.HostConfig.NetworkMode, "none");
      assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
      await command(["rm", "--force", helper]);
    }
  }
}
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= (action === "Rehearse" ? 32 * 1024 * 1024 : 16384));
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  let payload;
  try {
    payload = JSON.parse(input.toString());
  } finally {
    input.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
  assert.deepEqual(
    Object.keys(payload).sort(),
    action === "Rehearse" ? ["archive", "gate", "installationId"] : ["gate", "installationId"],
  );
  installationId = payload.installationId;
  assert.match(installationId, /^[a-f0-9]{32}$/);
  if (["Stop", "Verify", "Rehearse"].includes(action)) assert.equal(payload.gate, null);
  else gateKeys = validateOwnedGateKeys(payload.gate);
  if (action === "Rehearse") {
    archive = payload.archive;
    assert.equal(archive.version, 1);
    assert.equal(archive.project, "winesnap-owned-local");
    assert.equal(archive.installationId, installationId);
    assert.equal(archive.format, "owned-private-gate-sqlite-v1");
  }
  payload = undefined;
  phase = "verify_owned_services";
  for (const name of ["winesnap-owned-web", "winesnap-owned-gateway"]) {
    const found = await inspect(name);
    checkOwnedContainer(found, name, installationId);
    if (action !== "Stop") assert.ok(found.State.Running);
  }
  const gateway = await inspect("winesnap-owned-gateway");
  const webImage = (await inspect("winesnap-owned-web")).Image;
  if (action === "Rehearse") {
    phase = "isolated_gate_restore";
    Object.assign(
      report,
      await archiveHelper(webImage, {
        action: "restore",
        files: archive.files,
        manifest: archive.manifest,
      }),
    );
    report.completed = true;
    report.cleanupCompleted = true;
    report.portableRecoveryVerified = false;
    archive = undefined;
  } else {
    expected = {
      configPath,
      proxyImage: gateway.Image,
      fingerprint: createHash("sha256")
        .update(await readFile(configPath))
        .update(await readFile(new URL("./lib/owned-gate.mjs", import.meta.url)))
        .update(gateEntrypoint)
        .digest("hex"),
    };
    const egress = JSON.parse(await command(["network", "inspect", ownedEgress]))[0];
    assert.equal(egress.Name, ownedEgress);
    assert.equal(egress.Labels["winesnap.scope"], ownedScope);
    assert.equal(egress.Labels["winesnap.installation"], installationId);
    phase = "validate_private_resources";
    // Validate both existing containers before making any lifecycle change.
    for (const service of ["gate", "proxy"]) await existing(service);
    for (const name of [privateIngress.gateNetwork, privateIngress.ingressNetwork])
      await network(name);
    await volume();
    if (action === "Install") {
      for (const service of ["gate", "proxy"])
        if (!(await existing(service))) await create(service);
    }
    for (const service of ["gate", "proxy"]) assert.ok(await existing(service));
    if (action === "Backup") {
      phase = "gate_backup_quiesce";
      for (const service of ["proxy", "gate"]) assert.ok((await existing(service)).State.Running);
      for (const service of ["proxy", "gate"])
        if ((await existing(service)).State.Running) {
          paused.push(service);
          await command(["stop", "--time", "5", privateIngress[service]]);
        }
      const data = await archiveHelper(webImage, { action: "read" }, true);
      archive = {
        version: 1,
        project: "winesnap-owned-local",
        installationId,
        format: "owned-private-gate-sqlite-v1",
        createdAt: new Date().toISOString(),
        ...data,
      };
      report.backupQuiesced = true;
      report.backupFiles = data.files.length;
    }
    if (action !== "Backup") {
      if (action === "Stop" || action === "Restart") {
        phase = "stop_private_ingress";
        for (const service of ["proxy", "gate"])
          if ((await existing(service)).State.Running)
            await command(["stop", "--time", "5", privateIngress[service]]);
      }
      if (action === "Stop") {
        report.stopped = true;
      } else {
        phase = "resume_private_ingress";
        for (const service of ["gate", "proxy"]) {
          const found = await existing(service);
          if (action === "Verify") assert.ok(found.State.Running);
          else {
            if (!found.State.Running) await command(["start", privateIngress[service]]);
            if (service === "gate") await installRamConfiguration();
          }
        }
        phase = "anonymous_denial_verification";
        Object.assign(report, await checkDenial());
        report.durableRegulationStorage = true;
      }
    }
    report.completed = true;
  }
} catch {
  report.failure = "private_ingress_not_ready";
  report.phase = phase;
} finally {
  for (const service of paused.reverse()) {
    try {
      await existing(service);
      await command(["start", privateIngress[service]]);
      if (service === "gate") await installRamConfiguration();
    } catch {
      report.completed = false;
      report.failure = "gate_backup_resume_failed";
    }
  }
  if (paused.length && report.completed) {
    try {
      await checkDenial();
      report.resumedAfterBackup = true;
    } catch {
      report.completed = false;
      report.failure = "gate_backup_resume_not_verified";
    }
  }
  gateKeys = undefined;
  console.log(
    JSON.stringify(action === "Backup" && report.completed ? { report, archive } : report),
  );
  if (!report.completed) process.exitCode = 1;
}
