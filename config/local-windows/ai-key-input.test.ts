import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const input = readFileSync("scripts/store-local-openai-key.ps1", "utf8");

describe("existing OpenAI key local input", () => {
  it("requires hidden interactive input and never accepts a secret argument", () => {
    expect(input).toContain("param([switch]$Check, [switch]$SelfTest)");
    expect(input).toContain("[Console]::IsInputRedirected");
    expect(input).toContain("[Console]::IsOutputRedirected");
    expect(input).toContain("Read-Host 'OPENAI_API_KEY (hidden)' -AsSecureString");
    expect(input).not.toMatch(
      /Invoke-WebRequest|Invoke-RestMethod|HttpClient|SetEnvironmentVariable/,
    );
  });

  it("uses private Windows-encrypted storage outside the source tree", () => {
    expect(input).toContain("Join-Path $env:LOCALAPPDATA 'WineSnapHosting'");
    expect(input).toContain("'ai-keys.clixml'");
    expect(input).toContain("Export-Clixml -LiteralPath $temporary");
    expect(input).toContain("$acl.SetAccessRuleProtection($true, $false)");
    expect(input).toContain("ReparsePoint");
    expect(input).toContain("[pscredential]::new('OPENAI_API_KEY', $inputKey)");
    expect(input).not.toMatch(/Set-Content|WriteAllText|ConvertFrom-SecureString/);
  });

  it("pins metadata to test and confines the synthetic encryption check", () => {
    expect(input).toContain("Purpose='WineSnap-local-test'");
    expect(input).toContain("Project='pzniyupmgwvlldvztzqh'");
    expect(input).toContain("'key-input-selftest-*.local'");
    expect(input).toContain("(Split-Path -Parent $path) -eq $folder");
    expect(input).toContain("apiValidityChecked=$false");
    expect(input).not.toContain("mervdrbnwgreaifobasw");
  });
});
