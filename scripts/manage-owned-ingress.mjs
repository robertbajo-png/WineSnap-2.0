import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkOwnedContainer, ownedEgress, ownedScope } from "./lib/owned-backend.mjs";
import { ownedGateConfiguration, ownedGateUsers, ownedGateImage } from "./lib/owned-gate.mjs";
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
assert.ok(["Install", "Resume", "Restart", "Verify", "Stop"].includes(action));
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
        maxBuffer: 4 * 1024 * 1024,
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
  checkPrivateIngressNetwork(
    JSON.parse(await command(["network", "inspect", name]))[0],
    name,
    installationId,
  );
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
    ["configuration.yml", ownedGateConfiguration(gateKeys, { persistent: true })],
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
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 16384);
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
  assert.deepEqual(Object.keys(payload).sort(), ["gate", "installationId"]);
  installationId = payload.installationId;
  assert.match(installationId, /^[a-f0-9]{32}$/);
  if (["Stop", "Verify"].includes(action)) assert.equal(payload.gate, null);
  else gateKeys = validateOwnedGateKeys(payload.gate);
  payload = undefined;
  phase = "verify_owned_services";
  for (const name of ["winesnap-owned-web", "winesnap-owned-gateway"]) {
    const found = await inspect(name);
    checkOwnedContainer(found, name, installationId);
    if (action !== "Stop") assert.ok(found.State.Running);
  }
  const gateway = await inspect("winesnap-owned-gateway");
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
    for (const service of ["gate", "proxy"]) if (!(await existing(service))) await create(service);
  }
  for (const service of ["gate", "proxy"]) assert.ok(await existing(service));
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
  report.completed = true;
} catch {
  report.failure = "private_ingress_not_ready";
  report.phase = phase;
} finally {
  gateKeys = undefined;
  console.log(JSON.stringify(report));
  if (!report.completed) process.exitCode = 1;
}
