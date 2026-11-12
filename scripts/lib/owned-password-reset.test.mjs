import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  ownedGatePasswordProbe,
  replaceOwnedGateLogin,
  resetOwnedOwnerLogin,
  rotateOwnedGatePassword,
  selectOwnedPasswordResetUser,
  validateOwnedResetPasswords,
  verifyOwnedGateOwner,
} from "./owned-password-reset.mjs";

const email = "owner@example.org";
const user = () => ({
  id: "01234567-89ab-4cde-8123-456789abcdef",
  email,
  email_confirmed_at: "2026-11-05T00:00:00Z",
});
const hash = "$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQ$ZGVyaXZlZA";
const gate = () => ({
  version: 1,
  project: "winesnap-owned-local",
  hostname: "winesnap.boleoai.se",
  username: "robert",
  passwordHash: hash,
  sessionSecret: "a".repeat(64),
  storageKey: "b".repeat(64),
  resetSecret: "c".repeat(64),
});

describe("explicit owned owner password recovery", () => {
  it("rejects weak, equal, oversized and control-character input", () => {
    const valid = ["outer-synthetic-password-123", "inner-synthetic-password-456"];
    expect(() => validateOwnedResetPasswords(...valid)).not.toThrow();
    for (const pair of [
      ["short", valid[1]],
      [valid[0], "short"],
      [valid[0], valid[0]],
      ["x".repeat(257), valid[1]],
      [valid[0], "x".repeat(73)],
      [valid[0], "a".repeat(20) + "\n"],
      [valid[0], "\u00e5".repeat(37)],
    ])
      expect(() => validateOwnedResetPasswords(...pair)).toThrow();
  });
  it("preserves identity, storage encryption and reset keys; changes only login and session", () => {
    const before = gate();
    const after = replaceOwnedGateLogin(before, hash + "A", "d".repeat(64));
    expect(after).toEqual({ ...before, passwordHash: hash + "A", sessionSecret: "d".repeat(64) });
    expect(before).toEqual(gate());
    expect(() => replaceOwnedGateLogin(before, hash, "d".repeat(64))).toThrow();
    expect(() =>
      replaceOwnedGateLogin(
        { ...before, hostname: "other.example.org" },
        hash + "A",
        "d".repeat(64),
      ),
    ).toThrow();
    expect(() => replaceOwnedGateLogin(before, "plaintext", "d".repeat(64))).toThrow();
  });
  it.skipIf(typeof crypto.argon2 !== "function")(
    "creates a real Argon2id login without replacing durable keys",
    async () => {
      const before = gate();
      const after = await rotateOwnedGatePassword(before, "Synthetic-only-new-outer-password");
      expect(after.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
      expect(after.sessionSecret).not.toBe(before.sessionSecret);
      expect(after.storageKey).toBe(before.storageKey);
      expect(after.resetSecret).toBe(before.resetSecret);
    },
  );
  it("requires exactly one confirmed explicit account, never creates one or selects a fixture", () => {
    expect(selectOwnedPasswordResetUser([user()], email).id).toBe(user().id);
    for (const users of [
      [],
      [user(), user()],
      [{ ...user(), email: "another@example.org" }],
      [{ ...user(), email_confirmed_at: null }],
      [{ ...user(), is_anonymous: true }],
      [{ ...user(), app_metadata: { owned_browser_run: "fixture" } }],
    ])
      expect(() => selectOwnedPasswordResetUser(users, email)).toThrow();
  });
  function clients(users = [user()]) {
    return {
      admin: {
        auth: {
          admin: {
            listUsers: vi.fn(async () => ({
              data: { users, total: users.length, nextPage: null },
              error: null,
            })),
            updateUserById: vi.fn(async () => ({ data: { user: user() }, error: null })),
          },
        },
      },
      verifier: {
        auth: {
          signInWithPassword: vi.fn(async () => ({ data: { user: user() }, error: null })),
          signOut: vi.fn(async () => ({ error: null })),
        },
      },
    };
  }
  const binding = () => ({
    version: 1,
    project: "winesnap-owned-local",
    hostname: "winesnap.boleoai.se",
    installationId: "1".repeat(32),
    enabled: true,
    ownerId: user().id,
  });
  it("verifies the enabled installation-bound owner without changing the app password or sessions", async () => {
    const { admin, verifier } = clients();
    await expect(verifyOwnedGateOwner(admin, binding(), "1".repeat(32), email)).resolves.toBe(
      user().id,
    );
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(verifier.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(verifier.auth.signOut).not.toHaveBeenCalled();
  });
  it("rejects a disabled, foreign, ambiguous, fixture or mismatched owner before gate-only recovery", async () => {
    for (const value of [
      { ...binding(), enabled: false },
      { ...binding(), installationId: "2".repeat(32) },
      { ...binding(), ownerId: "abcdef01-2345-4678-9123-456789abcdef" },
    ]) {
      const { admin } = clients();
      await expect(verifyOwnedGateOwner(admin, value, "1".repeat(32), email)).rejects.toThrow();
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    }
    for (const users of [
      [],
      [user(), user()],
      [{ ...user(), app_metadata: { owned_browser_run: "qa" } }],
    ]) {
      const { admin } = clients(users);
      await expect(verifyOwnedGateOwner(admin, binding(), "1".repeat(32), email)).rejects.toThrow();
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    }
  });
  it("changes only the explicit account password and verifies normal login with refresh-session revocation", async () => {
    const { admin, verifier } = clients();
    const progress = vi.fn();
    await resetOwnedOwnerLogin(admin, verifier, email, "Synthetic-new-inner-password", progress);
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledExactlyOnceWith(user().id, {
      password: "Synthetic-new-inner-password",
    });
    expect(verifier.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email,
      password: "Synthetic-new-inner-password",
    });
    expect(verifier.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "global" });
    expect(progress.mock.calls.map(([step]) => step)).toEqual([
      "owner_verified",
      "app_password_updated",
      "app_login_verified",
      "app_refresh_sessions_revoked",
    ]);
  });
  it("makes no update for a missing/ambiguous user and never claims verification on failure", async () => {
    const { admin, verifier } = clients([]);
    await expect(
      resetOwnedOwnerLogin(admin, verifier, email, "Synthetic-new-inner-password", vi.fn()),
    ).rejects.toThrow();
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    const good = clients();
    good.verifier.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "synthetic" },
    });
    const progress = vi.fn();
    await expect(
      resetOwnedOwnerLogin(
        good.admin,
        good.verifier,
        email,
        "Synthetic-new-inner-password",
        progress,
      ),
    ).rejects.toThrow();
    expect(progress.mock.calls.map(([step]) => step)).not.toContain("app_login_verified");
    expect(good.verifier.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "global" });
  });
  it("keeps human entry masked, credentials in private stdin, and rollback encrypted", () => {
    const wrapper = readFileSync(new URL("../reset-owned-passwords.ps1", import.meta.url), "utf8");
    const worker = readFileSync(
      new URL("../reset-owned-passwords-worker.mjs", import.meta.url),
      "utf8",
    );
    expect(wrapper).toContain("UseSystemPasswordChar=$true");
    expect(wrapper).toContain("$form.ShowDialog()");
    expect(wrapper).toContain("$process.StandardInput.Write($payload)");
    expect(wrapper).toContain("[IO.File]::Replace($pending,$gateFile,$backup,$false)");
    expect(wrapper).toContain("ProtectedData]::Protect");
    expect(wrapper).toContain("[switch]$GateOnly");
    expect(wrapper).toContain("$fieldCount=if($GateOnly){2}else{4}");
    expect(wrapper).toContain("Read-OwnedDeviceAccess -InstallationId $keys.installationId");
    expect(wrapper).toContain("'VerifyOwnerGate'");
    expect(worker).toContain('action === "RotateGate"');
    expect(worker).toContain('} else if (action === "Rotate") {');
    expect(worker).toContain("result.ownerSessionVerified, true");
    expect(worker).toContain('process.env.WINESNAP_OWNED_PASSWORD_RESET_PIPE, "1"');
    expect(worker).toContain("checkOwnedContainer(info, name, payload.keys.installationId)");
    expect(worker).toContain('redirect: "error"');
    expect(worker).not.toContain("createUser");
    expect(wrapper).not.toMatch(
      /WriteAllText.*\$payload|ArgumentList.Add\(\$gatePassword|ArgumentList.Add\(\$AppPassword/,
    );
  });
});

