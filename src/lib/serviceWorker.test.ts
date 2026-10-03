import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const remove = vi.fn().mockResolvedValue(true);
  const claim = vi.fn();
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    self: {
      addEventListener: (name: string, listener: (event: unknown) => void) =>
        listeners.set(name, listener),
      clients: { claim },
      skipWaiting: vi.fn(),
      location: { origin: "https://wine.example" },
    },
    caches: {
      keys: async () => [
        "winesnap-assets-v1",
        "winesnap-pages-v1",
        "unrelated-cache",
        "winesnap-assets-2026-10-03",
        "winesnap-pages-2026-10-03",
      ],
      delete: remove,
    },
    URL,
  });
  return { listeners, remove, claim };
}

describe("release service worker", () => {
  it("removes obsolete WineSnap caches but preserves current and unrelated caches", async () => {
    const { listeners, remove, claim } = worker();
    let activation: Promise<unknown> | undefined;
    listeners.get("activate")?.({
      waitUntil: (promise: Promise<unknown>) => {
        activation = promise;
      },
    });
    await activation;
    expect(remove.mock.calls.map(([key]) => key)).toEqual([
      "winesnap-assets-v1",
      "winesnap-pages-v1",
    ]);
    expect(claim).toHaveBeenCalledOnce();
  });

  it.each([
    "https://wine.example/api/private",
    "https://wine.example/_serverFn/test",
    "https://storage.example/private.jpg",
  ])("does not intercept API or external storage requests: %s", (url) => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")?.({ request: { method: "GET", url, mode: "cors" }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
});
