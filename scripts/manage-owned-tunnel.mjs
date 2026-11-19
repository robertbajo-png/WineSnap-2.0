import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { checkOwnedContainer, ownedScope } from "./lib/owned-backend.mjs";
import { ownedIngressNetwork, ownedInternetOrigin } from "./lib/owned-internet.mjs";
import {
  privateIngress,
  checkPrivateIngressNetwork,
  checkPrivateIngressLabels,
} from "./lib/owned-private-ingress.mjs";
import {
  ownedConnectorName,
  ownedConnectorEgress,
  ownedConnectorMarker,
  ownedConnectorTag,
  approvedTunnelId,
  checkOwnedTunnelContainer,
  validateOwnedTunnelStore,
  checkOwnedConnectorNetwork,
} from "./lib/owned-tunnel.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.WINESNAP_OWNED_TUNNEL_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.equal(process.argv.length, 3);
const action = process.argv[2];
assert.ok(["Install", "Resume", "Verify", "Stop"].includes(action));
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const report = {
  project: "winesnap-owned-local",
  completed: false,
  productionTouched: false,
  dnsChanged: false,
  publishedPorts: 0,
};
let phase = "private_input";
let installationId;
let store;
const command = (args, input, timeout = 30000) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        timeout,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, output) =>
        error ? reject(new Error("owned_connector_command_failed")) : resolve(output),
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
  `winesnap.component=${ownedConnectorMarker}`,
];
async function preflight() {
  for (const name of ["winesnap-owned-web", "winesnap-owned-gateway", "winesnap-owned-auth"]) {
    const value = await inspect(name);
    checkOwnedContainer(value, name, installationId);
    assert.ok(value.State.Running);
    if (name === "winesnap-owned-web")
      assert.equal(value.Config.Labels["winesnap.public-origin"], ownedInternetOrigin);
    if (name === "winesnap-owned-auth") {
      assert.ok(value.Config.Env.includes("GOTRUE_SITE_URL=" + ownedInternetOrigin));
      assert.ok(value.Config.Env.includes("API_EXTERNAL_URL=" + ownedInternetOrigin + "/backend"));
      assert.ok(
        value.Config.Env.includes("GOTRUE_MAILER_URLPATHS_CONFIRMATION=/backend/auth/v1/verify"),
      );
    }
  }
  for (const name of [privateIngress.gate, privateIngress.proxy]) {
    const value = await inspect(name);
    checkPrivateIngressLabels(value.Config.Labels, installationId);
    assert.ok(value.State.Running);
    assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
  }
  const network = JSON.parse(await command(["network", "inspect", ownedIngressNetwork]))[0];
  checkPrivateIngressNetwork(network, ownedIngressNetwork, installationId);
  const probe = `import http from 'node:http';http.get('http://winesnap-owned-internet:8080/api/health',{headers:{Host:'winesnap.boleoai.se',Cookie:'__Secure-winesnap_gate=forged'},timeout:7000},r=>{r.resume();if(r.statusCode!==302||!r.headers.location?.startsWith('https://winesnap.boleoai.se/gate'))process.exitCode=1;else console.log('denied');}).on('error',()=>process.exitCode=1);`;
  assert.equal(
    (
      await command(
        ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
        probe,
      )
    ).trim(),
    "denied",
  );
}
try {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 16384);
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  let data;
  try {
    data = JSON.parse(buffer.toString());
  } finally {
    buffer.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
  assert.deepEqual(Object.keys(data).sort(), ["installationId", "tunnel"]);
  installationId = data.installationId;
  assert.match(installationId, /^[a-f0-9]{32}$/);
  if (["Verify", "Stop"].includes(action)) assert.equal(data.tunnel, null);
  else store = validateOwnedTunnelStore(data.tunnel);
  data = undefined;
  const fingerprint = createHash("sha256");
  for (const file of [
    "../config/owned-windows/Dockerfile.tunnel",
    "../config/owned-windows/Dockerfile.tunnel.dockerignore",
    "../config/owned-windows/tunnel-entry.mjs",
    "./lib/owned-tunnel.mjs",
    "./lib/owned-backend.mjs",
    "./lib/owned-internet.mjs",
  ])
    fingerprint.update(await readFile(new URL(file, import.meta.url)));
  const expected = { fingerprint: fingerprint.digest("hex") };
  phase = "installed_connector_identity";
  const id = (
    await command([
      "ps",
      "--all",
      "--filter",
      `name=^/${ownedConnectorName}$`,
      "--format",
      "{{.ID}}",
    ])
  ).trim();
  let current = id ? await inspect(id) : undefined;
  if (current) {
    checkOwnedTunnelContainer(current, installationId, expected);
    checkOwnedConnectorNetwork(
      JSON.parse(await command(["network", "inspect", ownedConnectorEgress]))[0],
      installationId,
    );
  }
  if (action === "Stop") {
    if (current?.State.Running) await command(["stop", "--time", "10", ownedConnectorName]);
    report.stopped = true;
    report.completed = true;
  } else {
    phase = "protected_owned_origin_preflight";
    await preflight();
    if (action === "Install" && !current) {
      phase = "pinned_connector_build";
      await command(
        [
          "build",
          "--tag",
          ownedConnectorTag,
          "--file",
          "config/owned-windows/Dockerfile.tunnel",
          ".",
        ],
        undefined,
        180000,
      );
      expected.imageId = (
        await command(["image", "inspect", ownedConnectorTag, "--format", "{{.Id}}"])
      ).trim();
      assert.match(expected.imageId, /^sha256:[a-f0-9]{64}$/);
      phase = "isolated_connector_network";
      const net = (
        await command([
          "network",
          "ls",
          "--filter",
          `name=^${ownedConnectorEgress}$`,
          "--format",
          "{{.Name}}",
        ])
      ).trim();
      if (!net) await command(["network", "create", ...labels(), ownedConnectorEgress]);
      const network = JSON.parse(await command(["network", "inspect", ownedConnectorEgress]))[0];
      checkOwnedConnectorNetwork(network, installationId);
      assert.equal(Object.keys(network.Containers ?? {}).length, 0);
      await command([
        "create",
        "--name",
        ownedConnectorName,
        ...labels(),
        "--label",
        `winesnap.tunnel=${approvedTunnelId}`,
        "--label",
        `winesnap.config=${expected.fingerprint}`,
        "--network",
        ownedConnectorEgress,
        "--restart",
        "unless-stopped",
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
        "/tmp:rw,nosuid,nodev,noexec,size=8m,uid=1000,gid=1000,mode=0700",
        expected.imageId,
      ]);
      await command(["network", "connect", ownedIngressNetwork, ownedConnectorName]);
      current = await inspect(ownedConnectorName);
      checkOwnedTunnelContainer(current, installationId, expected);
    }
    assert.ok(current, "Explicit connector installation is required");
    if (action === "Verify") assert.ok(current.State.Running);
    else {
      if (!current.State.Running) await command(["start", ownedConnectorName]);
      phase = "private_ram_token_install";
      const put = `import{mkdir,lstat,writeFile,rename}from'node:fs/promises';let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error();}const dir='/tmp/winesnap-tunnel';await mkdir(dir,{recursive:true,mode:448});const s=await lstat(dir);if(s.isSymbolicLink()||s.uid!==1000||(s.mode&63))throw Error();try{await lstat(dir+'/token');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(dir+'/pending',input,{mode:384,flag:'wx'});await rename(dir+'/pending',dir+'/token');}`;
      await command(
        ["exec", "--interactive", ownedConnectorName, "node", "--input-type=module", "--eval", put],
        store.token,
      );
    }
    phase = "cloudflare_connection_readiness";
    const ready = `let ok=false;for(let i=0;i<30;i++){try{ok=(await fetch('http://127.0.0.1:20241/ready',{signal:AbortSignal.timeout(2000)})).status===200;}catch{}if(ok)break;await new Promise(r=>setTimeout(r,1000));}if(!ok)process.exitCode=1;else console.log('ready');`;
    assert.equal(
      (
        await command(
          ["exec", ownedConnectorName, "node", "--input-type=module", "--eval", ready],
          undefined,
          70000,
        )
      ).trim(),
      "ready",
    );
    checkOwnedTunnelContainer(await inspect(ownedConnectorName), installationId, expected);
    report.connectorConnected = true;
    report.completed = true;
  }
} catch {
  report.failure = "owned_connector_not_ready";
  report.phase = phase;
} finally {
  store = undefined;
  console.log(JSON.stringify(report));
  if (!report.completed) process.exitCode = 1;
}
