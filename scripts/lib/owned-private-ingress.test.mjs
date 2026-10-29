import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  privateIngress,
  gateEntrypoint,
  validateOwnedGateKeys,
  checkPrivateIngressContainer,
  checkPrivateIngressNetwork,
  checkPrivateIngressVolume,
} from "./owned-private-ingress.mjs";
import { ownedScope, ownedEgress } from "./owned-backend.mjs";
import { ownedGateImage, ownedGateConfiguration } from "./owned-gate.mjs";

const installationId = "a".repeat(32);
const expected = {
  fingerprint: "b".repeat(64),
  proxyImage: `sha256:${"c".repeat(64)}`,
  configPath: "C:/approved/config/owned-windows/gated-internet.conf",
};
const labels = () => ({
  "winesnap.scope": ownedScope,
  "winesnap.installation": installationId,
  "winesnap.component": privateIngress.marker,
  "winesnap.config": expected.fingerprint,
});
const keys = () => ({
  version: 1,
  project: "winesnap-owned-local",
  hostname: "winesnap.boleoai.se",
  username: "robert",
  passwordHash: `$argon2id$v=19$m=65536,t=3,p=4$${"a".repeat(22)}$${"b".repeat(43)}`,
  sessionSecret: "c".repeat(64),
  storageKey: "d".repeat(64),
  resetSecret: "e".repeat(64),
});
function container(service) {
  const gate = service === "gate";
  const uid = gate ? "1000" : "101";
  return {
    Name: `/${privateIngress[service]}`,
    Config: {
      Labels: labels(),
      User: gate ? "1000:1000" : "101",
      Image: gate ? ownedGateImage : expected.proxyImage,
      Entrypoint: gate ? ["/bin/sh"] : ["nginx"],
      Cmd: gate ? ["-c", gateEntrypoint] : ["-g", "daemon off;"],
    },
    HostConfig: {
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: null,
      SecurityOpt: ["no-new-privileges:true"],
      LogConfig: { Type: "none" },
      PublishAllPorts: false,
      PortBindings: {},
      RestartPolicy: { Name: "unless-stopped" },
      Memory: 64 * 1024 * 1024,
      NanoCpus: 5e8,
      PidsLimit: 128,
      Tmpfs: { "/tmp": `rw,nosuid,nodev,noexec,size=32m,uid=${uid},gid=${uid},mode=0700` },
    },
    Mounts: [
      gate
        ? {
            Type: "volume",
            Name: privateIngress.volume,
            Destination: "/var/lib/authelia",
            RW: true,
          }
        : {
            Type: "bind",
            Source: expected.configPath,
            Destination: "/etc/nginx/nginx.conf",
            RW: false,
          },
    ],
    NetworkSettings: {
      Networks: Object.fromEntries(
        (gate
          ? [privateIngress.gateNetwork]
          : [privateIngress.ingressNetwork, privateIngress.gateNetwork, ownedEgress]
        ).map((n) => [n, {}]),
      ),
    },
  };
}

