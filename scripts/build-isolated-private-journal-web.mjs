import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { finishOwnedInput } from "./lib/owned-process-input.mjs";
import { journalWebRevision } from "./lib/owned-private-journal-delivery.mjs";
import { ownedWebBuildFlags } from "./lib/owned-web-build.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.argv.length, 2);
const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
assert.ok(!/(?:^|[\\/])OneDrive[^\\/]*(?:[\\/]|$)/i.test(root));
const env = Object.fromEntries(
  [
    "PATH",
    "PATHEXT",
    "COMSPEC",
    "SystemRoot",
    "WINDIR",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
  ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
);
const docker = join(env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe");
const engine = "npipe:////./pipe/dockerDesktopLinuxEngine";
const run = (file, args, input, timeout = 60_000) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        env,
        cwd: root,
        timeout,
        windowsHide: true,
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
      },
      (error, stdout) =>
        error ? reject(new Error("isolated_journal_build_failed")) : resolve(stdout),
    );
    child.stdin.on("error", () => {});
    finishOwnedInput(child.stdin, input);
  });
const command = (args, input, timeout) => run(docker, ["--host", engine, ...args], input, timeout);
const tag = "winesnap-planning-rehearsal:dev11-" + journalWebRevision.slice(0, 7);
const flags = ownedWebBuildFlags({
  anon: "sb_publishable_runtime_check_not_a_real_key",
  pantryEnabled: true,
  mealPhotoEnabled: true,
  pilotEnabled: true,
});
assert.match(
  (await command(["image", "inspect", "node:22-bookworm-slim", "--format", "{{.Id}}"]))
    .toString()
    .trim(),
  /^sha256:[a-f0-9]{64}$/,
);
const archive = await run("git.exe", ["archive", "--format=tar", journalWebRevision]);
await command(
  [
    "build",
    "--pull=false",
    "--target",
    "runtime",
    "--tag",
    tag,
    "--label",
    "winesnap.rehearsal=dev11",
    "--label",
    "winesnap.rehearsal-source=" + journalWebRevision,
    ...Object.entries(flags).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]),
    "--file",
    "Dockerfile",
    "-",
  ],
  archive,
  720_000,
);
const [image, source] = (
  await command([
    "image",
    "inspect",
    tag,
    "--format",
    '{{.Id}} {{index .Config.Labels "winesnap.rehearsal-source"}}',
  ])
)
  .toString()
  .trim()
  .split(" ");
assert.match(image, /^sha256:[a-f0-9]{64}$/);
assert.equal(source, journalWebRevision);
console.log(JSON.stringify({ tag, image, source, synthetic: true, journalEnabled: false }));
