import { execFile } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readOwnedRuntimeStatus } from "./owned-runtime-status.mjs";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("shared read-only owned supervisor inspection", () => {
  it("uses the status helper with bounded pipes and no inherited provider or Node injection settings", async () => {
    for (const name of [
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "NODE_OPTIONS",
      "WINESNAP_PRIVATE_CANARY",
    ])
      vi.stubEnv(name, "synthetic-private-canary");
    execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(null, '\uFEFF{"project":"winesnap-owned-local","healthy":true}'),
    );
    const report = await readOwnedRuntimeStatus("synthetic-source-root");
    expect(report.healthy).toBe(true);
    const [file, args, options] = execFile.mock.calls[0];
    expect(file.replaceAll("\\", "/")).toMatch(/dependencies\/native\/powershell\/pwsh\.exe$/);
    expect(args).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-File",
      join("synthetic-source-root", "scripts/get-owned-windows-status.ps1"),
    ]);
    expect(options).toMatchObject({
      cwd: "synthetic-source-root",
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 65536,
    });
    expect(options).not.toHaveProperty("shell");
    expect(JSON.stringify(options.env)).not.toContain("synthetic-private-canary");
    expect(args.join(" ")).not.toContain("run-owned-windows");
  });

  it.each([
    "broken synthetic-private-canary",
    " ".repeat(65537),
    "[]",
    "null",
    "true",
    "123",
    undefined,
  ])("refuses malformed, oversized or non-object output (%#)", async (output) => {
    execFile.mockImplementation((_file, _args, _options, callback) => callback(null, output));
    expect(await readOwnedRuntimeStatus("synthetic-source-root")).toBeNull();
  });

  it("does not expose process errors or synchronous launch failures", async () => {
    execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(new Error("synthetic-private-canary"), '{"healthy":true}'),
    );
    expect(await readOwnedRuntimeStatus("synthetic-source-root")).toBeNull();
    execFile.mockImplementation(() => {
      throw new Error("synthetic-private-canary");
    });
    expect(await readOwnedRuntimeStatus("synthetic-source-root")).toBeNull();
  });
});