describe("private ingress lifecycle boundaries", () => {
  it("accepts only the separate encrypted gate schema, never passwords or backend/provider credentials", () => {
    expect(validateOwnedGateKeys(keys())).toEqual(keys());
    for (const change of [
      { version: 2 },
      { project: "other" },
      { username: "admin" },
      { hostname: "boleoai.se" },
      { passwordHash: "plaintext" },
      { openai: "unrelated-secret" },
      { sessionSecret: "weak" },
      { password: "not-allowed" },
    ])
      expect(() => validateOwnedGateKeys({ ...keys(), ...change })).toThrow();
  });
  it("keeps lockout state durable while configuration and the password hash remain in RAM", () => {
    const config = ownedGateConfiguration(keys(), { persistent: true });
    expect(config.storage.local.path).toBe("/var/lib/authelia/gate.sqlite3");
    expect(config.authentication_backend.file.path).toBe("/tmp/gate/users.json");
    expect(ownedGateConfiguration(keys()).storage.local.path).toBe("/tmp/gate/gate.sqlite3");
    expect(() => ownedGateConfiguration(keys(), { persistent: "yes" })).toThrow();
  });
  for (const service of ["gate", "proxy"]) {
    it(`validates the exact unpublished ${service} container`, () => {
      expect(() =>
        checkPrivateIngressContainer(container(service), service, installationId, expected),
      ).not.toThrow();
    });
    const mutations = {
      name: (v) => {
        v.Name = "/unrelated";
      },
      owner: (v) => {
        v.Config.Labels["winesnap.installation"] = "f".repeat(32);
      },
      scope: (v) => {
        v.Config.Labels["winesnap.scope"] = "other";
      },
      configuration: (v) => {
        v.Config.Labels["winesnap.config"] = "f".repeat(64);
      },
      image: (v) => {
        v.Config.Image = "nginx:latest";
      },
      privileged: (v) => {
        v.HostConfig.Privileged = true;
      },
      port: (v) => {
        v.HostConfig.PortBindings["8080/tcp"] = [{ HostIp: "0.0.0.0", HostPort: "8080" }];
      },
      root: (v) => {
        v.Config.User = "0";
      },
      writableRoot: (v) => {
        v.HostConfig.ReadonlyRootfs = false;
      },
      capability: (v) => {
        v.HostConfig.CapAdd = ["NET_ADMIN"];
      },
      logging: (v) => {
        v.HostConfig.LogConfig.Type = "json-file";
      },
      network: (v) => {
        v.NetworkSettings.Networks["winesnap-owned-internal"] = {};
      },
      mount: (v) => {
        v.Mounts.push({ Type: "bind", Source: "C:/", Destination: "/host", RW: true });
      },
      command: (v) => {
        v.Config.Cmd = ["unexpected"];
      },
      resourceLimit: (v) => {
        v.HostConfig.Memory = 0;
      },
      executableTmp: (v) => {
        v.HostConfig.Tmpfs["/tmp"] = "rw,exec";
      },
    };
    for (const [name, mutate] of Object.entries(mutations))
      it(`refuses ${name} drift before operating ${service}`, () => {
        const value = container(service);
        mutate(value);
        expect(() =>
          checkPrivateIngressContainer(value, service, installationId, expected),
        ).toThrow();
      });
  }
  it("refuses public networks, unexpected peers and host-backed persistent volumes", () => {
    const network = {
      Name: privateIngress.ingressNetwork,
      Labels: labels(),
      Driver: "bridge",
      Internal: true,
      EnableIPv6: false,
      Options: {},
      Containers: { p: { Name: privateIngress.proxy } },
    };
    const check = (v) =>
      checkPrivateIngressNetwork(v, privateIngress.ingressNetwork, installationId);
    expect(() => check(network)).not.toThrow();
    expect(() => check({ ...network, Internal: false })).toThrow();
    expect(() => check({ ...network, Containers: { t: { Name: "foreign-connector" } } })).toThrow();
    expect(() =>
      check({ ...network, Options: { "com.docker.network.bridge.name": "shared" } }),
    ).toThrow();
    const volume = {
      Name: privateIngress.volume,
      Labels: labels(),
      Driver: "local",
      Options: null,
    };
    expect(() => checkPrivateIngressVolume(volume, installationId)).not.toThrow();
    expect(() =>
      checkPrivateIngressVolume(
        { ...volume, Options: { device: "C:/", type: "none", o: "bind" } },
        installationId,
      ),
    ).toThrow();
  });
  it("has no connector, DNS operation, provider invocation or destructive volume cleanup", () => {
    const manager = readFileSync(new URL("../manage-owned-ingress.mjs", import.meta.url), "utf8");
    expect(manager).toContain('process.env.WINESNAP_OWNED_INGRESS_PIPE, "1"');
    expect(manager).toContain("size <= 16384");
    expect(manager).toContain('if (action === "Install")');
    expect(manager).toContain('if (action === "Verify") assert.ok(found.State.Running)');
    expect(manager).toContain("persistent: true");
    expect(manager).not.toMatch(
      /cloudflared|internet-tunnel|"--publish"|"volume", "rm"|api.cloudflare|OPENAI|GEMINI/,
    );
    const wrapper = readFileSync(new URL("../run-owned-ingress.ps1", import.meta.url), "utf8");
    expect(wrapper).toContain("Open-OwnedRuntimeLock -Name operation");
    expect(wrapper).toContain("ProtectedData]::Unprotect");
    expect(wrapper).toContain("$job.Assign($process.Handle)");
    expect(wrapper).toContain("$process.StandardInput.Write($payload)");
    expect(wrapper).not.toMatch(/internet-tunnel|ai-keys|Set-NetFirewall|Start-Process/);
  });
});
