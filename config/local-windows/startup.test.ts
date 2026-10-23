import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launcher = readFileSync("scripts/run-local-windows.ps1", "utf8");
const startup = readFileSync("scripts/install-local-windows-startup.ps1", "utf8");
const session = readFileSync("scripts/start-local-windows-session.ps1", "utf8");
const tunnel = readFileSync("scripts/run-local-windows-internet.ps1", "utf8");

describe("Windows user-logon startup and protected test tunnel", () => {
  it("installs a user-owned hidden startup shortcut without elevation or a saved password", () => {
    expect(startup).toContain("[Environment]::GetFolderPath('Startup')");
    expect(startup).toContain("WineSnap Local Test.lnk");
    expect(startup).toContain("$shortcut.Description -ne $marker");
    expect(startup).toContain("-NoProfile -NonInteractive -WindowStyle Hidden -File");
    expect(startup).not.toMatch(/ExecutionPolicy|RunAs|Highest|SYSTEM|Password|HKLM/);
  });

  it("resumes installed containers without rebuilding or unlocking keys at logon", () => {
    expect(launcher).toContain("'Restart', 'Resume'");
    expect(session).toContain("-Action Resume");
    expect(session).toContain("--context desktop-linux info");
    expect(session).toContain("Start-Process -FilePath $desktop -WindowStyle Hidden");
    expect(session).not.toMatch(
      /Import-Clixml|Read-Host|--build|SUPABASE_SERVICE_ROLE|OPENAI_API_KEY/,
    );
  });

  it("limits the pinned tunnel image to the separate WineSnap Docker network", () => {
    expect(tunnel).toMatch(/cloudflare\/cloudflared@sha256:[a-f0-9]{64}/);
    expect(tunnel).toContain("'winesnap-local_default'");
    expect(tunnel).toContain("'http://winesnap-local-web-1:3000'");
    expect(tunnel).toContain("'--read-only', '--cap-drop', 'ALL'");
    expect(tunnel).toContain("'no-new-privileges:true'");
    expect(tunnel).toContain("'--memory', '128m'");
    expect(tunnel).toContain("$container.HostConfig.PublishAllPorts");
    expect(tunnel).not.toMatch(
      /'--publish'|'--privileged'|'--volume'|'--network', 'host'|--no-tls-verify/,
    );
  });

  it("requires an exact email and validates Cloudflare's actual HTTPS login redirect", () => {
    expect(tunnel).toContain("'--allowed-mail', $AllowedMail");
    expect(tunnel).toContain("$container.Config.Cmd[$mailIndex + 1] -notmatch");
    expect(tunnel).toContain("$handler.AllowAutoRedirect = $false");
    expect(tunnel).toContain("$authHost -eq 'login.trycloudflare.com'");
    expect(tunnel).toContain("$location.AbsolutePath -eq '/authorize'");
    expect(tunnel).toContain("Unauthenticated access must not reach the app.");
    expect(tunnel).toContain("Invoke-TunnelDocker @('stop', $name)");
    expect(tunnel).not.toMatch(
      /ServerCertificateCustomValidationCallback|SkipCertificateCheck|overwrite-dns/,
    );
  });
});
