import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  IndependentRuntimeRequestError,
  waitForIndependentRuntime,
} from "./independent-readiness.mjs";

const clock = vi.hoisted(() => ({ now: 0, pause: vi.fn() }));
vi.mock("node:timers/promises", () => ({ setTimeout: clock.pause }));
beforeEach(() => {
  clock.now = 0;
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  clock.pause.mockImplementation(async (ms) => {
    clock.now += ms;
  });
});
afterEach(() => vi.restoreAllMocks());
const healthy = { response: { status: 200 } };
describe("independent runtime dynamic readiness", () => {
  it("probes the app handler, never a static asset", async () => {
    const request = vi.fn().mockResolvedValue(healthy);
    const result = await waitForIndependentRuntime({ request, checkProcess: vi.fn() });
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/health", undefined, 120000);
    expect(result).toEqual({ attempts: 1, elapsedMs: 0 });
  });
  it("allows a cold handler to initialize inside the existing startup budget", async () => {
    const request = vi
      .fn()
      .mockImplementationOnce(async () => {
        clock.now += 30000;
        throw new IndependentRuntimeRequestError("synthetic cold-load timeout");
      })
      .mockResolvedValue(healthy);
    const result = await waitForIndependentRuntime({ request, checkProcess: vi.fn() });
    expect(result).toEqual({ attempts: 2, elapsedMs: 30250 });
    expect(request.mock.calls[1]).toEqual(["/api/health", undefined, 89750]);
  });
  it("does not count a 503 as ready", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ response: { status: 503 } })
      .mockResolvedValue(healthy);
    expect((await waitForIndependentRuntime({ request, checkProcess: vi.fn() })).attempts).toBe(2);
  });
  it("clips the final probe to the remaining startup budget", async () => {
    const request = vi.fn(async (_path, _options, remaining) => {
      clock.now += Math.min(30000, remaining);
      throw new IndependentRuntimeRequestError("synthetic unreachable server");
    });
    await expect(waitForIndependentRuntime({ request, checkProcess: vi.fn() })).rejects.toThrow(
      "120000ms",
    );
    expect(clock.now).toBe(120000);
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[3][2]).toBe(29250);
  });
  it("fails immediately when the process exits", async () => {
    const request = vi.fn().mockRejectedValue(new IndependentRuntimeRequestError("transport"));
    const checkProcess = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error("synthetic process exited");
      });
    await expect(waitForIndependentRuntime({ request, checkProcess })).rejects.toThrow(
      "process exited",
    );
    expect(request).toHaveBeenCalledOnce();
    expect(clock.pause).not.toHaveBeenCalled();
  });
  it("does not retry security assertions or unexpected server errors", async () => {
    for (const cause of [
      new assert.AssertionError({ message: "canary exposed" }),
      new TypeError("bad request code"),
    ]) {
      const request = vi.fn().mockRejectedValue(cause);
      await expect(waitForIndependentRuntime({ request, checkProcess: vi.fn() })).rejects.toBe(
        cause,
      );
      expect(request).toHaveBeenCalledOnce();
    }
    await expect(
      waitForIndependentRuntime({
        request: vi.fn().mockResolvedValue({ response: { status: 500 } }),
        checkProcess: vi.fn(),
      }),
    ).rejects.toThrow("Unexpected");
    expect(clock.pause).not.toHaveBeenCalled();
  });
  it("retains ordinary request limits and sanitized startup diagnostics", () => {
    const source = readFileSync(
      new URL("../check-independent-runtime.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toContain('process.platform === "win32" ? 30000 : 10000');
    expect(source).toContain("Math.min(requestLimit, remainingMs)");
    expect(source).toContain("signal: AbortSignal.timeout(timeout)");
    expect(source).not.toContain("Server exited before readiness: ${logs}");
  });
});
