import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const doubles = vi.hoisted(() => ({ read: vi.fn(), stat: vi.fn(), createClient: vi.fn() }));
vi.mock("node:fs/promises", () => ({ lstat: doubles.stat, readFile: doubles.read }));
vi.mock("@supabase/supabase-js", () => ({ createClient: doubles.createClient }));
import {
  getOperationsAdmin,
  localBackendFetch,
  operationsCredentials,
} from "./localCredentials.server";
const keys = {
  version: 1,
  project: "pzniyupmgwvlldvztzqh",
  publishable: "sb_publishable_synthetic",
  secret: "sb_secret_synthetic",
  openai: "sk-synthetic-key-never-a-real-provider-key",
  cronSecret: "synthetic-cron-".repeat(4),
  privacyCronSecret: "synthetic-privacy-".repeat(4),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WINESNAP_LOCAL_AI_ENABLED", "true");
  vi.stubEnv("WINESNAP_LOCAL_OPERATIONS_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://pzniyupmgwvlldvztzqh.supabase.co");
  doubles.stat.mockImplementation(async (path: string) => ({
    uid: process.getuid?.(),
    mode: path.endsWith(".json") ? 0o600 : 0o700,
    size: 1000,
    isSymbolicLink: () => false,
    isFile: () => path.endsWith(".json"),
    isDirectory: () => !path.endsWith(".json"),
  }));
  doubles.read.mockResolvedValue(JSON.stringify(keys));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("local operations credential scope", () => {
  it.each(["https://other.invalid", "https://production.invalid"])(
    "refuses %s even with an inherited admin key",
    async (origin) => {
      vi.stubEnv("SUPABASE_URL", origin);
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-fall-back");
      await expect(getOperationsAdmin()).rejects.toThrow();
      expect(doubles.read).not.toHaveBeenCalled();
      expect(doubles.createClient).not.toHaveBeenCalled();
    },
  );
  it("requires both narrow runtime switches", async () => {
    vi.stubEnv("WINESNAP_LOCAL_OPERATIONS_ENABLED", "false");
    await expect(operationsCredentials()).rejects.toThrow("disabled");
    expect(doubles.read).not.toHaveBeenCalled();
  });
  it("requires separate installed scheduler secrets", async () => {
    doubles.read.mockResolvedValue(JSON.stringify({ ...keys, privacyCronSecret: undefined }));
    await expect(operationsCredentials()).rejects.toThrow("not provisioned");
  });
  it("does not cache stale credentials across container restoration", async () => {
    await operationsCredentials();
    doubles.read.mockResolvedValue(JSON.stringify({ ...keys, project: "unapproved" }));
    await expect(operationsCredentials()).rejects.toThrow();
  });
  it("restricts all admin requests to the approved backend and refuses redirects", async () => {
    const send = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", send);
    expect(() => localBackendFetch("https://other.invalid/private")).toThrow();
    expect(send).not.toHaveBeenCalled();
    await localBackendFetch("https://pzniyupmgwvlldvztzqh.supabase.co/rest/v1/wines");
    expect(send.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
});
describe("Windows maintenance and application backup boundaries", () => {
  it("backs up only the test backend and never publishes a backup HTTP endpoint", () => {
    const code = readFileSync("config/local-windows/operations-client.mjs", "utf8");
    expect(code).toContain('const project = "pzniyupmgwvlldvztzqh"');
    expect(code).toContain("process.getuid()");
    expect(code).toContain("privacy_erasure_receipts");
    expect(code).toContain('redirect: "error"');
    expect(code).not.toContain("mervdrbnwgreaifobasw");
    expect(code).not.toContain("password_hash");
  });
  it("encrypts backups before host persistence and actually decrypts to verify them", () => {
    const code = readFileSync("scripts/run-local-windows-operations.ps1", "utf8");
    expect(code).toContain("ProtectedData]::Protect");
    expect(code).toContain("ProtectedData]::Unprotect");
    expect(code).toContain("FixedTimeEquals");
    expect(code).toContain("fullDatabaseBackup = $false");
    expect(code).toContain("AddDays(-7)");
    expect(code).not.toMatch(/Write-Host \$raw|Set-Content[^\n]*\$raw/);
  });
  it("does not restart an intentionally stopped app and bounds job retries", () => {
    const code = readFileSync("scripts/watch-local-windows.ps1", "utf8");
    expect(code).toContain("winesnap-local|local-windows-test|true|healthy");
    expect(code).toContain("configure-local-windows-ai.ps1");
    expect(code).toContain("-Action Check");
    expect(code).not.toContain("--eval $code");
    expect(code).toContain("Mutex");
    expect(code).toContain("Start-Sleep -Seconds 60");
    expect(code).toContain("[DateTimeOffset]$Last.checkedAt");
    expect(code).not.toContain("[DateTime]::Parse($last.checkedAt)");
    expect(code).not.toMatch(/docker restart|docker start|Read-Host|Stop-Process/);
  });
});
