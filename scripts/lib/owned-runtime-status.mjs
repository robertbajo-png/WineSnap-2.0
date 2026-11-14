import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

// Inspect the existing supervisor only; never run the provisioning/start wrapper.
export function readOwnedRuntimeStatus(root) {
  return new Promise((resolve) => {
    try {
      execFile(
        join(
          homedir(),
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          join(root, "scripts/get-owned-windows-status.ps1"),
        ],
        {
          cwd: root,
          windowsHide: true,
          timeout: 20000,
          maxBuffer: 65536,
          env: Object.fromEntries(
            [
              "PATH",
              "PATHEXT",
              "COMSPEC",
              "SystemRoot",
              "WINDIR",
              "SystemDrive",
              "ProgramData",
              "ALLUSERSPROFILE",
              "USERPROFILE",
              "APPDATA",
              "LOCALAPPDATA",
              "TEMP",
              "TMP",
            ].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])),
          ),
        },
        (error, output) => {
          if (error || typeof output !== "string" || Buffer.byteLength(output) > 65536)
            return resolve(null);
          try {
            const value = JSON.parse(output.replace(/^\uFEFF/, ""));
            resolve(value && typeof value === "object" && !Array.isArray(value) ? value : null);
          } catch {
            resolve(null);
          }
        },
      );
    } catch {
      resolve(null);
    }
  });
}