describe("private gate password and owner-session probe", () => {
  async function probe({
    ownerId = user().id,
    returnedOwner = user().id,
    userOwner = user().id,
    knowledge = true,
    large = false,
  } = {}) {
    const paths = [];
    const output = [];
    const cookie = "__Secure-winesnap_gate=synthetic-cookie";
    const answers = {
      "/gate/api/firstfactor": {
        status: 200,
        headers: { "set-cookie": [cookie + "; Secure; HttpOnly"] },
      },
      "/gate/api/state": {
        status: 200,
        body: {
          data: { username: "robert", authentication_level: 1, factor_knowledge: knowledge },
        },
      },
      "/api/owned/device-session": {
        status: 200,
        headers: { "cache-control": "private, no-store" },
        body: {
          session: {
            access_token: "synthetic-access-token",
            user: { id: returnedOwner, role: "authenticated" },
          },
        },
      },
      "/backend/auth/v1/user": {
        status: 200,
        body: large ? "x".repeat(262145) : { id: userOwner },
      },
      "/backend/auth/v1/logout?scope=local": { status: 204 },
      "/gate/api/logout": { status: 200 },
    };
    let loggedOut = false;
    const http = {
      request(url, options, callback) {
        const request = new EventEmitter();
        request.end = () =>
          queueMicrotask(() => {
            const path = new URL(url).pathname + new URL(url).search;
            paths.push(path);
            const answer =
              path === "/api/health"
                ? { status: options.headers.Cookie && !loggedOut ? 200 : 302 }
                : answers[path];
            if (path === "/gate/api/logout") loggedOut = true;
            const response = new EventEmitter();
            response.statusCode = answer.status;
            response.headers = answer.headers ?? {};
            callback(response);
            if (answer.body)
              response.emit(
                "data",
                Buffer.from(
                  typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body),
                ),
              );
            response.emit("end");
          });
        request.destroy = (error) => request.emit("error", error);
        return request;
      },
    };
    const process = {
      stdin: Readable.from([
        Buffer.from(
          JSON.stringify({ password: "Synthetic-outer-password", ...(ownerId ? { ownerId } : {}) }),
        ),
      ]),
      exitCode: 0,
    };
    const source = ownedGatePasswordProbe
      .replace("import http from 'node:http';", "")
      .replace("import assert from 'node:assert/strict';", "");
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("http", "assert", "process", "console", source)(
      http,
      (await import("node:assert/strict")).default,
      process,
      { log: (value) => output.push(JSON.parse(value)) },
    );
    expect(JSON.stringify(output)).not.toMatch(
      /synthetic-cookie|synthetic-access-token|Synthetic-outer-password/,
    );
    return { paths, result: output[0], exitCode: process.exitCode };
  }
  it("checks a real password-factor state, correct app identity and scoped logout without disclosing credentials", async () => {
    const result = await probe();
    expect(result.result).toEqual({
      completed: true,
      gateLoginVerified: true,
      ownerSessionVerified: true,
      probeSessionLoggedOut: true,
    });
    expect(result.paths).toContain("/api/owned/device-session");
    expect(result.paths).toContain("/backend/auth/v1/user");
    expect(result.paths.slice(-3)).toEqual([
      "/backend/auth/v1/logout?scope=local",
      "/gate/api/logout",
      "/api/health",
    ]);
  });
  it.each(["returnedOwner", "userOwner"])(
    "rejects the wrong %s and closes only the probe sessions",
    async (key) => {
      const result = await probe({ [key]: "abcdef01-2345-4678-9123-456789abcdef" });
      expect(result.result.completed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.paths.slice(-2)).toEqual([
        "/backend/auth/v1/logout?scope=local",
        "/gate/api/logout",
      ]);
    },
  );
  it("does not treat a passkey session as password-login proof", async () => {
    const result = await probe({ knowledge: false });
    expect(result.result.completed).toBe(false);
    expect(result.paths).not.toContain("/api/owned/device-session");
    expect(result.paths.at(-1)).toBe("/gate/api/logout");
  });
  it("bounds responses and still logs out on a failed user verification", async () => {
    const result = await probe({ large: true });
    expect(result.result.completed).toBe(false);
    expect(result.paths.slice(-2)).toEqual([
      "/backend/auth/v1/logout?scope=local",
      "/gate/api/logout",
    ]);
  });
  it("preserves the legacy gate-only health probe when no owner handoff is requested", async () => {
    const result = await probe({ ownerId: null });
    expect(result.result.completed).toBe(true);
    expect(result.result.ownerSessionVerified).toBe(false);
    expect(result.paths).not.toContain("/api/owned/device-session");
  });
});
