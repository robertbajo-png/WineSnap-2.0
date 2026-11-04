import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessRelease, readBoundedJson } from "./lib/release-readiness.mjs";
import { assessOwnedOperations, readOwnedOperations } from "./lib/owned-operations.mjs";
import { readOwnedRuntimeStatus } from "./lib/owned-runtime-status.mjs";

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
const available = process.platform === "win32";
const operations = available
  ? {
      ...(await readOwnedOperations(join(homedir(), "WineSnapOwned"))),
      runtime: await readOwnedRuntimeStatus(root),
    }
  : {};
process.stdout.write(
  JSON.stringify(
    {
      ...assessment,
      readOnly: true,
      productionTouched: false,
      ownedWindows: {
        ...assessOwnedOperations(operations),
        scope: "owned_windows_only",
        available,
        affectsReleaseApproval: false,
      },
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = assessment.releaseReady ? 0 : 2;
