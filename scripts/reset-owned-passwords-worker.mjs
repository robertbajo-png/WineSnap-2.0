// Private stdin/stdout helper. Only run through reset-owned-passwords.ps1.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  checkOwnedContainer,
  ownedApi,
  ownedToken,
  validateOwnedKeys,
} from "./lib/owned-backend.mjs";
import { validateOwnedGateKeys } from "./lib/owned-private-ingress.mjs";
import {
  ownedGatePasswordProbe,
  resetOwnedOwnerLogin,
  rotateOwnedGatePassword,
  validateOwnedResetPasswords,
  verifyOwnedGateOwner,
} from "./lib/owned-password-reset.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.WINESNAP_OWNED_PASSWORD_RESET_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.equal(process.argv.length, 3);
const action = process.argv[2];
assert.ok(["Rotate", "RotateGate", "VerifyGate", "VerifyOwnerGate"].includes(action));
const report = { project: "winesnap-owned-local", completed: false, productionTouched: false };
const chunks = [];
let input, payload, gate;
const gateOnly = ["RotateGate", "VerifyOwnerGate"].includes(action);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const command = (args, data) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      { windowsHide: true, timeout: 90000, maxBuffer: 2 * 1024 * 1024 },
      (error, output) =>
        error ? reject(new Error("owned_password_command_failed")) : resolve(output),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(data);
  });
try {
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 16384);
    chunks.push(chunk);
  }
  input = Buffer.concat(chunks);
  payload = JSON.parse(input.toString());
  validateOwnedKeys(payload.keys);
  validateOwnedGateKeys(payload.gate);
  assert.deepEqual(Object.keys(payload).sort(), [
    "appPassword",
    ...(gateOnly ? ["binding"] : []),
    "gate",
    "gatePassword",
    "keys",
    "ownerEmail",
  ]);
  if (action === "Rotate") validateOwnedResetPasswords(payload.gatePassword, payload.appPassword);
  else {
    assert.equal(payload.appPassword, null);
    assert.ok(
      typeof payload.gatePassword === "string" &&
        payload.gatePassword.length >= 16 &&
        Buffer.byteLength(payload.gatePassword) <= 256,
    );
  }
  report.phase = "verify_exact_owned_installation";
  for (const name of ["winesnap-owned-web", "winesnap-owned-gateway", "winesnap-owned-auth"]) {
    const info = JSON.parse(await command(["inspect", name]))[0];
    checkOwnedContainer(info, name, payload.keys.installationId);
    assert.equal(info.State.Running, true);
  }
  let ownerId;
  if (gateOnly) {
    const admin = createClient(ownedApi, ownedToken(payload.keys, "service_role"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (url, init) => {
          const target = new URL(String(url));
          assert.equal(target.origin, ownedApi);
          assert.ok(target.pathname.startsWith("/auth/v1/"));
          return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) });
        },
      },
    });
    ownerId = await verifyOwnedGateOwner(
      admin,
      payload.binding,
      payload.keys.installationId,
      payload.ownerEmail,
    );
    report.ownerBindingVerified = true;
    report.appPasswordUnchanged = true;
  }
  if (action === "RotateGate") {
    gate = await rotateOwnedGatePassword(payload.gate, payload.gatePassword);
  } else if (action === "Rotate") {
    gate = await rotateOwnedGatePassword(payload.gate, payload.gatePassword);
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (url, init) => {
          const target = new URL(url);
          assert.equal(target.origin, ownedApi);
          assert.ok(target.pathname.startsWith("/auth/v1/"));
          return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) });
        },
      },
    };
    const admin = createClient(ownedApi, ownedToken(payload.keys, "service_role"), options);
    const verifier = createClient(ownedApi, ownedToken(payload.keys, "anon"), options);
    await resetOwnedOwnerLogin(admin, verifier, payload.ownerEmail, payload.appPassword, (step) => {
      report.phase = step;
      if (step === "app_password_updated") report.appPasswordUpdated = true;
      if (step === "app_login_verified") report.appLoginVerified = true;
      if (step === "app_refresh_sessions_revoked") report.appRefreshSessionsRevoked = true;
    });
  } else {
    report.phase = "gate_login_probe";
    const result = JSON.parse(
      await command(
        [
          "exec",
          "--interactive",
          "winesnap-owned-web",
          "node",
          "--input-type=module",
          "--eval",
          ownedGatePasswordProbe,
        ],
        JSON.stringify({ password: payload.gatePassword, ...(gateOnly ? { ownerId } : {}) }),
      ),
    );
    assert.equal(result.completed, true);
    assert.equal(result.gateLoginVerified, true);
    assert.equal(result.probeSessionLoggedOut, true);
    report.gateLoginVerified = true;
    if (gateOnly) {
      assert.equal(result.ownerSessionVerified, true);
      report.ownerSessionVerified = true;
    }
  }
  report.completed = true;
} catch {
  report.failure = "owned_password_reset_not_accepted";
} finally {
  input?.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  payload = undefined;
  console.log(
    JSON.stringify({
      report,
      ...(["Rotate", "RotateGate"].includes(action) && report.completed ? { gate } : {}),
    }),
  );
  gate = undefined;
  if (!report.completed) process.exitCode = 1;
}
