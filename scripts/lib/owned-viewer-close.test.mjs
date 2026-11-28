import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForOwnedViewerClose } from "./owned-viewer-close.mjs";
afterEach(() => vi.useRealTimers());
function browser(pages) {
  return Object.assign(new EventEmitter(), {
    isConnected: () => true,
    contexts: () =>
      pages.map((list) => ({ pages: () => list.map((closed) => ({ isClosed: () => closed })) })),
  });
}
describe("owned viewer shutdown", () => {
  it("completes when all pages are closed even if Chromium remains connected", async () => {
    vi.useFakeTimers();
    const pages = [[false]],
      b = browser(pages);
    let finished = false;
    const wait = waitForOwnedViewerClose(b).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(finished).toBe(false);
    pages[0] = [];
    await vi.advanceTimersByTimeAsync(250);
    await wait;
    expect(b.isConnected()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(b.listenerCount("disconnected")).toBe(0);
  });
  it("does not release while another context contains any open page", async () => {
    vi.useFakeTimers();
    const pages = [[], [false]],
      b = browser(pages);
    let finished = false;
    const wait = waitForOwnedViewerClose(b).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toBe(false);
    pages[1] = [true];
    await vi.advanceTimersByTimeAsync(250);
    await wait;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans polling on browser disconnect without closing anything itself", async () => {
    vi.useFakeTimers();
    const b = browser([[false]]);
    const wait = waitForOwnedViewerClose(b);
    b.emit("disconnected");
    await wait;
    expect(vi.getTimerCount()).toBe(0);
    expect(b.listenerCount("disconnected")).toBe(0);
  });
});
