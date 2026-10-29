import { describe, expect, it } from "vitest";
import {
  createTimer,
  remainingMs,
  sampleAnswer,
  scaleAmount,
  timerText,
  toggleTimer,
} from "./domain";

describe("isolated Chef prototype", () => {
  it("uses an absolute deadline rather than counting interval ticks", () => {
    const timer = createTimer("1", "Ugn", 2, 1000);
    expect(remainingMs(timer, 61_000)).toBe(60_000);
    expect(remainingMs(timer, 999_000)).toBe(0);
    expect(timerText(remainingMs(timer, 61_000))).toBe("01:00");
  });

  it("preserves paused time and resumes against a new deadline", () => {
    const paused = toggleTimer(createTimer("1", "Bönor", 1, 0), 20_000);
    expect(paused.deadline).toBeNull();
    expect(remainingMs(paused, 900_000)).toBe(40_000);
    const resumed = toggleTimer(paused, 900_000);
    expect(remainingMs(resumed, 910_000)).toBe(30_000);
  });

  it("bounds timer duration and name", () => {
    for (const n of [0, -1, 181, NaN, Infinity])
      expect(() => createTimer("x", "Ugn", n, 0)).toThrow();
    expect(createTimer("x", " ", 1, 0).name).toBe("Timer");
    expect(createTimer("x", "a".repeat(80), 1, 0).name).toHaveLength(50);
  });

  it("never displays negative time and rounds partial seconds up", () => {
    expect(timerText(-1)).toBe("00:00");
    expect(timerText(59_001)).toBe("01:00");
    expect(timerText(0)).toBe("00:00");
  });

  it("scales from two servings without silently changing the source recipe", () => {
    expect(scaleAmount(600, 4)).toBe("1 200");
    expect(scaleAmount(1, 1)).toBe("0,5");
    for (const n of [0, 9, NaN, 1.5]) expect(() => scaleAmount(100, n)).toThrow();
    expect(() => scaleAmount(-1, 2)).toThrow();
  });

  it("labels fixed replies honestly and does not claim a live cellar", () => {
    expect(sampleAnswer("Vilket vin?", "Blomkål", false)).toContain("inte ansluten");
    expect(sampleAnswer("Hjälp", "Blomkål", true)).toContain("förskrivet exempel");
    expect(sampleAnswer("Är det säkert vid allergi?", "Blomkål", false)).toContain(
      "inte en säkerhetsbedömning",
    );
  });
});
