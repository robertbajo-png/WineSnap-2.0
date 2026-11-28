import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../check-owned-private-journal-vault.ps1", import.meta.url));
const envNames = new Set([
  "appdata",
  "comspec",
  "homedrive",
  "homepath",
  "localappdata",
  "onedrive",
  "onedriveconsumer",
  "onedrivecommercial",
  "path",
  "pathext",
  "systemroot",
  "temp",
  "tmp",
  "userprofile",
  "windir",
]);

// Pipe synthetic fixtures only; neither PowerShell transcript nor SQL values enter the report.
export async function verifyWindowsVault({
  installation,
  prune,
  capture,
  captured,
  restore,
  report,
}) {
  assert.ok(process.platform === "win32" && /^[a-f0-9-]{36}$/.test(installation));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => envNames.has(name.toLowerCase())),
  );
  const child = spawn(
    "pwsh.exe",
    ["-NoProfile", "-NonInteractive", "-File", runner, "-Mode", "DatabaseFixture"],
    { env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
  );
  const exited = new Promise((resolve) => child.once("close", resolve));
  child.on("error", () => {});
  child.stdin.on("error", () => child.kill());
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const timeout = setTimeout(() => child.kill(), 120_000);
  let snapshot;
  let phase = "prune";
  const reply = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  try {
    reply({ hello: "winesnap-dev11-vault-fixture-v1", installation });
    for await (const line of lines) {
      assert.ok(line.length <= 384 * 1024);
      const message = JSON.parse(line);
      if (message.report) {
        const result = message.report;
        report.windowsVaultFixtureCleaned = result.cleanupCompleted === true;
        assert.ok(
          phase === "report" && result.completed === true && result.cleanupCompleted === true,
        );
        assert.ok(result.sqlPurgeAndProtectedCapture && result.selectiveRestoreFromWindowsVault);
        phase = "done";
        child.stdin.end();
        continue;
      }
      assert.ok(message.request === phase && phase !== "report" && phase !== "done");
      const envelope = { request: phase, accepted: true };
      switch (phase) {
        case "prune":
          reply({ ...envelope, removed: await prune() });
          phase = "capture";
          break;
        case "capture":
          snapshot = Buffer.from(await capture(), "utf8");
          assert.ok(snapshot.length > 0 && snapshot.length <= 256 * 1024);
          reply({ ...envelope, bytes: snapshot.toString("base64") });
          phase = "captured";
          break;
        case "captured":
          await captured();
          reply(envelope);
          phase = "restore";
          break;
        case "restore": {
          const plaintext = Buffer.from(message.bytes, "base64");
          try {
            assert.ok(snapshot.equals(plaintext));
            reply({ ...envelope, result: await restore(plaintext.toString("utf8")) });
          } finally {
            plaintext.fill(0);
          }
          phase = "report";
          break;
        }
      }
    }
    assert.ok((await exited) === 0 && phase === "done");
    report.windowsVaultSqlPurgeAndSelectiveRestore = true;
  } finally {
    snapshot?.fill(0);
    child.stdin.end();
    lines.close();
    await exited;
    clearTimeout(timeout);
  }
}
