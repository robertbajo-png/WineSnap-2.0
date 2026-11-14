import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkOwnedContainer, ownedEgress } from "./lib/owned-backend.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.argv.length, 2);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const run = randomBytes(8).toString("hex");
const name = `winesnap-owned-ingress-check-${run}`;
const scope = "owned-internet-check";
const config = fileURLToPath(new URL("../config/owned-windows/internet.conf", import.meta.url));
const report = {
  project: "winesnap-owned-local",
  completed: false,
  publicTunnelStarted: false,
  productionTouched: false,
};
let created = false;
let phase = "owned_validation";
const command = (args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          report.commandTimedOut = error.killed === true;
          report.childSyntaxError = stderr.includes("SyntaxError");
          reject(new Error("owned_ingress_command_failed"));
        } else resolve(stdout);
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
const inspect = async (target) => JSON.parse(await command(["inspect", target]))[0];
try {
  const web = await inspect("winesnap-owned-web");
  const id = web.Config.Labels["winesnap.installation"];
  assert.match(id, /^[a-f0-9]{32}$/);
  checkOwnedContainer(web, "winesnap-owned-web", id);
  const gateway = await inspect("winesnap-owned-gateway");
  checkOwnedContainer(gateway, "winesnap-owned-gateway", id);
  assert.ok(web.State.Running && gateway.State.Running);
  assert.match(gateway.Image, /^sha256:[a-f0-9]{64}$/);
  phase = "isolated_container";
  created = true;
  await command([
    "create",
    "--name",
    name,
    "--label",
    `winesnap.scope=${scope}`,
    "--label",
    `winesnap.check=${run}`,
    "--label",
    `winesnap.installation=${id}`,
    "--network",
    ownedEgress,
    "--read-only",
    "--user",
    "101",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "64m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "64",
    "--log-driver",
    "none",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=101,mode=0700",
    "--mount",
    `type=bind,source=${config},target=/etc/nginx/nginx.conf,readonly`,
    "--entrypoint",
    "nginx",
    gateway.Image,
    "-g",
    "daemon off;",
  ]);
  const test = await inspect(name);
  assert.equal(test.HostConfig.PublishAllPorts, false);
  assert.equal(Object.keys(test.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(test.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(Object.keys(test.NetworkSettings.Networks), [ownedEgress]);
  await command(["start", name]);
  phase = "gateway_probes";
  const probes = [
    ["/api/health", 200],
    ["/login", 200],
    ["/backend/auth/v1/health", 200],
    ["/backend/storage/v1/status", 200],
    ["/backend/auth/v1/admin/users", 404],
    ["/backend/mail/api/v1/messages", 404],
    ["/backend/unknown", 404],
    ["/api/public/hooks/check-wishlist-prices", 404],
    ["/api/privacy/privacy-maintenance", 404],
    ["/backend/auth/v1/health", 403, "https://untrusted.example.org"],
    ["/api/health", 403, "https://untrusted.example.org"],
    ["/backend/auth/v1/health", 200, "https://winesnap.boleoai.se"],
  ];
  // The child probes only this new container through the owned Docker network.
  const source = `import assert from 'node:assert/strict';import http from 'node:http';
    const base=${JSON.stringify(`http://${name}:8080`)};
    const request=(path,origin,host='winesnap.boleoai.se')=>new Promise((resolve,reject)=>{
      const req=http.request(base+path,{headers:{Host:host,...(origin?{Origin:origin}:{})},timeout:2500},res=>{
        res.resume();res.on('end',()=>resolve({status:res.statusCode}));res.on('error',reject);
      });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('local_probe_timeout')));req.end();
    });
    let ready=false,index=-1,receivedStatus;
    try {
    const deadline=Date.now()+10000;
    for(let i=0;i<10 && Date.now()<deadline;i++){try{ready=(await request('/api/health')).status===200;}catch{} if(ready)break;await new Promise(r=>setTimeout(r,250));}
    assert(ready);
    for(const [path,status,origin] of ${JSON.stringify(probes)}){index++;const response=await request(path,origin);receivedStatus=response.status;assert.equal(response.status,status);}
    let denied=false;try{await request('/api/health',undefined,'untrusted.example.org');}catch{denied=true;}assert(denied);
    console.log(JSON.stringify({passed:true,checks:${probes.length + 1}}));
    } catch { console.log(JSON.stringify({passed:false,index,receivedStatus})); }`;
  const result = JSON.parse(
    await command(
      ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
      source,
    ),
  );
  if (!result.passed) {
    report.failedProbe = result.index;
    report.receivedStatus = result.receivedStatus;
  }
  assert.equal(result.passed, true);
  report.checks = result.checks;
  report.completed = true;
} catch {
  report.failure = "owned_ingress_check_failed";
  report.phase = phase;
  if (created) {
    try {
      const value = await inspect(name);
      report.gatewayRunning = value.State.Running;
      report.gatewayExitCode = value.State.ExitCode;
    } catch {}
  }
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      const present = (
        await command(["ps", "--all", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"])
      ).trim();
      if (present) {
        const found = await inspect(name);
        assert.equal(found.Name, "/" + name);
        assert.equal(found.Config.Labels["winesnap.scope"], scope);
        assert.equal(found.Config.Labels["winesnap.check"], run);
        assert.equal(Object.keys(found.HostConfig.PortBindings ?? {}).length, 0);
        assert.equal(found.Mounts.length, 1);
        assert.equal(found.Mounts[0].Destination, "/etc/nginx/nginx.conf");
        assert.equal(found.Mounts[0].RW, false);
        await command(["rm", "--force", name]);
      }
      report.cleanupCompleted = true;
    } catch {
      report.completed = false;
      report.cleanupCompleted = false;
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify(report));
}
