import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ownedTunnelConfiguration,
  ownedInternetOrigin,
  ownedTunnelImage,
} from "./owned-internet.mjs";

const options = () => ({
  tunnelId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  teamName: "example-team",
  audience: "f".repeat(64),
});
describe("owned internet ingress preparation", () => {
  it("keeps the real routing probe unexposed and cleans up only its own labelled fixture", () => {
    const source = readFileSync(new URL("../check-owned-ingress.mjs", import.meta.url), "utf8");
    expect(source).toContain('const scope = "owned-internet-check"');
    expect(source).toContain('found.Config.Labels["winesnap.check"], run');
    expect(source).toContain("Object.keys(found.HostConfig.PortBindings ?? {}).length, 0");
    expect(source).toContain('"winesnap-owned-web", "node"');
    expect(source).not.toMatch(
      /"--publish"|"--privileged"|"volume", "rm"|OPENAI_API_KEY|GEMINI_API_KEY/,
    );
  });
  it("requires Access validation on the hostname rule itself, with a deny catchall", () => {
    const config = ownedTunnelConfiguration(options());
    expect(config.originRequest).toBeUndefined();
    expect(config.ingress).toHaveLength(2);
    expect(config.ingress[0]).toMatchObject({
      hostname: "winesnap.boleoai.se",
      service: "http://winesnap-owned-internet:8080",
      originRequest: {
        access: { required: true, teamName: "example-team", audTag: ["f".repeat(64)] },
      },
    });
    expect(config.ingress[1]).toEqual({ service: "http_status:404" });
    expect(JSON.stringify(config)).not.toMatch(/localhost|127\.0\.0\.1|8026|5432|api_key|secret/i);
    expect(ownedTunnelImage).toMatch(/^cloudflare\/cloudflared@sha256:[a-f0-9]{64}$/);
    expect(ownedInternetOrigin).toBe("https://winesnap.boleoai.se");
  });
  it("refuses missing or injected Access identities", () => {
    for (const changes of [
      { audience: "" },
      { audience: "wrong" },
      { teamName: "x/../../" },
      { teamName: "https://untrusted.example.org" },
      { tunnelId: "../../credentials" },
    ])
      expect(() => ownedTunnelConfiguration({ ...options(), ...changes })).toThrow();
  });
  it("does not route the mailbox, Auth admin or maintenance controls", () => {
    const config = readFileSync(
      new URL("../../config/owned-windows/internet.conf", import.meta.url),
      "utf8",
    );
    expect(config).toContain("server_name winesnap.boleoai.se;");
    expect(config).toContain("return 444;");
    expect(config).toContain("if ($blocked_origin) { return 403; }");
    expect(config).toContain("location ^~ /backend/auth/v1/admin { return 404; }");
    expect(config).toContain("location ^~ /api/public/hooks/ { return 404; }");
    expect(config).toContain("location ^~ /api/privacy/privacy-maintenance { return 404; }");
    expect(config).toContain("location /backend/ { return 404; }");
    expect(config).not.toMatch(/owned-mail|8026|8025|5432|proxy_pass \$/);
    expect(config).not.toMatch(/includeSubDomains|preload/);
  });
});
