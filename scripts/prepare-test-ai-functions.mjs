import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

assert.equal(process.argv.length, 2, "No deployment target or credentials are accepted");
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.resolve("vite"));
const { rolldown } = await import(pathToFileURL(require.resolve("rolldown")).href);
const names = [
  "analyze-wine",
  "ask-winesnap",
  "restaurant-match",
  "taste-suggestions",
  "wine-suggestions",
  "extract-preference-signals",
];
const folder = new URL("../dist/test-ai-functions/", import.meta.url);
await mkdir(folder, { recursive: true });
for (const name of names) {
  const build = await rolldown({
    cwd: root,
    input: `supabase/functions/${name}/index.ts`,
    platform: "neutral",
    external: (id) => id.startsWith("npm:"),
  });
  try {
    await build.write({ file: fileURLToPath(new URL(`${name}.ts`, folder)), format: "esm" });
  } finally {
    await build.close();
  }
  const output = await readFile(new URL(`${name}.ts`, folder), "utf8");
  assert.ok(output.includes("Deno.serve"));
  assert.ok(output.includes("requireAiAccess"));
  assert.ok(output.includes("consume_ai_quota"));
  assert.ok(!/from\s+["']\./.test(output), "Dashboard bundle must not depend on local files");
  assert.ok(!output.includes("ai.gateway.lovable.dev"));
  assert.ok(!/\b(?:sk-proj-|sb_secret_)[A-Za-z0-9_-]{16,}/.test(output));
}
await writeFile(
  new URL("manifest.json", folder),
  JSON.stringify(
    { project: "pzniyupmgwvlldvztzqh", names, verifyJwt: true, providerKeysRequired: true },
    null,
    2,
  ),
);
console.log(
  "Prepared six guarded AI functions for WineSnap-test. No deployment or AI request performed.",
);
