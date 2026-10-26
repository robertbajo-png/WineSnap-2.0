import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ownedProject,
  ownedScope,
  ownedNetwork,
  ownedEgress,
  ownedToken,
  validateOwnedKeys,
  checkOwnedContainer,
} from "./owned-backend.mjs";

const keys = () => ({
  version: 1,
  project: ownedProject,
  installationId: "a".repeat(32),
  issuedAt: 1792915200,
  dbPassword: "b".repeat(64),
  jwtSecret: "c".repeat(64),
  cronSecret: "d".repeat(64),
  privacyCronSecret: "e".repeat(64),
});
const web = () => ({
  Name: "/winesnap-owned-web",
  Config: {
    User: "node",
    Labels: { "winesnap.scope": ownedScope, "winesnap.installation": "a".repeat(32) },
  },
  HostConfig: {
    ReadonlyRootfs: true,
    LogConfig: { Type: "none" },
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"],
    PortBindings: { "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "5212" }] },
  },
  Mounts: [],
  NetworkSettings: { Networks: { [ownedNetwork]: {}, [ownedEgress]: {} } },
});
describe("owned Windows backend provisioning", () => {
  it("keeps the vendor initialization socket and waits for its final server", () => {
    const source = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(source).toContain('"unix_socket_directories=/tmp,/var/run/postgresql"');
    expect(source).toContain("/var/run/postgresql:rw,nosuid,nodev,noexec");
    expect(source).toMatch(/"pg_isready"[\s,]+"-h"[\s,]+"127\.0\.0\.1"/);
    expect(source).toContain('"/tmp"');
  });
  it("requires a separate identity and fresh local-only credentials", () => {
    expect(validateOwnedKeys(keys()).project).toBe(ownedProject);
    for (const mutate of [
      (k) => (k.project = "pzniyupmgwvlldvztzqh"),
      (k) => (k.dbPassword = "password"),
      (k) => (k.installationId = "../../elsewhere"),
      (k) => (k.url = "https://production.invalid"),
      (k) => (k.secret = "sb_secret_other"),
    ]) {
      const value = keys();
      mutate(value);
      expect(() => validateOwnedKeys(value)).toThrow();
    }
  });
  it("does not mint user or administrator identities", () => {
    for (const role of ["anon", "service_role"]) {
      const token = ownedToken(keys(), role);
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      expect(claims.ref).toBe(ownedProject);
      expect(claims.role).toBe(role);
      expect(claims.sub).toBeUndefined();
    }
    expect(() => ownedToken(keys(), "authenticated")).toThrow();
    expect(() => ownedToken(keys(), "postgres")).toThrow();
  });
  it("checks existing containers before using their credentials or data", () => {
    expect(() => checkOwnedContainer(web(), "winesnap-owned-web", "a".repeat(32))).not.toThrow();
    for (const mutate of [
      (c) => (c.Config.User = "root"),
      (c) => (c.Config.Labels["winesnap.scope"] = "other"),
      (c) => (c.HostConfig.ReadonlyRootfs = false),
      (c) => (c.HostConfig.CapDrop = []),
      (c) => (c.HostConfig.LogConfig.Type = "json-file"),
      (c) => (c.HostConfig.PublishAllPorts = true),
      (c) => (c.HostConfig.PortBindings["3000/tcp"][0].HostIp = "0.0.0.0"),
      (c) => (c.HostConfig.PortBindings["3000/tcp"][0].HostPort = "80"),
      (c) => (c.NetworkSettings.Networks.unapproved = {}),
      (c) => (c.Mounts = [{ Type: "bind", RW: true, Destination: "/data" }]),
    ]) {
      const value = web();
      mutate(value);
      expect(() => checkOwnedContainer(value, "winesnap-owned-web", "a".repeat(32))).toThrow();
    }
  });
  it("retains real Auth and image bytes across restarts without hosted access", () => {
    const source = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(source).not.toContain(".supabase.co");
    expect(source).toContain('"--host", "npipe:////./pipe/dockerDesktopLinuxEngine"');
    expect(source).toContain('"GOTRUE_JWT_DEFAULT_GROUP_NAME"'.replaceAll('"', ""));
    expect(source).toContain('GOTRUE_MAILER_AUTOCONFIRM: "false"');
    expect(source).toContain('"--auth-host=scram-sha-256 --auth-local=trust"');
    expect(source).toContain("winesnap_local.installation");
    expect(source).toContain("winesnap_local.migrations");
    expect(source).toContain('"--xattrs"');
    expect(source).toContain('"--roles-only"');
    expect(source).not.toMatch(/volume.*(?:prune|\brm\b)|DROP DATABASE|TRUNCATE TABLE/);
    const wrapper = readFileSync(new URL("../run-owned-windows.ps1", import.meta.url), "utf8");
    expect(wrapper).toContain("ProtectedData]::Protect");
    expect(wrapper).toContain("ProtectedData]::Unprotect");
    expect(wrapper).toContain("$start.Environment.Clear()");
    expect(wrapper).toContain("Private archive cannot be copied into a public status report");
  });
  it("restricts the gateway and inbox to loopback origins and fixed upstreams", () => {
    const config = readFileSync(
      new URL("../../config/owned-windows/nginx.conf", import.meta.url),
      "utf8",
    );
    expect(config).toContain("return 444;");
    expect(config).toContain("if ($blocked_origin) { return 403; }");
    expect(config).not.toContain("$arg_");
    expect(config).not.toContain("proxy_pass $host");
    expect(config).toContain("server winesnap-owned-auth:9999 resolve");
    expect(config).toContain("server winesnap-owned-mail:8025 resolve");
  });
});
