import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

export const ownedProject = "winesnap-owned-local";
export const ownedScope = "owned-windows-local";
export const ownedNetwork = "winesnap-owned-internal";
export const ownedEgress = "winesnap-owned-egress";
export const ownedApp = "http://127.0.0.1:5212";
export const ownedApi = "http://127.0.0.1:54323";
export const ownedServices = {
  db: "postgres:17-bookworm",
  auth: "supabase/gotrue:v2.197.0",
  rest: "postgrest/postgrest:v14.18",
  storage: "supabase/storage-api:v1.81.0",
  mail: "axllent/mailpit:latest",
  gateway: "nginxinc/nginx-unprivileged:1.28-alpine",
};
export function validateOwnedKeys(value) {
  assert.equal(value?.version, 1);
  assert.equal(value.project, ownedProject);
  assert.match(value.installationId, /^[a-f0-9]{32}$/);
  for (const key of ["dbPassword", "jwtSecret", "cronSecret", "privacyCronSecret"])
    assert.match(value[key], /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(value.issuedAt) && value.issuedAt > 0);
  assert.deepEqual(
    Object.keys(value)
      .filter((key) => !["openai", "gemini"].includes(key))
      .sort(),
    [
      "version",
      "project",
      "installationId",
      "dbPassword",
      "jwtSecret",
      "cronSecret",
      "privacyCronSecret",
      "issuedAt",
    ].sort(),
  );
  if (value.openai !== undefined) assert.match(value.openai, /^sk-[A-Za-z0-9_-]{20,4093}$/);
  if (value.gemini !== undefined) assert.match(value.gemini, /^[A-Za-z0-9_-]{20,4096}$/);
  return value;
}
export function ownedToken(keys, role) {
  validateOwnedKeys(keys);
  assert.ok(["anon", "service_role"].includes(role));
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role,
    ref: ownedProject,
    iss: "supabase",
    iat: keys.issuedAt,
    exp: keys.issuedAt + 10 * 365 * 86400,
  })}`;
  return `${payload}.${createHmac("sha256", keys.jwtSecret).update(payload).digest("base64url")}`;
}
export function checkOwnedContainer(value, name, installationId) {
  assert.equal(value.Name, `/${name}`);
  assert.equal(value.Config.Labels["winesnap.scope"], ownedScope);
  assert.equal(value.Config.Labels["winesnap.installation"], installationId);
  assert.equal(value.HostConfig.ReadonlyRootfs, true);
  assert.ok(value.HostConfig.CapDrop.includes("ALL"));
  assert.ok(value.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.match(value.Config.User, /^(postgres|node|101|1000:1000|65534:65534)$/);
  assert.equal(value.HostConfig.LogConfig.Type, "none");
  assert.notEqual(value.HostConfig.PublishAllPorts, true);
  const ports = Object.values(value.HostConfig.PortBindings ?? {}).flat();
  assert.ok(ports.every((port) => port.HostIp === "127.0.0.1"));
  assert.equal(
    ports.length,
    name === "winesnap-owned-gateway" ? 2 : name === "winesnap-owned-web" ? 1 : 0,
  );
  const portMap =
    name === "winesnap-owned-web"
      ? { "3000/tcp": "5212" }
      : name === "winesnap-owned-gateway"
        ? { "8080/tcp": "54323", "8081/tcp": "8026" }
        : {};
  for (const [port, bindings] of Object.entries(value.HostConfig.PortBindings ?? {})) {
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].HostPort, portMap[port]);
  }
  const storage = {
    "winesnap-owned-db": ["winesnap-owned-database", "/var/lib/postgresql/data"],
    "winesnap-owned-storage": ["winesnap-owned-images", "/var/lib/storage"],
    "winesnap-owned-mail": ["winesnap-owned-mail", "/data"],
  }[name];
  assert.equal(value.Mounts.length, storage || name === "winesnap-owned-gateway" ? 1 : 0);
  for (const mount of value.Mounts) {
    assert.ok(
      mount.Type === "volume"
        ? storage &&
            mount.Name === storage[0] &&
            mount.Destination === storage[1] &&
            mount.RW === true
        : mount.Type === "bind" &&
            name === "winesnap-owned-gateway" &&
            mount.Destination === "/etc/nginx/nginx.conf" &&
            mount.Source.replaceAll("\\", "/").endsWith("/config/owned-windows/nginx.conf") &&
            mount.RW === false,
    );
  }
  const networks = Object.keys(value.NetworkSettings.Networks);
  assert.ok(networks.includes(ownedNetwork));
  assert.deepEqual(
    networks.sort(),
    (["winesnap-owned-web", "winesnap-owned-gateway"].includes(name)
      ? [ownedNetwork, ownedEgress]
      : [ownedNetwork]
    ).sort(),
  );
}
