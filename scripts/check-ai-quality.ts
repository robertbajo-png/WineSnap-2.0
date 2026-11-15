import { runDeterministicAiQuality } from "./lib/ai-quality-suite";

// Deliberately no credential loading, backend calls, provider calls or automatic live mode.
if (process.argv.slice(2).join(" ") !== "--deterministic") {
  process.stdout.write(
    JSON.stringify({ completed: false, failure: "explicit_deterministic_mode_required" }) + "\n",
  );
  process.exitCode = 2;
} else {
  const report = runDeterministicAiQuality();
  process.stdout.write(JSON.stringify(report) + "\n");
  if (!report.completed) process.exitCode = 1;
}
