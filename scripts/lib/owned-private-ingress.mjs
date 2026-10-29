import assert from "node:assert/strict";
import { ownedEgress, ownedScope } from "./owned-backend.mjs";
import { ownedIngressNetwork, ownedInternetOrigin } from "./owned-internet.mjs";
import { ownedGateImage, ownedGateUsers } from "./owned-gate.mjs";

export const privateIngress = Object.freeze({
  gate: "winesnap-owned-gate",
  proxy: "winesnap-owned-internet",
  gateNetwork: "winesnap-owned-gate-internal",
  ingressNetwork: ownedIngressNetwork,
  volume: "winesnap-owned-gate-state",
  marker: "owned-private-ingress-v1",
});

export function validateOwnedGateKeys(value) {
  assert.equal(value?.version, 1);
  assert.equal(value.project, "winesnap-owned-local");
  assert.equal(value.hostname, new URL(ownedInternetOrigin).hostname);
  assert.equal(value.username, "robert");
  assert.deepEqual(Object.keys(value).sort(), [
    "hostname",
    "passwordHash",
    "project",
    "resetSecret",
    "sessionSecret",
    "storageKey",
    "username",
    "version",
  ]);
  for (const key of ["sessionSecret", "storageKey", "resetSecret"])
    assert.match(value[key], /^[a-f0-9]{64}$/);
  ownedGateUsers(value.passwordHash);
  return value;
}

export function checkPrivateIngressLabels(labels, installationId) {
  assert.match(installationId, /^[a-f0-9]{32}$/);
  assert.equal(labels?.["winesnap.scope"], ownedScope);
  assert.equal(labels?.["winesnap.installation"], installationId);
  assert.equal(labels?.["winesnap.component"], privateIngress.marker);
}

export function checkPrivateIngressNetwork(value, network, installationId) {
  assert.ok([privateIngress.gateNetwork, privateIngress.ingressNetwork].includes(network));
  assert.equal(value.Name, network);
  checkPrivateIngressLabels(value.Labels, installationId);
  assert.equal(value.Driver, "bridge");
  assert.equal(value.Internal, true);
  assert.equal(value.EnableIPv6, false);
  assert.deepEqual(value.Options ?? {}, {});
  const allowed =
    network === privateIngress.gateNetwork
      ? [privateIngress.gate, privateIngress.proxy]
      : [privateIngress.proxy];
  // No connector is installed by this controller. It cannot enable Internet access.
  assert.ok(Object.values(value.Containers ?? {}).every((c) => allowed.includes(c.Name)));
}

export function checkPrivateIngressVolume(value, installationId) {
  assert.equal(value.Name, privateIngress.volume);
  assert.equal(value.Driver, "local");
  assert.deepEqual(value.Options ?? {}, {});
  checkPrivateIngressLabels(value.Labels, installationId);
}

export function checkPrivateIngressContainer(value, service, installationId, expected) {
  assert.ok(["gate", "proxy"].includes(service));
  assert.equal(value.Name, `/${privateIngress[service]}`);
  checkPrivateIngressLabels(value.Config.Labels, installationId);
  assert.equal(value.Config.Labels["winesnap.config"], expected.fingerprint);
  assert.match(expected.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(value.Config.Image, service === "gate" ? ownedGateImage : expected.proxyImage);
  assert.equal(value.Config.User, service === "gate" ? "1000:1000" : "101");
  assert.equal(value.HostConfig.ReadonlyRootfs, true);
  assert.equal(value.HostConfig.Privileged, false);
  assert.deepEqual(value.HostConfig.CapDrop, ["ALL"]);
  assert.ok(!value.HostConfig.CapAdd?.length);
  assert.deepEqual(value.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(value.HostConfig.LogConfig.Type, "none");
  assert.equal(value.HostConfig.PublishAllPorts, false);
  assert.equal(Object.keys(value.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(value.HostConfig.RestartPolicy.Name, "unless-stopped");
  assert.ok(value.HostConfig.Memory > 0 && value.HostConfig.Memory <= 256 * 1024 * 1024);
  assert.ok(value.HostConfig.NanoCpus > 0 && value.HostConfig.NanoCpus <= 1e9);
  assert.equal(value.HostConfig.PidsLimit, 128);
  assert.deepEqual(value.Config.Entrypoint, service === "gate" ? ["/bin/sh"] : ["nginx"]);
  assert.deepEqual(
    value.Config.Cmd,
    service === "gate" ? ["-c", gateEntrypoint] : ["-g", "daemon off;"],
  );
  const networks =
    service === "gate"
      ? [privateIngress.gateNetwork]
      : [privateIngress.ingressNetwork, privateIngress.gateNetwork, ownedEgress];
  assert.deepEqual(Object.keys(value.NetworkSettings.Networks).sort(), networks.sort());
  const mounts = value.Mounts.filter((m) => m.Type !== "tmpfs");
  assert.equal(mounts.length, 1);
  const mount = mounts[0];
  if (service === "gate") {
    assert.equal(mount.Type, "volume");
    assert.equal(mount.Name, privateIngress.volume);
    assert.equal(mount.Destination, "/var/lib/authelia");
    assert.equal(mount.RW, true);
  } else {
    assert.equal(mount.Type, "bind");
    assert.equal(mount.Source.replaceAll("\\", "/"), expected.configPath.replaceAll("\\", "/"));
    assert.equal(mount.Destination, "/etc/nginx/nginx.conf");
    assert.equal(mount.RW, false);
  }
  const uid = service === "gate" ? "1000" : "101";
  assert.deepEqual(value.HostConfig.Tmpfs, {
    "/tmp": `rw,nosuid,nodev,noexec,size=32m,uid=${uid},gid=${uid},mode=0700`,
  });
}

export const gateEntrypoint =
  "while [ ! -f /tmp/gate/ready ]; do sleep 0.2; done; exec authelia --config /tmp/gate/configuration.yml";
