// Private stdin/stdout protocol. Only run through configure-owned-device-access.ps1.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  checkOwnedContainer,
  ownedApi,
  ownedToken,
  validateOwnedKeys,
} from "./lib/owned-backend.mjs";
import { validateOwnedGateKeys } from "./lib/owned-private-ingress.mjs";
import { hashOwnedGatePassword } from "./lib/owned-gate.mjs";
import { selectOwnedPasswordResetUser } from "./lib/owned-password-reset.mjs";
import {
  validateOwnedDeviceBinding,
  renewOwnedDeviceEnrollment,
} from "./lib/owned-device-gate.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.WINESNAP_OWNED_DEVICE_OPERATOR_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.equal(process.argv.length, 3);
const action = process.argv[2];
assert.ok(["Prepare", "Enroll"].includes(action));
const report = {
  project: "winesnap-owned-local",
  completed: false,
  productionTouched: false,
  phase: "private_input",
};
const directory = join(process.env.USERPROFILE, "WineSnapOwned");
const docker = join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe");
let payload, prepared, browser;
const chunks = [];
const command = (args, data) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 },
      (error, output) =>
        error ? reject(new Error("device_operator_command_failed")) : resolve(output),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(data);
  });
async function status(phase) {
  report.phase = phase;
  if (action !== "Enroll") return;
  const path = join(directory, "device-enrollment-status.json");
  const info = await lstat(path).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  assert.ok(!info || (info.isFile() && !info.isSymbolicLink()));
  await writeFile(path, JSON.stringify({ ...report, checkedAt: new Date().toISOString() }));
}
async function backupRegisteredPasskey() {
  const pwsh = join(
    process.env.USERPROFILE,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe",
  );
  const script = join(import.meta.dirname, "run-owned-ingress.ps1");
  for (const action of ["Backup", "Rehearse"]) {
    await new Promise((resolve, reject) => {
      execFile(
        pwsh,
        ["-NoLogo", "-NoProfile", "-File", script, "-Action", action],
        { windowsHide: true, timeout: 240000, maxBuffer: 65536 },
        (error, output) => {
          try {
            assert.ok(!error);
            const result = JSON.parse(output);
            assert.equal(result.project, "winesnap-owned-local");
            assert.equal(result.productionTouched, false);
            assert.equal(result.completed, true);
            resolve();
          } catch {
            reject(new Error("passkey_backup_not_verified"));
          }
        },
      );
    });
  }
}
try {
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 32768);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try {
    payload = JSON.parse(bytes.toString());
  } finally {
    bytes.fill(0);
  }
  validateOwnedKeys(payload.keys);
  validateOwnedGateKeys(payload.gate);
  report.phase = "validating_owned_containers";
  for (const name of ["winesnap-owned-web", "winesnap-owned-gateway", "winesnap-owned-auth"]) {
    const info = JSON.parse(await command(["inspect", name]))[0];
    checkOwnedContainer(info, name, payload.keys.installationId);
    assert.ok(info.State.Running);
  }
  if (action === "Prepare") {
    assert.deepEqual(Object.keys(payload).sort(), ["enrollment", "gate", "keys", "ownerEmail"]);
    report.phase = "locating_existing_owner";
    const admin = createClient(ownedApi, ownedToken(payload.keys, "service_role"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (url, init) => {
          const target = new URL(String(url));
          assert.equal(target.origin, ownedApi);
          assert.ok(target.pathname.startsWith("/auth/v1/"));
          return fetch(url, {
            ...init,
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
        },
      },
    });
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert.ok(!listed.error && !listed.data.nextPage);
    const owner = selectOwnedPasswordResetUser(listed.data.users, payload.ownerEmail);
    assert.ok(!owner.is_anonymous);
    report.phase = "creating_private_enrollment";
    const renewed = renewOwnedDeviceEnrollment(
      payload.enrollment,
      payload.keys.installationId,
      payload.gate,
      owner.id,
    );
    const password = renewed?.password ?? randomBytes(32).toString("base64url"),
      buffer = Buffer.from(password);
    let passwordHash;
    try {
      passwordHash = renewed?.gate.passwordHash ?? (await hashOwnedGatePassword(buffer));
    } finally {
      buffer.fill(0);
    }
    const gate = validateOwnedGateKeys({ ...payload.gate, passwordHash });
    prepared = {
      binding: {
        version: 1,
        project: "winesnap-owned-local",
        hostname: "winesnap.boleoai.se",
        installationId: payload.keys.installationId,
        enabled: false,
        ownerId: owner.id,
      },
      enrollment: renewed ?? {
        version: 1,
        project: "winesnap-owned-local",
        installationId: payload.keys.installationId,
        ownerId: owner.id,
        previousPasswordHash: payload.gate.passwordHash,
        gate,
        password,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    };
    report.completed = true;
    report.phase = renewed ? "renewed_existing_enrollment" : "prepared_not_enabled";
  } else {
    assert.deepEqual(Object.keys(payload).sort(), ["binding", "enrollment", "gate", "keys"]);
    const setup = payload.enrollment;
    validateOwnedDeviceBinding(payload.binding, payload.keys.installationId);
    assert.equal(setup.project, "winesnap-owned-local");
    assert.equal(setup.version, 1);
    assert.equal(setup.installationId, payload.keys.installationId);
    assert.equal(setup.ownerId, payload.binding.ownerId);
    assert.equal(payload.binding.enabled, true);
    assert.ok(
      Date.parse(setup.expiresAt) > Date.now() &&
        Date.parse(setup.expiresAt) <= Date.now() + 3600000,
    );
    assert.deepEqual(setup.gate, payload.gate);
    assert.match(setup.password, /^[A-Za-z0-9_-]{43}$/);
    await status("authenticating_private_setup_session");
    const loginCode = `import http from 'node:http';let s='';for await(const c of process.stdin){s+=c;if(s.length>2048)throw Error();}
      const password=JSON.parse(s).password;const data=JSON.stringify({username:'robert',password,targetURL:'https://winesnap.boleoai.se',keepMeLoggedIn:false});
      const r=await new Promise((resolve,reject)=>{const q=http.request('http://winesnap-owned-internet:8080/gate/api/firstfactor',{method:'POST',headers:{Host:'winesnap.boleoai.se',Origin:'https://winesnap.boleoai.se','Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-Requested-With':'XMLHttpRequest'},timeout:15000},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,cookies:res.headers['set-cookie']}));});q.on('error',reject);q.on('timeout',()=>q.destroy(new Error()));q.end(data);});
      if(r.status!==200)throw Error();const c=r.cookies?.find(v=>v.startsWith('__Secure-winesnap_gate='));if(!c||!/; Secure/i.test(c)||!/; HttpOnly/i.test(c))throw Error();console.log(JSON.stringify({cookie:c.split(';')[0]}));`;
    const issued = JSON.parse(
      await command(
        [
          "exec",
          "--interactive",
          "winesnap-owned-web",
          "node",
          "--input-type=module",
          "--eval",
          loginCode,
        ],
        JSON.stringify({ password: setup.password }),
      ),
    );
    assert.ok(issued.cookie?.startsWith("__Secure-winesnap_gate="));
    await status("opening_enrollment_browser");
    const playwright = await import(
      pathToFileURL(
        join(
          process.env.USERPROFILE,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
        ),
      ).href
    );
    await status("launching_enrollment_browser");
    browser = await playwright.chromium.launch({ headless: false });
    await status("creating_private_browser_context");
    const context = await browser.newContext({ viewport: null, locale: "sv-SE" });
    await context.addCookies([
      {
        name: "__Secure-winesnap_gate",
        value: issued.cookie.slice("__Secure-winesnap_gate=".length),
        domain: ".winesnap.boleoai.se",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
    const origin = "https://winesnap.boleoai.se";
    const gateRequest = async (path, method = "GET", data) => {
      assert.ok(path.startsWith("/gate/api/"));
      const response = await context.request.fetch(origin + path, {
        method,
        data,
        headers: { Origin: origin, "X-Requested-With": "XMLHttpRequest" },
        maxRedirects: 0,
        timeout: 15000,
      });
      report.providerStatus = response.status();
      assert.equal(response.status(), 200);
      return response.json();
    };
    await status("validating_private_setup_session");
    const state = await gateRequest("/gate/api/state");
    assert.equal(state.data?.username, "robert");
    assert.ok(state.data.authentication_level >= 1);
    await status("elevating_private_setup_session");
    const elevated = await gateRequest("/gate/api/user/session/elevation");
    if (elevated.data?.elevated !== true) {
      await status("requesting_private_setup_elevation");
      await gateRequest("/gate/api/user/session/elevation", "POST");
      report.gateCookieCount = (await context.cookies(origin)).filter(
        (cookie) => cookie.name === "__Secure-winesnap_gate",
      ).length;
      assert.equal(report.gateCookieCount, 1);
      // Read only the provider's local notification for this owner setup; never
      // expose the one-time code or notification in logs, artifacts or chat.
      await status("reading_private_setup_notification");
      const notification = await command([
        "exec",
        "winesnap-owned-gate",
        "cat",
        "/tmp/gate/notifications.txt",
      ]);
      const codes = [
        ...notification.matchAll(/^-{40}\r?\n\s*([A-Za-z0-9][A-Za-z0-9 -]{5,127})\s*\r?\n-{40}/gm),
      ];
      report.localCodeAvailable = codes.length > 0;
      assert.ok(codes.length && notification.includes("winesnap.boleoai.se"));
      await status("verifying_private_setup_elevation");
      await gateRequest("/gate/api/user/session/elevation", "PUT", { otc: codes.at(-1)[1].trim() });
      await status("checking_elevated_private_setup_session");
      assert.equal((await gateRequest("/gate/api/user/session/elevation")).data?.elevated, true);
    }
    issued.cookie = undefined;
    payload.keys = undefined;
    payload.gate = undefined;
    setup.password = undefined;
    for (const chunk of chunks) chunk.fill(0);
    await status("opening_owner_passkey_settings");
    const page = await context.newPage();
    await status("loading_owner_passkey_settings");
    const opened = await page.goto(origin + "/gate/settings/two-factor-authentication", {
      waitUntil: "commit",
      timeout: 60000,
    });
    assert.equal(opened?.status(), 200);
    await page.getByRole("button").first().waitFor({ state: "visible", timeout: 60000 });
    await status("awaiting_owner_passkey_registration");
    const deadline = Date.now() + 30 * 60000;
    let registered = false;
    while (Date.now() < deadline && !page.isClosed()) {
      try {
        const info = await gateRequest("/gate/api/user/info");
        if (info.data?.has_webauthn === true) {
          registered = true;
          break;
        }
      } catch {
        /* User navigation/elevation can briefly replace the session. */
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    assert.ok(registered);
    report.passkeyRegistered = true;
    await status("backing_up_registered_passkey");
    await backupRegisteredPasskey();
    report.passkeyBackupVerified = true;
    await context.close();
    const verification = await browser.newContext({ viewport: null, locale: "sv-SE" });
    const verifiedPage = await verification.newPage();
    await verifiedPage.goto(origin + "/?device_login=1", { waitUntil: "domcontentloaded" });
    await status("awaiting_owner_passkey_sign_in");
    let signedIn = false;
    while (Date.now() < deadline && !verifiedPage.isClosed()) {
      try {
        const r = await verification.request.get(origin + "/gate/api/state", { maxRedirects: 0 });
        const s = await r.json();
        if (
          s.data?.username === "robert" &&
          s.data.authentication_level >= 1 &&
          s.data.factor_knowledge === false &&
          new URL(verifiedPage.url()).pathname === "/"
        ) {
          signedIn = await verifiedPage.evaluate(
            (ownerId) =>
              Object.keys(localStorage).some((key) => {
                if (!key.startsWith("sb-") || !key.endsWith("auth-token")) return false;
                try {
                  return JSON.parse(localStorage.getItem(key) ?? "null")?.user?.id === ownerId;
                } catch {
                  return false;
                }
              }),
            setup.ownerId,
          );
          if (signedIn) break;
        }
      } catch {
        /* Wait for the human-approved native passkey operation. */
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    assert.ok(signedIn);
    report.passkeyLoginVerified = true;
    report.appOwnerSessionVerified = true;
    report.completed = true;
    await status("complete");
    payload = undefined;
    await new Promise((resolve) => browser.once("disconnected", resolve));
  }
} catch (error) {
  report.failureKind = ["AssertionError", "TimeoutError", "TypeError", "AbortError"].includes(
    error.name,
  )
    ? error.name
    : "Error";
  report.failedPhase = report.phase;
  report.failure = "owned_device_access_not_complete";
} finally {
  for (const chunk of chunks) chunk.fill(0);
  payload = undefined;
  if (!report.completed) await browser?.close().catch(() => undefined);
  if (action === "Enroll") await status(report.completed ? "complete" : "needs_attention");
  console.log(JSON.stringify({ report, ...(prepared && report.completed ? prepared : {}) }));
  prepared = undefined;
  if (!report.completed) process.exitCode = 1;
}
