import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const web = JSON.parse(readFileSync("config/local-windows/compose.json", "utf8")).services.web;
const launcher = readFileSync("scripts/run-local-windows.ps1", "utf8");

describe("local Windows hosting boundaries", () => {
  it("pins browser and server to the disposable test backend", () => {
    const testOrigin = "https://pzniyupmgwvlldvztzqh.supabase.co";
    expect(web.build.args.VITE_SUPABASE_URL).toBe(testOrigin);
    expect(web.environment.SUPABASE_URL).toBe(testOrigin);
    expect(web.build.args.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(
      web.environment.SUPABASE_PUBLISHABLE_KEY,
    );
    expect(web.build.args.VITE_WINE_IMAGE_PROXY_ENABLED).toBe("true");
    expect(web.build.args.VITE_PRIVACY_CONTROLS_ENABLED).toBe("false");
    expect(web.build.args.VITE_PRIVACY_OPERATIONS_VERIFIED).toBe("false");
    expect(Object.keys(web.environment).sort()).toEqual([
      "NODE_OPTIONS",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_URL",
    ]);
    expect(JSON.stringify(web)).not.toMatch(
      /mervdrbnwgreaifobasw|sb_secret_|SERVICE_ROLE|OPENAI_API_KEY|GEMINI_API_KEY/,
    );
  });

  it("does not expose the app or local files to the LAN", () => {
    expect(web.ports).toEqual([
      { target: 3000, published: "5210", host_ip: "127.0.0.1", protocol: "tcp" },
    ]);
    expect(web.read_only).toBe(true);
    expect(web.volumes).toBeUndefined();
    expect(web.privileged).toBeUndefined();
    expect(web.cap_drop).toEqual(["ALL"]);
    expect(web.security_opt).toEqual(["no-new-privileges:true"]);
    expect(web.tmpfs).toEqual(["/tmp:size=16m,noexec,nosuid,nodev"]);
  });

  it("bounds resources and logs without changing other applications", () => {
    expect(web.mem_limit).toBe("768m");
    expect(web.cpus).toBe(1.5);
    expect(web.pids_limit).toBe(128);
    expect(web.restart).toBe("unless-stopped");
    expect(web.logging.options).toEqual({ "max-size": "10m", "max-file": "3" });
    expect(web.labels["winesnap.scope"]).toBe("local-windows-test");
    expect(launcher).toContain("npipe:////./pipe/dockerDesktopLinuxEngine");
    expect(launcher).toContain("Refusing to operate on an unrelated container.");
  });

  it("reuses public encrypted configuration without unlocking the admin credential", () => {
    expect(launcher).toContain("Import-Clixml -LiteralPath $keyPath");
    expect(launcher).toContain("$stored.Publishable.GetNetworkCredential()");
    expect(launcher).not.toContain("$stored.Secret.GetNetworkCredential()");
    expect(launcher).not.toMatch(/Read-Host|Set-NetFirewall|powercfg|Set-Content/);
    expect(launcher).toContain("$start.Environment.Clear()");
    expect(launcher).toContain("--env-file");
  });
});
