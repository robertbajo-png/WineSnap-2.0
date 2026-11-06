import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import {
  replaceOwnedGateLogin,
  resetOwnedOwnerLogin,
  rotateOwnedGatePassword,
  selectOwnedPasswordResetUser,
  validateOwnedResetPasswords,
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
    expect(worker).toContain('process.env.WINESNAP_OWNED_PASSWORD_RESET_PIPE, "1"');
    expect(worker).toContain("checkOwnedContainer(info, name, payload.keys.installationId)");
    expect(worker).toContain('redirect: "error"');
    expect(worker).not.toContain("createUser");
    expect(wrapper).not.toMatch(
      /WriteAllText.*\$payload|ArgumentList.Add\(\$gatePassword|ArgumentList.Add\(\$AppPassword/,
    );
  });
});
