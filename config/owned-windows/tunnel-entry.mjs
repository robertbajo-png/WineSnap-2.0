import { lstat, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import assert from "node:assert/strict";
import { validateOwnedTunnelStore } from "./lib/owned-tunnel.mjs";

const file = "/tmp/winesnap-tunnel/token";
let stopped = false;
let child;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
    child?.kill(signal);
  });
try {
  while (!stopped) {
    try {
      await lstat(file);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await setTimeout(200);
    }
  }
  if (!stopped) {
    const info = await lstat(file);
    assert.ok(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.uid === 1000 &&
        !(info.mode & 0o077) &&
        info.size <= 8192,
    );
    const token = await readFile(file, "utf8");
    const identity = JSON.parse(Buffer.from(token, "base64").toString());
    validateOwnedTunnelStore({
      version: 1,
      project: "winesnap-owned-local",
      hostname: "winesnap.boleoai.se",
      accountId: identity.a,
      tunnelId: identity.t,
      token,
    });
    child = spawn(
      "/usr/local/bin/cloudflared",
      [
        "tunnel",
        "--no-autoupdate",
        "--loglevel",
        "error",
        "--metrics",
        "0.0.0.0:20241",
        "run",
        "--token-file",
        file,
      ],
      { env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp" }, stdio: "ignore" },
    );
    child.once("error", () => {
      process.exitCode = 1;
    });
    child.once("exit", (code) => {
      process.exitCode = stopped ? 0 : code || 1;
    });
  }
} catch {
  process.exitCode = 1;
}
