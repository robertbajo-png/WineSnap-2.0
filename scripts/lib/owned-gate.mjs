import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { ownedInternetOrigin } from "./owned-internet.mjs";

export const ownedGateImage =
  "authelia/authelia@sha256:bd97cff4fcbf715b5ff1f9ae286afbe6033afce385302520b0368122d43a6f54";
export const ownedGateUser = "robert";
export const ownedGateCookie = "__Secure-winesnap_gate";

export async function hashOwnedGatePassword(password) {
  assert.ok(Buffer.isBuffer(password) && password.length >= 16 && password.length <= 256);
  assert.equal(typeof crypto.argon2, "function", "Password setup requires Node 24.7 or later");
  const salt = crypto.randomBytes(16);
  const derived = await new Promise((resolve, reject) =>
    crypto.argon2(
      "argon2id",
      {
        message: password,
        nonce: salt,
        parallelism: 4,
        tagLength: 32,
        memory: 65536,
        passes: 3,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  const base64 = (value) => value.toString("base64").replace(/=+$/, "");
  try {
    return `$argon2id$v=19$m=65536,t=3,p=4$${base64(salt)}$${base64(derived)}`;
  } finally {
    derived.fill(0);
  }
}

export function ownedGateConfiguration({ sessionSecret, storageKey, resetSecret }) {
  for (const value of [sessionSecret, storageKey, resetSecret])
    assert.match(value, /^[a-f0-9]{64}$/);
  return {
    theme: "dark",
    server: {
      address: "tcp://:9091/gate",
      disable_healthcheck: true,
      endpoints: {
        authz: {
          "auth-request": {
            implementation: "AuthRequest",
            authn_strategies: [{ name: "CookieSession" }],
          },
        },
      },
    },
    log: { level: "error" },
    ntp: { disable_startup_check: true },
    authentication_backend: {
      password_reset: { disable: true },
      file: { path: "/tmp/gate/users.json", watch: false },
    },
    access_control: {
      default_policy: "deny",
      rules: [
        {
          domain: new URL(ownedInternetOrigin).hostname,
          subject: `user:${ownedGateUser}`,
          policy: "one_factor",
        },
      ],
    },
    session: {
      name: ownedGateCookie,
      secret: sessionSecret,
      same_site: "lax",
      inactivity: "30m",
      expiration: "2h",
      remember_me: -1,
      cookies: [
        {
          domain: new URL(ownedInternetOrigin).hostname,
          authelia_url: `${ownedInternetOrigin}/gate`,
          default_redirection_url: ownedInternetOrigin,
        },
      ],
    },
    regulation: { max_retries: 5, find_time: "2m", ban_time: "15m" },
    identity_validation: { reset_password: { jwt_secret: resetSecret } },
    storage: { encryption_key: storageKey, local: { path: "/tmp/gate/gate.sqlite3" } },
    notifier: { filesystem: { filename: "/tmp/gate/notifications.txt" } },
  };
}

export function ownedGateUsers(passwordHash) {
  assert.match(passwordHash, /^\$argon2id\$v=19\$m=65536,t=3,p=4\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
  return {
    users: {
      [ownedGateUser]: {
        displayname: "WineSnap owner",
        password: passwordHash,
        email: "owner@winesnap.invalid",
        groups: ["winesnap-owner"],
      },
    },
  };
}
