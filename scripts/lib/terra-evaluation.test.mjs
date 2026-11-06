import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("manual Terra evaluation boundaries", () => {
  it("uses the existing private owned credential stores through a parent-bound pipe", () => {
    const source = read("../test-owned-terra.ps1");
    expect(source).toContain("backend.dpapi");
    expect(source).toContain("ai-keys.clixml");
    expect(source).toContain("AreAccessRulesProtected");
    expect(source).toContain("ReparsePoint");
    expect(source).toContain("$start.Environment.Clear()");
    expect(source).toContain("$process.StandardInput.Write($payload)");
    expect(source).toContain("$job.Assign($process.Handle)");
    expect(source).toContain("$err.GetAwaiter().GetResult()|Out-Null");
    expect(source).not.toMatch(/Set-Content|WriteAllText|winesnap\.boleoai\.se|\.supabase\.co/);
  });
  it("runs actual factories only for administrator-tagged synthetic fixture accounts", () => {
    const source = read("../check-owned-terra.ts");
    expect(source).toContain('process.env.WINESNAP_OWNED_TERRA_PIPE, "1"');
    expect(source).toContain("checkOwnedContainer(c, name, keys.installationId)");
    expect(source).toContain("user.app_metadata.owned_feature_run");
    expect(source).toContain("owned-features-");
    expect(source).toContain('u.origin === "https://api.openai.com"');
    expect(source).toContain("beforeCleanup:");
    expect(source).toContain("report.cleanupCompleted = backend.cleanupCompleted");
    expect(source).toContain("report.cases.every((c) => c.passed)");
    expect(source).not.toMatch(/\.supabase\.co|createServer|listen\(|loadCredentials\(/);
    for (const name of [
      "analyze-wine",
      "ask-winesnap",
      "taste-suggestions",
      "wine-suggestions",
      "restaurant-match",
      "extract-preference-signals",
    ])
      expect(source).toContain(`/api/ai/${name}`);
    expect(source).toContain("createChefHandler({");
  });
  it("does not select Terra as a deployed default", () => {
    const source = read("../../supabase/functions/_shared/aiModels.ts");
    expect(source).toContain('labelReading: "gpt-6.1-sol"');
    expect(source).toContain('fast: "gemini-3.8-flash"');
    expect(source).not.toContain("terra");
  });
});
