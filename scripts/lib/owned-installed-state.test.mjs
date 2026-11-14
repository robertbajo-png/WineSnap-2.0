import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inspectOwnedContainers } from "./owned-installed-state.mjs";
import { ownedResumeOrder } from "./owned-lifecycle.mjs";
import { ownedScope, ownedNetwork, ownedEgress } from "./owned-backend.mjs";

const installation = "a".repeat(32);
const names = ownedResumeOrder.map((service) => `winesnap-owned-${service}`);
function snapshot() {
  return ownedResumeOrder.map((service, index) => {
    const storage = {
      db: ["winesnap-owned-database", "/var/lib/postgresql/data"],
      storage: ["winesnap-owned-images", "/var/lib/storage"],
      mail: ["winesnap-owned-mail", "/data"],
    }[service];
    const portMap =
      service === "web"
        ? { "3000/tcp": "5212" }
        : service === "gateway"
          ? { "8080/tcp": "54323", "8081/tcp": "8026" }
          : {};
    return {
      Id: (index + 1).toString(16).repeat(64),
      Name: names[index],
      State: { Running: true },
      Config: {
        User: service === "db" ? "postgres" : "node",
        Labels: { "winesnap.scope": ownedScope, "winesnap.installation": installation },
      },
      HostConfig: {
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        LogConfig: { Type: "none" },
        PortBindings: Object.fromEntries(
          Object.entries(portMap).map(([port, HostPort]) => [
            port,
            [{ HostIp: "127.0.0.1", HostPort }],
          ]),
        ),
      },
      Mounts: storage
        ? [{ Type: "volume", Name: storage[0], Destination: storage[1], RW: true }]
        : service === "gateway"
          ? [{
              Type: "bind",
              Source: "C:/workspace/config/owned-windows/nginx.conf",
              Destination: "/etc/nginx/nginx.conf",
              RW: false,
            }]
          : [],
      NetworkSettings: {
        Networks: Object.fromEntries(
          (["web", "gateway"].includes(service) ? [ownedNetwork, ownedEgress] : [ownedNetwork])
            .map((name) => [name, {}]),
        ),
      },
    };
  }).map((value) => ({ ...value, Name: "/" + value.Name }));
}

describe("owned installed service snapshot", () => {
  it("uses one exact read-only command and restores dependency order", async () => {
    const values = snapshot().reverse();
    const json = vi.fn().mockResolvedValue(values);
    const result = await inspectOwnedContainers(json, installation);
    expect(json).toHaveBeenCalledExactlyOnceWith(["inspect", ...names]);
    expect([...result.keys()]).toEqual(names);
    expect(result.get(names[0])).toBe(values.at(-1));
  });

  it("retains a stopped service for Resume rather than silently starting anything", async () => {
    const values = snapshot();
    values[0].State.Running = false;
    const json = vi.fn().mockResolvedValue(values);
    expect((await inspectOwnedContainers(json, installation)).get(names[0]).State.Running).toBe(false);
    expect(json).toHaveBeenCalledTimes(1);
  });

  it.each(["", "../other", "A".repeat(32), "a".repeat(31)])(
    "rejects an invalid installation before invoking Docker: %s",
    async (id) => {
      const json = vi.fn();
      await expect(inspectOwnedContainers(json, id)).rejects.toThrow();
      expect(json).not.toHaveBeenCalled();
    },
  );

  it.each([
    (v) => v.slice(1),
    (v) => [...v, v[0]],
    (v) => [...v.slice(1), v[1]],
    (v) => [{ ...v[0], Name: "/unrelated" }, ...v.slice(1)],
    (v) => [{ ...v[0], Name: "winesnap-owned-db" }, ...v.slice(1)],
    () => null,
    () => ({}),
  ])("rejects missing, duplicate, foreign or malformed snapshots", async (mutate) => {
    await expect(inspectOwnedContainers(vi.fn().mockResolvedValue(mutate(snapshot())), installation))
      .rejects.toThrow();
  });

  it.each([
    (v) => { v.Config.Labels["winesnap.installation"] = "b".repeat(32); },
    (v) => { v.Config.Labels["winesnap.scope"] = "other"; },
    (v) => { v.Config.User = "root"; },
    (v) => { v.HostConfig.ReadonlyRootfs = false; },
    (v) => { v.HostConfig.CapDrop = []; },
    (v) => { v.HostConfig.SecurityOpt = []; },
    (v) => { v.HostConfig.LogConfig.Type = "json-file"; },
    (v) => { v.HostConfig.PublishAllPorts = true; },
    (v) => { v.HostConfig.PortBindings["3000/tcp"][0].HostIp = "0.0.0.0"; },
    (v) => { v.HostConfig.PortBindings["3000/tcp"][0].HostPort = "80"; },
    (v) => { v.NetworkSettings.Networks.unapproved = {}; },
    (v) => { v.Mounts = [{ Type: "bind", RW: true, Destination: "/data" }]; },
    (v) => { v.Id = "not-an-immutable-id"; },
    (v) => { v.Id = "1".repeat(64); },
  ])("preserves every existing container boundary before returning any result", async (mutate) => {
    const values = snapshot();
    mutate(values.at(-1));
    await expect(inspectOwnedContainers(vi.fn().mockResolvedValue(values), installation))
      .rejects.toThrow();
  });

  it("propagates a failed inspection without a fallback or partial snapshot", async () => {
    const json = vi.fn().mockRejectedValue(new Error("synthetic_inspection_failure"));
    await expect(inspectOwnedContainers(json, installation)).rejects.toThrow("synthetic_inspection_failure");
    expect(json).toHaveBeenCalledTimes(1);
  });

  it("validates the complete snapshot before Resume starts immutable container IDs", () => {
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    const resume = manager.split('if (action === "Resume") {')[1]?.split('if (action === "Start"')[0];
    expect(resume).toContain("await installedServices()");
    expect(resume.indexOf("await installedServices()")).toBeLessThan(resume.indexOf('command(["start"'));
    expect(resume).toContain('command(["start", value.Id])');
    expect(resume).not.toMatch(/volume\(|ensureNetwork|ALTER ROLE|CREATE|build/);
    const verify = manager.split("async function verify() {")[1]?.split("\ntry {")[0];
    expect(verify).toContain("await installedServices()");
    expect(verify).toContain("assert.ok(value?.State.Running)");
    expect(verify).toContain("winesnap_local.installation");
  });
});
