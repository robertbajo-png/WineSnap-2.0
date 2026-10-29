import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkOwnedContainer, ownedEgress } from "./lib/owned-backend.mjs";
import {
  ownedGateConfiguration,
  ownedGateUsers,
  ownedGateImage,
  hashOwnedGatePassword,
} from "./lib/owned-gate.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.argv.length, 2);
const run = randomBytes(8).toString("hex");
const scope = "owned-gate-check";
const network = `winesnap-owned-gate-check-${run}`;
const gate = `${network}-auth`;
const proxy = `${network}-proxy`;
const volume = `${network}-state`;
const configPath = fileURLToPath(
  new URL("../config/owned-windows/gated-internet.conf", import.meta.url),
);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const report = {
  project: "winesnap-owned-local",
  completed: false,
  productionTouched: false,
  publicTunnelStarted: false,
  cleanupCompleted: false,
};
const labelArgs = ["--label", `winesnap.scope=${scope}`, "--label", `winesnap.check=${run}`];
let phase = "owned_validation";
const resources = [];
let networkCreated = false;
let volumeCreated = false;
const command = (args, input, timeout = 30000) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        windowsHide: true,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          report.commandExitCode = error.code;
          report.commandTimedOut = error.killed === true;
          report.binaryNotFound = /executable file not found|not found in \$PATH/i.test(stderr);
          report.inputRequiresTerminal = /terminal|ioctl|input.*EOF/i.test(stderr);
          report.diagnostics = (stdout + "\n" + stderr)
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(0, 20)
            .map((line) => line.replace(/[A-Za-z0-9+/_=$.-]{24,}/g, "[REDACTED]").slice(0, 300));
          reject(new Error("owned_gate_command_failed"));
        } else resolve(stdout);
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
const inspect = async (name) => JSON.parse(await command(["inspect", name]))[0];
const sandboxArgs = [
  "--read-only",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges:true",
  "--pids-limit",
  "128",
  "--log-driver",
  "none",
];
try {
  const web = await inspect("winesnap-owned-web");
  const installation = web.Config.Labels["winesnap.installation"];
  checkOwnedContainer(web, "winesnap-owned-web", installation);
  const gateway = await inspect("winesnap-owned-gateway");
  checkOwnedContainer(gateway, "winesnap-owned-gateway", installation);
  assert.ok(web.State.Running && gateway.State.Running);
  phase = "vendor_password_hash";
  const password = randomBytes(32).toString("base64url");
  const passwordBytes = Buffer.from(password);
  const hash = await hashOwnedGatePassword(passwordBytes);
  passwordBytes.fill(0);
  const users = ownedGateUsers(hash);
  users.users.intruder = { ...users.users.robert, displayname: "Denied test identity", groups: [] };
  const config = ownedGateConfiguration(
    {
      sessionSecret: randomBytes(32).toString("hex"),
      storageKey: randomBytes(32).toString("hex"),
      resetSecret: randomBytes(32).toString("hex"),
    },
    { persistent: true },
  );
  phase = "isolated_vendor_service";
  networkCreated = true;
  await command(["network", "create", "--internal", ...labelArgs, network]);
  await command(["volume", "create", ...labelArgs, volume]);
  volumeCreated = true;
  await command([
    "run",
    "--rm",
    ...labelArgs,
    "--network",
    "none",
    "--read-only",
    "--user",
    "0",
    "--log-driver",
    "none",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "FOWNER",
    "--security-opt",
    "no-new-privileges:true",
    "--mount",
    `type=volume,source=${volume},target=/data`,
    "--entrypoint",
    "/bin/sh",
    ownedGateImage,
    "-c",
    "chown 1000:1000 /data && chmod 700 /data",
  ]);
  resources.push(gate);
  await command([
    "create",
    "--name",
    gate,
    ...labelArgs,
    ...sandboxArgs,
    "--network",
    network,
    "--network-alias",
    "winesnap-owned-gate",
    "--user",
    "1000:1000",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=32m,uid=1000,gid=1000,mode=0700",
    "--mount",
    `type=volume,source=${volume},target=/var/lib/authelia`,
    "--entrypoint",
    "/bin/sh",
    ownedGateImage,
    "-c",
    "while [ ! -f /tmp/gate/ready ]; do sleep 0.2; done; exec authelia --config /tmp/gate/configuration.yml",
  ]);
  await command(["start", gate]);
  async function injectConfiguration() {
    await command(["exec", gate, "mkdir", "-p", "/tmp/gate"]);
    for (const [file, content] of [
      ["configuration.yml", config],
      ["users.json", users],
    ])
      await command(
        ["exec", "--interactive", gate, "/bin/sh", "-c", `umask 077; cat > /tmp/gate/${file}`],
        JSON.stringify(content),
      );
    const validation = await command([
      "exec",
      gate,
      "authelia",
      "config",
      "validate",
      "--config",
      "/tmp/gate/configuration.yml",
    ]);
    assert.ok(!/Configuration parsed and loaded with errors/.test(validation));
    await command(["exec", gate, "touch", "/tmp/gate/ready"]);
  }
  phase = "vendor_configuration_validation";
  await injectConfiguration();
  resources.push(proxy);
  await command([
    "create",
    "--name",
    proxy,
    ...labelArgs,
    ...sandboxArgs,
    "--network",
    network,
    "--user",
    "101",
    "--memory",
    "64m",
    "--cpus",
    "0.5",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=101,mode=0700",
    "--mount",
    `type=bind,source=${configPath},target=/etc/nginx/nginx.conf,readonly`,
    "--entrypoint",
    "nginx",
    gateway.Image,
    "-g",
    "daemon off;",
  ]);
  await command(["network", "connect", ownedEgress, proxy]);
  for (const name of resources) {
    const value = await inspect(name);
    assert.equal(value.Config.Labels["winesnap.scope"], scope);
    assert.equal(value.Config.Labels["winesnap.check"], run);
    assert.equal(value.HostConfig.ReadonlyRootfs, true);
    assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
    assert.equal(value.HostConfig.PublishAllPorts, false);
  }
  await command(["start", proxy]);
  phase = "real_authentication_checks";
  const probe = `import http from 'node:http';import assert from 'node:assert/strict';
    const base=${JSON.stringify(`http://${proxy}:8080`)};
    const origin='https://winesnap.boleoai.se';let count=0,step='readiness';
    const request=(path,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
      const data=body?JSON.stringify(body):undefined;
      const req=http.request(base+path,{method,headers:{Host:'winesnap.boleoai.se',Origin:origin,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-Requested-With':'XMLHttpRequest'}:{}),...headers},timeout:5000},res=>{const b=[];res.on('data',v=>b.push(v));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(b).toString()}));});
      req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('probe_timeout')));req.end(data);
    });
    try{
      let ready=false;for(let i=0;i<30;i++){try{ready=(await request('/gate/api/health')).status===200;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}assert(ready);count++;
      for(const path of ['/','/login','/api/health','/backend/auth/v1/health','/backend/rest/v1/','/backend/storage/v1/status','/api/privacy/wine-image']){
        step='anonymous:'+path;const r=await request(path);assert.equal(r.status,302);assert(r.headers.location.startsWith(origin+'/gate'));count++;
      }
      step='forged_identity';assert.equal((await request('/api/health',{headers:{'Remote-User':'robert','Cf-Access-Authenticated-User-Email':'owner@winesnap.invalid',Authorization:'Bearer forged'}})).status,302);count++;
      step='bad_cookie';assert.equal((await request('/api/health',{headers:{Cookie:'__Secure-winesnap_gate=forged'}})).status,302);count++;
      step='private_auth_endpoint';assert.equal((await request('/_owned_auth_check')).status,404);count++;
      step='foreign_origin';assert.equal((await request('/gate/api/health',{headers:{Origin:'https://untrusted.example.org'}})).status,403);count++;
      step='bad_password';assert.equal((await request('/gate/api/firstfactor',{method:'POST',body:{username:'robert',password:'wrong-test-only',targetURL:origin,keepMeLoggedIn:false}})).status,401);count++;
      step='owner_login';const login=await request('/gate/api/firstfactor',{method:'POST',body:{username:'robert',password:${JSON.stringify(password)},targetURL:origin,keepMeLoggedIn:false}});assert.equal(login.status,200);
      const cookieLine=login.headers['set-cookie']?.find(v=>v.startsWith('__Secure-winesnap_gate='));assert(cookieLine);assert(/; Secure/i.test(cookieLine));assert(/; HttpOnly/i.test(cookieLine));assert(/; SameSite=Lax/i.test(cookieLine));const cookie=cookieLine.split(';')[0];count++;
      for(const path of ['/api/health','/login','/backend/auth/v1/health','/backend/storage/v1/status']){step='owner:'+path;assert.equal((await request(path,{headers:{Cookie:cookie,Authorization:'Bearer winesnap-token-must-not-be-replaced'}})).status,200);count++;}
      for(const path of ['/backend/auth/v1/admin/users','/backend/mail/api/v1/messages','/api/public/hooks/check-wishlist-prices']){step='blocked:'+path;assert.equal((await request(path,{headers:{Cookie:cookie}})).status,404);count++;}
      step='logout';assert.equal((await request('/gate/api/logout',{method:'POST',headers:{Cookie:cookie}})).status,200);assert.equal((await request('/api/health',{headers:{Cookie:cookie}})).status,302);count++;
      step='wrong_owner';const other=await request('/gate/api/firstfactor',{method:'POST',body:{username:'intruder',password:${JSON.stringify(password)},targetURL:origin,keepMeLoggedIn:false}});const otherCookie=other.headers['set-cookie']?.find(v=>v.startsWith('__Secure-winesnap_gate='))?.split(';')[0];const denied=await request('/api/health',{headers:otherCookie?{Cookie:otherCookie}:{}});assert([302,403].includes(denied.status));count++;
      step='oversized_login';assert.equal((await request('/gate/api/firstfactor',{method:'POST',body:{username:'robert',password:'x'.repeat(8192)}})).status,413);count++;
      step='login_rate_limit';let limited=false;for(let i=0;i<10;i++){const r=await request('/gate/api/firstfactor',{method:'POST',body:{username:'no-fixture-user',password:'wrong-test-only',targetURL:origin,keepMeLoggedIn:false}});assert([401,429].includes(r.status));if(r.status===429)limited=true;}assert(limited);count++;
      console.log(JSON.stringify({passed:true,checks:count}));
    }catch{console.log(JSON.stringify({passed:false,step,checks:count}));}`;
  const result = JSON.parse(
    await command(
      ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
      probe,
      90000,
    ),
  );
  if (!result.passed) report.failedStep = result.step;
  report.checks = result.checks;
  assert.equal(result.passed, true);
  phase = "failed_gate_denies_all";
  await command(["stop", "--time", "2", gate]);
  const denied = JSON.parse(
    await command(
      ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
      `import http from 'node:http';http.get(${JSON.stringify(`http://${proxy}:8080/api/health`)},{headers:{Host:'winesnap.boleoai.se'}},r=>{r.resume();console.log(JSON.stringify({status:r.statusCode}));});`,
    ),
  );
  assert.ok([500, 502, 503].includes(denied.status));
  report.checks++;
  phase = "restart_without_ram_credentials_denied";
  await command(["start", gate]);
  const empty = await command([
    "exec",
    gate,
    "/bin/sh",
    "-c",
    "test ! -e /tmp/gate/ready && test -s /var/lib/authelia/gate.sqlite3 && echo preserved",
  ]);
  assert.equal(empty.trim(), "preserved");
  report.checks++;
  const failClosedProbe = `import http from 'node:http';http.get(${JSON.stringify(`http://${proxy}:8080/api/health`)},{headers:{Host:'winesnap.boleoai.se'}},r=>{r.resume();console.log(JSON.stringify({status:r.statusCode}));});`;
  const emptyDenied = JSON.parse(
    await command(
      ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
      failClosedProbe,
    ),
  );
  assert.ok([500, 502, 503].includes(emptyDenied.status));
  report.checks++;
  phase = "restart_configuration_reinjection";
  await injectConfiguration();
  const restarted = JSON.parse(
    await command(
      ["exec", "--interactive", "winesnap-owned-web", "node", "--input-type=module"],
      `import http from 'node:http';const get=p=>new Promise((resolve,reject)=>{const q=http.get(${JSON.stringify(`http://${proxy}:8080`)}+p,{headers:{Host:'winesnap.boleoai.se'},timeout:5000},r=>{r.resume();resolve(r.statusCode);});q.on('error',reject);q.on('timeout',()=>q.destroy(new Error()));});let ready=false;for(let i=0;i<30;i++){try{ready=(await get('/gate/api/health'))===200;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}console.log(JSON.stringify({ready,denied:ready&&(await get('/api/health'))===302}));`,
    ),
  );
  assert.equal(restarted.ready, true);
  assert.equal(restarted.denied, true);
  report.checks++;
  report.restartWithPersistentState = true;
  report.completed = true;
} catch {
  report.failure = "owned_gate_check_not_accepted";
  report.phase = phase;
} finally {
  let clean = true;
  for (const name of resources.reverse()) {
    try {
      const found = await inspect(name);
      assert.equal(found.Name, `/${name}`);
      assert.equal(found.Config.Labels["winesnap.scope"], scope);
      assert.equal(found.Config.Labels["winesnap.check"], run);
      assert.equal(Object.keys(found.HostConfig.PortBindings ?? {}).length, 0);
      assert.ok(
        Object.keys(found.NetworkSettings.Networks).every((n) =>
          [network, ownedEgress].includes(n),
        ),
      );
      assert.ok(
        found.Mounts.every(
          (m) =>
            m.Type === "tmpfs" ||
            (name === gate &&
              m.Type === "volume" &&
              m.Name === volume &&
              m.Destination === "/var/lib/authelia") ||
            (name === proxy &&
              m.Type === "bind" &&
              m.RW === false &&
              m.Destination === "/etc/nginx/nginx.conf" &&
              m.Source.replaceAll("\\", "/").endsWith("/config/owned-windows/gated-internet.conf")),
        ),
      );
      await command(["rm", "--force", name]);
    } catch {
      clean = false;
    }
  }
  if (volumeCreated) {
    try {
      const found = JSON.parse(await command(["volume", "inspect", volume]))[0];
      assert.equal(found.Name, volume);
      assert.equal(found.Labels["winesnap.scope"], scope);
      assert.equal(found.Labels["winesnap.check"], run);
      assert.equal(found.Driver, "local");
      assert.ok(!found.Options || Object.keys(found.Options).length === 0);
      await command(["volume", "rm", volume]);
    } catch {
      clean = false;
    }
  }
  if (networkCreated) {
    try {
      const found = JSON.parse(await command(["network", "inspect", network]))[0];
      assert.equal(found.Labels["winesnap.scope"], scope);
      assert.equal(found.Labels["winesnap.check"], run);
      assert.equal(found.Internal, true);
      assert.equal(Object.keys(found.Containers).length, 0);
      await command(["network", "rm", network]);
    } catch {
      clean = false;
    }
  }
  report.cleanupCompleted = clean;
  if (!clean) report.completed = false;
  console.log(JSON.stringify(report, null, 2));
  if (!report.completed) process.exitCode = 1;
}
