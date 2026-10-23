import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { clientBudgets, clientBudgetIssues } from "./lib/client-budgets.mjs";

const args = process.argv.slice(2);
assert.ok(!args.length || (args.length === 1 && args[0] === "--independent"));
const independent = args.length === 1;
const output = "dist/independent-runtime/public";
const root = new URL("../", import.meta.url);
const assets = [];
for (const name of await readdir(new URL(`${output}/assets/`, root))) {
  if (!/\.(js|css)$/.test(name)) continue;
  const content = await readFile(new URL(`${output}/assets/${name}`, root));
  assets.push({ name, bytes: content.length, gzipBytes: gzipSync(content).length });
}
assets.sort((a, b) => b.gzipBytes - a.gzipBytes);
const issues = clientBudgetIssues(assets);
const report = {
  checkedAt: new Date().toISOString(),
  output,
  passed: issues.length === 0,
  perFileGzipBudgets: clientBudgets,
  assets,
  issues,
  scope: "Built asset sizes only, not device latency, LCP, INP or total route transfer.",
};
await mkdir(new URL("dist/", root), { recursive: true });
const target = new URL(`dist/client-budget${independent ? "-independent" : ""}.json`, root);
await writeFile(target, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    passed: report.passed,
    largest: assets.slice(0, 3),
    report: fileURLToPath(target),
  }),
);
if (!report.passed) process.exitCode = 1;
