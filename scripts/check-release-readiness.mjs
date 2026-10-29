import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessLocalOperations, assessRelease, readBoundedJson } from "./lib/release-readiness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.argv.length !== 2) {
  process.stderr.write(
    "No arguments accepted. This check neither deploys nor accepts agreements.\n",
  );
  process.exit(1);
}
let commit = null,
  clean = false;
try {
  const options = {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  };
  const samePath = (path) =>
    process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  if (
    samePath(execFileSync("git", ["rev-parse", "--show-toplevel"], options).trim()) !==
    samePath(root)
  )
    throw new Error("source_root_mismatch");
  commit = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
  clean =
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], options).trim() ===
    "";
} catch {
  /* Unknown source state is a blocker, not a reason to disclose command output. */
}
const evidence = await readBoundedJson(join(root, ".winesnap-release-evidence.local.json"));
const assessment = assessRelease(evidence.value, { commit, clean });
if (evidence.state !== "missing")
  assessment.blockers = assessment.blockers.map((code) =>
    code === "operator_evidence_missing" ? "operator_evidence_invalid" : code,
  );
let maintenance = null,
  backup = null,
  restore = null;
if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  const directory = join(process.env.LOCALAPPDATA, "WineSnapHosting");
  maintenance = (await readBoundedJson(join(directory, "maintain-status.json"))).value;
  backup = (await readBoundedJson(join(directory, "backup-status.json"))).value;
  restore = (await readBoundedJson(join(directory, "restore-status.json"))).value;
}
process.stdout.write(
  JSON.stringify(
    {
      ...assessment,
      readOnly: true,
      productionTouched: false,
      localTest: assessLocalOperations({ maintenance, backup, restore }),
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = assessment.releaseReady ? 0 : 2;
