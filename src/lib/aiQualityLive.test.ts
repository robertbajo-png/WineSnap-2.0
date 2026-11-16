import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  freshQualityCase,
  liveQualityCaseSchema,
  liveQualityIds,
  maySendQualityCase,
  qualityAction,
} from "../../scripts/lib/ai-quality-live-contract";

describe("bounded live quality cohort contracts", () => {
  it("has exactly eight fixed actions without rerouting models", () => {
    expect(new Set(liveQualityIds).size).toBe(8);
    expect(liveQualityIds.map(qualityAction)).toEqual([
      "analyze-wine",
      "analyze-wine",
      "chef-generate",
      "chef-adapt",
      "chef-chat",
      "ask-winesnap",
      "wine-suggestions",
      "chef-extract",
    ]);
  });
  it("never automatically repeats an attempted case, including failed or unknown outcomes", () => {
    const row = freshQualityCase("LIVE-01");
    expect(maySendQualityCase(row)).toBe(true);
    expect(maySendQualityCase({ ...row, outboundAttempts: 1 })).toBe(false);
    expect(maySendQualityCase({ ...row, outboundAttempts: 1, passed: true })).toBe(false);
  });
  it("does not admit raw provider data, credentials, owner IDs or extra attempts into a report", () => {
    for (const extra of [
      { prompt: "private" },
      { answer: "private" },
      { token: "private" },
      { user_id: "private" },
      { outboundAttempts: 2 },
    ]) {
      expect(
        liveQualityCaseSchema.safeParse({ ...freshQualityCase("LIVE-02"), ...extra }).success,
      ).toBe(false);
    }
  });
  it("uses the Windows wrapper's existing private stores, not environment credentials or arguments", () => {
    const parent = readFileSync(
      new URL("../../scripts/test-owned-ai-quality.ps1", import.meta.url),
      "utf8",
    );
    for (const marker of [
      "backend.dpapi",
      "ai-keys.clixml",
      "AreAccessRulesProtected",
      "$start.Environment.Clear()",
      "$job.Assign($process.Handle)",
      "$process.StandardInput.Write($payload)",
      "$err.GetAwaiter().GetResult()|Out-Null",
    ])
      expect(parent).toContain(marker);
    expect(parent).not.toMatch(/Set-Content|WriteAllText|\.supabase\.co|LOVABLE|TERRA/);
  });
  it("persists a replay barrier before native calls and validates immutable fixture ownership", () => {
    const source = readFileSync(
      new URL("../../scripts/check-owned-ai-quality.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("await checkpoint()");
    expect(source).toContain("maySendQualityCase(active)");
    expect(source).toContain("sent < 8");
    expect(source).toContain("assertFixtureOwner(user, fixture)");
    expect(source).toContain('GEMINI_TRANSIENT_RETRY_ENABLED: "false"');
    expect(source).toContain('ownedBrowserFixture(keys, "absent", fixture)');
    expect(source).not.toMatch(/\.supabase\.co|listen\(|createServer|LOVABLE|\.setInputFiles/);
  });
});
