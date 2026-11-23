import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  new URL("../inspect-owned-operation-lock.ps1", import.meta.url),
  "utf8",
);
const runner = readFileSync(new URL("../run-owned-windows.ps1", import.meta.url), "utf8");
const supervisor = readFileSync(
  new URL("../invoke-owned-runtime-action.ps1", import.meta.url),
  "utf8",
);
describe("read-only owned operation lock diagnostic", () => {
  it("inspects only the existing owned operation lock and rejects redirected files", () => {
    expect(source).toContain("Assert-OwnedRuntimeDirectory");
    expect(source).toContain("Join-Path $directory 'operation.lock'");
    expect(source).toContain("ReparsePoint");
    expect(source).toContain("[IO.FileMode]::Open,");
    expect(source).toContain("ownerIdentified=($owners.Count -gt 0)");
  });
  it("allocates the documented output buffer and always ends the temporary inspection session", () => {
    expect(source).toContain("StringBuilder key");
    expect(source).toContain("new StringBuilder(33)");
    expect(source).toContain("finally { RmEndSession(handle); }");
  });
  it("cannot terminate or restart processes, delete locks or open credentials", () => {
    expect(source).not.toMatch(/extern[^;]*Rm(?:Shutdown|Restart)\(/);
    expect(source).not.toMatch(
      /Stop-Process|Remove-Item|\.Kill\(|Unprotect|backend\.dpapi|ReadAllBytes/,
    );
  });
});

describe("manual backup lock acquisition", () => {
  it("allows a bounded wait only for the explicit Backup switch", () => {
    expect(runner).toContain("[switch]$WaitForBackupLock");
    expect(runner).toContain("if($WaitForBackupLock -and $Action -ne 'Backup')");
    expect(runner).toContain("elseif($Action -eq 'Update' -or $WaitForBackupLock){120000}else{0}");
    expect(supervisor).not.toContain("WaitForBackupLock");
  });
  it("waits only before opening credentials or starting the backup process", () => {
    const lock = runner.indexOf("Open-OwnedRuntimeLock -Name operation -WaitMs $waitMs");
    expect(lock).toBeGreaterThan(0);
    expect(runner.indexOf("if(-not $acquired)", lock)).toBeGreaterThan(lock);
    expect(runner.indexOf("Unprotect(", lock)).toBeGreaterThan(lock);
    expect(runner.indexOf("[Diagnostics.Process]::Start(", lock)).toBeGreaterThan(lock);
    expect(runner.match(/\[Diagnostics\.Process\]::Start\(/g)).toHaveLength(1);
  });
});
