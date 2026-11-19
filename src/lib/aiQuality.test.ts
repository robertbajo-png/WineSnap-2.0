import { describe, expect, it, vi } from "vitest";
import { aiQualityCases, runDeterministicAiQuality } from "../../scripts/lib/ai-quality-suite";

describe("fixed deterministic AI quality gates v1", () => {
  it.each(aiQualityCases)("$id ($area)", ({ check }) => {
    expect(check()).toBe(true);
  });
  it("has unique stable IDs and never makes live or backend calls", () => {
    const send = vi.fn(() => {
      throw Error("network forbidden");
    });
    vi.stubGlobal("fetch", send);
    try {
      const report = runDeterministicAiQuality();
      expect(new Set(report.cases.map((c) => c.id)).size).toBe(26);
      expect(report.completed).toBe(true);
      expect(report.providerCalls).toBe(0);
      expect(report.liveProvider).toBe(false);
      expect(report.semanticQualityVerified).toBe(false);
      expect(report.medicalSafetyCertified).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(Object.keys(report.cases[0]).sort()).toEqual(["area", "durationMs", "id", "passed"]);
      expect(JSON.stringify(report)).not.toMatch(
        /tomat|ZEHN|MORGEN|user_id|source_excerpt|prompt|answer|secret|token|@/i,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
