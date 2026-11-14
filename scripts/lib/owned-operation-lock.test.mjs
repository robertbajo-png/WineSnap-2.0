import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  new URL("../inspect-owned-operation-lock.ps1", import.meta.url),
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
