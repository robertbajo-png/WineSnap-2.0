import { execFile } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readOwnedRuntimeStatus } from "./owned-runtime-status.mjs";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

const root = join(process.cwd(), "synthetic-status-root");

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("owned Windows runtime inspection", () => {
  it("waits up to 45 seconds for the read-only check without forwarding provider keys", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-only");
    const report = { project: "winesnap-owned-local", readOnly: true, healthy: true };
    vi.mocked(execFile).mockImplementation((_binary, _args, _options, callback) =>
      callback(null, "\uFEFF" + JSON.stringify(report), ""),
    );
    await expect(readOwnedRuntimeStatus(root)).resolves.toEqual(report);
    expect(execFile).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/pwsh\.exe$/),
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        join(root, "scripts/get-owned-windows-status.ps1"),
      ],
      expect.objectContaining({ cwd: root, windowsHide: true, timeout: 45000, maxBuffer: 65536 }),
      expect.any(Function),
    );
    expect(vi.mocked(execFile).mock.calls[0][2].env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it.each([
    [new Error("timeout"), '{"healthy":true}'],
    [null, "invalid JSON"],
    [null, '[{"healthy":true}]'],
  ])("never accepts a failed or malformed check (%#)", async (error, stdout) => {
    vi.mocked(execFile).mockImplementation((_binary, _args, _options, callback) =>
      callback(error, stdout, ""),
    );
    await expect(readOwnedRuntimeStatus(root)).resolves.toBeNull();
  });
});
