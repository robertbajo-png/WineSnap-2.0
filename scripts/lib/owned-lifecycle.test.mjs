import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { ownedResumeOrder, planOwnedMigrations } from "./owned-lifecycle.mjs";

const source = (name, sql = "SELECT 1;") => ({ name, source: sql });
const installed = (item) => ({
  name: item.name,
  sha256: createHash("sha256").update(item.source).digest("hex"),
});
describe("owned Windows lifecycle", () => {
  it("uses a private non-virtualized user-profile directory for all owned tools", () => {
    const runtime = readFileSync(new URL("./owned-windows-runtime.ps1", import.meta.url), "utf8");
    expect(runtime).toContain("[Environment]::GetFolderPath('UserProfile')");
    for (const file of [
      "run-owned-windows.ps1",
      "watch-owned-windows.ps1",
      "rehearse-owned-recovery.ps1",
    ])
      expect(readFileSync(new URL("../" + file, import.meta.url), "utf8")).toContain(
        "Get-OwnedRuntimeDirectory",
      );
    const migrate = readFileSync(
      new URL("../migrate-owned-windows-state.ps1", import.meta.url),
      "utf8",
    );
    expect(migrate).toContain("-Immutable");
    expect(migrate).toContain("Get-FileHash -LiteralPath");
    expect(migrate).toContain("sourceRetained=$true");
    expect(migrate).not.toMatch(/Unprotect|Import-Clixml|Remove-Item|Move-Item/);
    expect(migrate).toContain("S-1-5-18");
  });
  it("accepts the repository's actual UUID-suffixed migration names", () => {
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    const sources = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => ({
        name,
        source: readFileSync(new URL(name, dir), "utf8"),
      }));
    expect(planOwnedMigrations(sources, sources.map(installed))).toEqual([]);
  });
  it("keeps the supervisor attached to a current-user logon task", () => {
    const startup = readFileSync(
      new URL("../install-owned-windows-startup.ps1", import.meta.url),
      "utf8",
    );
    const session = readFileSync(
      new URL("../start-owned-windows-session.ps1", import.meta.url),
      "utf8",
    );
    expect(startup).toContain("-LogonType Interactive -RunLevel Limited");
    expect(startup).toContain("-MultipleInstances Parallel");
    expect(startup).toContain("-Priority 4");
    expect(session).toContain("Open-OwnedRuntimeLock -Name session");
    expect(startup).toContain("-ExecutionTimeLimit ([TimeSpan]::Zero)");
    expect(startup).toContain("-RestartCount 3");
    expect(startup).toContain("-RepetitionInterval ([TimeSpan]::FromMinutes(2))");
    expect(startup).toContain("Security.Principal.NTAccount");
    expect(startup).toContain("Unrelated scheduled task refused.");
    expect(startup).not.toMatch(/RunAs|ExecutionPolicy|Highest|-Password\b/);
    expect(session).toContain("-Action Resume");
    expect(session).toContain("& $watch");
    expect(session).not.toContain("Start-Process -FilePath (Get-Process");
    expect(session).not.toContain("'Docker Desktop.exe'");
    const dockerStartup = readFileSync(
      new URL("../start-owned-docker-engine.ps1", import.meta.url),
      "utf8",
    );
    expect(dockerStartup).toContain("-WindowStyle Hidden");
    expect(startup).toContain("WineSnap Docker Engine.lnk");
  });
  it("keeps reports bounded, private and atomic and recognizes operation locks", () => {
    const runtime = readFileSync(new URL("./owned-windows-runtime.ps1", import.meta.url), "utf8");
    const watch = readFileSync(new URL("../watch-owned-windows.ps1", import.meta.url), "utf8");
    expect(runtime).toContain("$item.Length -gt 64KB");
    expect(runtime).toContain("AreAccessRulesProtected");
    expect(runtime).toContain("[IO.FileShare]::None");
    expect(runtime).toContain("@(32,33)");
    expect(runtime).toContain("ReparsePoint");
    expect(runtime).toContain("[ValidateSet('watch','startup')]");
    expect(runtime).toContain("'-status.pending.json'");
    expect(runtime).toContain("Move-Item -LiteralPath $pending");
    expect(watch).toContain("operation_already_running");
    expect(watch).toContain("processId=$PID");
    expect(watch).toContain("$power.Dispose()");
  });
  it("holds only a reversible AC-powered system request, not global power settings", () => {
    const runtime = readFileSync(new URL("./owned-windows-runtime.ps1", import.meta.url), "utf8");
    expect(runtime).toContain("status.AC==1");
    expect(runtime).toContain("PowerSetRequest(handle,1)");
    expect(runtime).toContain("PowerClearRequest(handle,1)");
    expect(runtime).toContain("CloseHandle(handle)");
    expect(runtime).not.toMatch(/powercfg|SetSuspendState|Set-NetFirewall|PowerSetActiveScheme/);
  });
  it("loads verified native helpers without compiling them during supervisor startup", () => {
    const runtime = readFileSync(new URL("./owned-windows-runtime.ps1", import.meta.url), "utf8");
    const startup = readFileSync(
      new URL("../install-owned-windows-startup.ps1", import.meta.url),
      "utf8",
    );
    expect(startup).toContain("Install-OwnedNativeHelpers");
    expect(runtime).toContain("SHA256]::HashData");
    expect(runtime).toContain("$Source.Replace");
    expect(runtime).toContain("[Environment]::Version.Major");
    expect(runtime).toContain("Get-FileHash -LiteralPath $path -Algorithm SHA256");
    expect(runtime).toContain("Compiled helper verification failed.");
    expect(runtime).toContain("Add-Type -Path $path");
    for (const name of ["Initialize-OwnedProcessJob", "Initialize-OwnedPowerProtection"]) {
      const initializer = runtime.split(`function ${name} {`)[1]?.split("\nfunction ")[0];
      expect(initializer).toContain("Import-OwnedNativeHelper -Kind");
      expect(initializer).not.toContain("Add-Type -TypeDefinition");
    }
  });
  it("contains operation descendants before releasing the startup handshake", () => {
    const runtime = readFileSync(new URL("./owned-windows-runtime.ps1", import.meta.url), "utf8");
    expect(runtime).toContain("limits.Basic.Flags=0x2000");
    expect(runtime).toContain("AssignProcessToJobObject");
    expect(runtime.indexOf("$job.Assign($process.Handle)")).toBeLessThan(
      runtime.indexOf("$process.StandardInput.WriteLine"),
    );
    expect(runtime).toContain("$job.Dispose()");
    const child = readFileSync(
      new URL("../invoke-owned-runtime-action.ps1", import.meta.url),
      "utf8",
    );
    expect(child).toContain("[Console]::In.ReadLine()");
    expect(child.indexOf("handshake required")).toBeLessThan(
      child.indexOf("run-owned-windows.ps1"),
    );
  });
  it("resumes dependencies before the existing app, without reprovisioning", () => {
    expect(ownedResumeOrder).toEqual(["db", "mail", "auth", "rest", "storage", "gateway", "web"]);
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    const resume = manager
      .split('if (action === "Resume") {')[1]
      ?.split('if (action === "Start"')[0];
    expect(resume).toContain("await existing(service)");
    expect(resume).toContain('command(["start", name(service)])');
    expect(resume).not.toMatch(/volume\(|ensureNetwork|ALTER ROLE|CREATE|docker.*build/);
  });
  it("plans only missing migrations in source order", () => {
    const a = source("20261025_a.sql"),
      b = source("20261026_b.sql");
    expect(planOwnedMigrations([b, a], [installed(a)])).toEqual([{ ...b, ...installed(b) }]);
    expect(planOwnedMigrations([a, b], [installed(a), installed(b)])).toEqual([]);
  });
  it("fails closed on changed, foreign or duplicate installed history", () => {
    const a = source("20261025_a.sql");
    for (const rows of [
      [{ ...installed(a), sha256: "a".repeat(64) }],
      [installed(source("foreign.sql"))],
      [installed(a), installed(a)],
      [{ ...installed(a), sha256: "not-a-hash" }],
    ])
      expect(() => planOwnedMigrations([a], rows)).toThrow();
  });
  it("rejects redirected or duplicate migration sources", () => {
    const a = source("20261025_a.sql");
    for (const rows of [[a, a], [source("../elsewhere.sql")], [source("x.sql;DROP")]])
      expect(() => planOwnedMigrations(rows, [])).toThrow();
  });
  it("uses one history query and keeps migration transactions and checksums", () => {
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(manager).toContain("planOwnedMigrations(sources, applied)");
    expect(manager).toContain("json_agg(json_build_object('name',name,'sha256',sha256)");
    expect(manager).not.toContain("SELECT sha256 FROM winesnap_local.migrations WHERE name=");
    expect(manager).toContain("BEGIN;\\n${item.source}");
    expect(manager).toContain("recovering = true");
    expect(manager).toContain("Math.min(timeout, remaining)");
  });
  it("restarts only the validated app and reinstalls its RAM credentials", () => {
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    const restart = manager
      .split('if (action === "RestartApp") {')[1]
      ?.split("if (action.startsWith")[0];
    expect(restart).toContain('await existing("web")');
    expect(restart).toContain('command(["restart", name("web")])');
    expect(restart).toContain("await wait(() => verify())");
    expect(restart).not.toMatch(/DROP|migrations|volume|build/);
  });
});
