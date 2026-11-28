import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

export class IndependentRuntimeRequestError extends Error {}

export async function waitForIndependentRuntime({ request, checkProcess }) {
  const started = Date.now();
  const deadline = started + 120000;
  let attempts = 0;
  while (Date.now() < deadline) {
    checkProcess();
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    attempts++;
    try {
      const { response } = await request("/api/health", undefined, remaining);
      if (response.status === 200) return { attempts, elapsedMs: Date.now() - started };
      assert.equal(response.status, 503, "Unexpected runtime readiness response");
    } catch (error) {
      if (!(error instanceof IndependentRuntimeRequestError)) throw error;
    }
    checkProcess();
    const pause = Math.min(250, deadline - Date.now());
    if (pause > 0) await delay(pause);
  }
  throw new Error("Synthetic runtime did not become healthy within 120000ms");
}
