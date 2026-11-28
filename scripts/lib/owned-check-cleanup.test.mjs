import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("../open-owned-local.ps1", import.meta.url), "utf8").replaceAll(
  "\r\n",
  "\n",
);
describe("completed headless owner check cleanup", () => {
  it("requires the current private run, completed owner verification and scoped logout", () => {
    expect(source).toContain("Test-CompletedLocalCheck $progress $report.runId");
    for (const field of [
      "acceptance",
      "ownerSessionVerified",
      "probeSessionLoggedOut",
      "internetPaused",
    ])
      expect(source).toContain("'" + field + "'");
    expect(source).toContain("$Value.$field -isnot [bool]");
    expect(source).toContain("$Value.runId -ceq $RunId");
  });
  it("keeps the thirty-second deadline and stops only its already owned probe job", () => {
    expect(source).toContain("if($Action -eq 'Check'){\n    if(-not $process.WaitForExit(30000))");
    expect(source.indexOf("Test-CompletedLocalCheck $progress")).toBeLessThan(
      source.indexOf("$job.Dispose();$job=$null"),
    );
    expect(source).toContain("$process.WaitForExit(5000)");
    expect(source).toContain("[Threading.Tasks.Task]::WaitAll");
    expect(source).not.toContain("Stop-Process");
  });
});
