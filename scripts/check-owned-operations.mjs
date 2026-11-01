import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessOwnedOperations, readOwnedOperations } from "./lib/owned-operations.mjs";

if (process.platform !== "win32" || process.argv.length !== 2) {
  process.stderr.write(
    "Run on the owned Windows PC without arguments. This is a read-only check.\n",
  );
  process.exitCode = 1;
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const runtime = await new Promise((resolve) => {
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
        if (error) return resolve(null);
        try {
          resolve(JSON.parse(output.replace(/^\uFEFF/, "")));
        } catch {
          resolve(null);
        }
      },
    );
  });
  const input = await readOwnedOperations(join(homedir(), "WineSnapOwned"));
  const result = assessOwnedOperations({ ...input, runtime });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.localOperationsReady ? 0 : 2;
}
