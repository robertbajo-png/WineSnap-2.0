import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessOwnedOperations, readOwnedOperations } from "./lib/owned-operations.mjs";
import { readOwnedRuntimeStatus } from "./lib/owned-runtime-status.mjs";

if (process.platform !== "win32" || process.argv.length !== 2) {
  process.stderr.write(
    "Run on the owned Windows PC without arguments. This is a read-only check.\n",
  );
  process.exitCode = 1;
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const runtime = await readOwnedRuntimeStatus(root);
  const input = await readOwnedOperations(join(homedir(), "WineSnapOwned"));
  const result = assessOwnedOperations({ ...input, runtime });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.localOperationsReady ? 0 : 2;
}
