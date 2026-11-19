import assert from "node:assert/strict";
import { ownedScope } from "./owned-backend.mjs";
import { ownedIngressNetwork } from "./owned-internet.mjs";

export const ownedConnectorName = "winesnap-owned-tunnel";
export const ownedConnectorEgress = "winesnap-owned-tunnel-egress";
export const ownedConnectorMarker = "owned-card-free-tunnel-v1";
export const approvedTunnelId = "3c24ecc7-ab97-48dc-95ff-7d72c84918d0";
export const approvedTunnelAccount = "e52a9db99ad554c58db919e0c8296e81";
export const ownedConnectorTag = "winesnap-owned-tunnel:local";

export function checkOwnedConnectorNetwork(value, installationId) {
  assert.equal(value.Name, ownedConnectorEgress);
  assert.equal(value.Driver, "bridge");
  assert.equal(value.Internal, false);
  assert.equal(value.EnableIPv6, false);
  assert.equal(value.Labels["winesnap.scope"], ownedScope);
  assert.equal(value.Labels["winesnap.installation"], installationId);
  assert.equal(value.Labels["winesnap.component"], ownedConnectorMarker);
  const defaults = {
    "com.docker.network.enable_ipv4": "true",
    "com.docker.network.enable_ipv6": "false",
  };
  for (const [key, setting] of Object.entries(value.Options ?? {})) {
    assert.ok(Object.hasOwn(defaults, key));
    assert.equal(setting, defaults[key]);
  }
  assert.ok(Object.values(value.Containers ?? {}).every((c) => c.Name === ownedConnectorName));
}

export function validateOwnedTunnelStore(value) {
  assert.deepEqual(Object.keys(value).sort(), [
    "accountId",
    "hostname",
    "project",
    "token",
    "tunnelId",
    "version",
  ]);
  assert.equal(value.version, 1);
  assert.equal(value.project, "winesnap-owned-local");
  assert.equal(value.hostname, "winesnap.boleoai.se");
  assert.equal(value.accountId, approvedTunnelAccount);
  assert.equal(value.tunnelId, approvedTunnelId);
  assert.match(value.token, /^[A-Za-z0-9+/_=-]{100,8192}$/);
  const identity = JSON.parse(Buffer.from(value.token, "base64").toString());
  assert.equal(identity.a, approvedTunnelAccount);
  assert.equal(identity.t, approvedTunnelId);
  assert.match(identity.s, /^[A-Za-z0-9+/=_-]{32,256}$/);
  return value;
}

export function checkOwnedTunnelContainer(value, installationId, expected = {}) {
  assert.match(installationId, /^[a-f0-9]{32}$/);
  assert.equal(value.Name, `/${ownedConnectorName}`);
  assert.equal(value.Config.Labels["winesnap.scope"], ownedScope);
  assert.equal(value.Config.Labels["winesnap.installation"], installationId);
  assert.equal(value.Config.Labels["winesnap.component"], ownedConnectorMarker);
  assert.equal(value.Config.Labels["winesnap.tunnel"], approvedTunnelId);
  assert.match(value.Config.Labels["winesnap.config"], /^[a-f0-9]{64}$/);
  if (expected.fingerprint)
    assert.equal(value.Config.Labels["winesnap.config"], expected.fingerprint);
  assert.match(value.Image, /^sha256:[a-f0-9]{64}$/);
  assert.equal(value.Config.Image, expected.imageId ?? value.Image);
  assert.equal(value.Image, expected.imageId ?? value.Image);
  assert.equal(value.Config.User, "1000:1000");
  assert.equal(value.HostConfig.ReadonlyRootfs, true);
  assert.equal(value.HostConfig.Privileged, false);
  assert.deepEqual(value.HostConfig.CapDrop, ["ALL"]);
  assert.ok(!value.HostConfig.CapAdd?.length);
  assert.deepEqual(value.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(value.HostConfig.LogConfig.Type, "none");
  assert.equal(value.HostConfig.PublishAllPorts, false);
  assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(value.HostConfig.RestartPolicy.Name, "unless-stopped");
  assert.equal(value.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(value.HostConfig.NanoCpus, 5e8);
  assert.equal(value.HostConfig.PidsLimit, 64);
  assert.deepEqual(value.Config.Entrypoint, ["node", "/app/entry.mjs"]);
  assert.ok(!value.Config.Cmd?.length);
  assert.ok(
    value.Config.Env.every((v) => !/^TUNNEL_TOKEN=|^OPENAI_API_KEY=|^GEMINI_API_KEY=/.test(v)),
  );
  assert.ok(value.Mounts.every((m) => m.Type === "tmpfs"));
  assert.deepEqual(value.HostConfig.Tmpfs, {
    "/tmp": "rw,nosuid,nodev,noexec,size=8m,uid=1000,gid=1000,mode=0700",
  });
  assert.deepEqual(
    Object.keys(value.NetworkSettings.Networks).sort(),
    [ownedConnectorEgress, ownedIngressNetwork].sort(),
  );
}
