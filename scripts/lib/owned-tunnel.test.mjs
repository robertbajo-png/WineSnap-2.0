import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  approvedTunnelAccount,
  approvedTunnelId,
  ownedConnectorName,
  ownedConnectorEgress,
  ownedConnectorMarker,
  validateOwnedTunnelStore,
  checkOwnedTunnelContainer,
  checkOwnedConnectorNetwork,
} from "./owned-tunnel.mjs";
const installation = "f".repeat(32);
const imageId = "sha256:" + "a".repeat(64);
const fingerprint = "b".repeat(64);
const identity = { a: approvedTunnelAccount, t: approvedTunnelId, s: "c".repeat(64) };
const store = () => ({
  version: 1,
  project: "winesnap-owned-local",
  hostname: "winesnap.boleoai.se",
  accountId: approvedTunnelAccount,
  tunnelId: approvedTunnelId,
  token: Buffer.from(JSON.stringify(identity)).toString("base64"),
});
const labels = () => ({
  "winesnap.scope": "owned-windows-local",
  "winesnap.installation": installation,
  "winesnap.component": ownedConnectorMarker,
  "winesnap.tunnel": approvedTunnelId,
  "winesnap.config": fingerprint,
});
const container = () => ({
  Name: "/" + ownedConnectorName,
  Image: imageId,
  Config: {
    Image: imageId,
    Labels: labels(),
    User: "1000:1000",
    Entrypoint: ["node", "/app/entry.mjs"],
    Cmd: null,
    Env: ["PATH=/usr/bin"],
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
    Memory: 256 * 1024 * 1024,
    NanoCpus: 5e8,
    PidsLimit: 64,
    Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=8m,uid=1000,gid=1000,mode=0700" },
  },
  Mounts: [],
  NetworkSettings: { Networks: { [ownedConnectorEgress]: {}, "winesnap-owned-ingress": {} } },
});
describe("approved isolated owned connector", () => {
  it("accepts only the exact approved tunnel/account and verifies the token itself", () => {
    expect(validateOwnedTunnelStore(store())).toEqual(store());
    for (const changes of [
      { hostname: "boleoai.se" },
      { accountId: "a".repeat(32) },
      { tunnelId: "other" },
      { token: "bad" },
      { extra: "unexpected" },
    ])
      expect(() => validateOwnedTunnelStore({ ...store(), ...changes })).toThrow();
    for (const changes of [{ a: "a".repeat(32) }, { t: "other" }, { s: "short" }])
      expect(() =>
        validateOwnedTunnelStore({
          ...store(),
          token: Buffer.from(JSON.stringify({ ...identity, ...changes })).toString("base64"),
        }),
      ).toThrow();
  });
  it("validates a non-root, RAM-only connector with no public ports or backend network", () => {
    expect(() =>
      checkOwnedTunnelContainer(container(), installation, { imageId, fingerprint }),
    ).not.toThrow();
  });
  for (const [name, mutate] of Object.entries({
    identity: (v) => {
      v.Config.Labels["winesnap.installation"] = "a".repeat(32);
    },
    image: (v) => {
      v.Config.Image = "cloudflare/cloudflared:latest";
    },
    root: (v) => {
      v.Config.User = "0";
    },
    port: (v) => {
      v.HostConfig.PortBindings = { "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "5213" }] };
    },
    backend: (v) => {
      v.NetworkSettings.Networks["winesnap-owned-internal"] = {};
    },
    appNetwork: (v) => {
      v.NetworkSettings.Networks["winesnap-owned-egress"] = {};
    },
    writableRoot: (v) => {
      v.HostConfig.ReadonlyRootfs = false;
    },
    persistentSecret: (v) => {
      v.Mounts.push({ Type: "bind", Source: "C:/secret", Destination: "/tmp/token" });
    },
    environmentToken: (v) => {
      v.Config.Env.push("TUNNEL_TOKEN=not-allowed");
    },
    command: (v) => {
      v.Config.Cmd = ["--token", "not-allowed"];
    },
    privileged: (v) => {
      v.HostConfig.Privileged = true;
    },
  }))
    it(`rejects ${name} drift`, () => {
      const value = container();
      mutate(value);
      expect(() =>
        checkOwnedTunnelContainer(value, installation, { imageId, fingerprint }),
      ).toThrow();
    });
  it("keeps the connector egress network exclusive to that connector", () => {
    const network = {
      Name: ownedConnectorEgress,
      Driver: "bridge",
      Internal: false,
      EnableIPv6: false,
      Labels: labels(),
      Options: {},
      Containers: { c: { Name: ownedConnectorName } },
    };
    expect(() => checkOwnedConnectorNetwork(network, installation)).not.toThrow();
    expect(() =>
      checkOwnedConnectorNetwork(
        { ...network, Containers: { db: { Name: "winesnap-owned-db" } } },
        installation,
      ),
    ).toThrow();
    expect(() =>
      checkOwnedConnectorNetwork(
        { ...network, Options: { "com.docker.network.bridge.name": "shared" } },
        installation,
      ),
    ).toThrow();
  });
  it("pins vendor images and uses only private stdin and a tmpfs token file", () => {
    const docker = readFileSync(
      new URL("../../config/owned-windows/Dockerfile.tunnel", import.meta.url),
      "utf8",
    );
    expect(docker.match(/@sha256:[a-f0-9]{64}/g)).toHaveLength(2);
    const entry = readFileSync(
      new URL("../../config/owned-windows/tunnel-entry.mjs", import.meta.url),
      "utf8",
    );
    expect(entry).toMatch(/"--token-file",\s+file/);
    expect(entry).toContain("!(info.mode & 0o077)");
    expect(entry).not.toMatch(/--no-tls-verify|rejectUnauthorized|TUNNEL_TOKEN=/);
    const manager = readFileSync(new URL("../manage-owned-tunnel.mjs", import.meta.url), "utf8");
    expect(manager).toContain('process.env.WINESNAP_OWNED_TUNNEL_PIPE, "1"');
    expect(manager).toContain("validateOwnedTunnelStore(data.tunnel)");
    expect(manager).toContain("await preflight()");
    expect(manager).not.toMatch(/--publish|"--token"|api.cloudflare|OPENAI_API_KEY|GEMINI_API_KEY/);
  });
});
