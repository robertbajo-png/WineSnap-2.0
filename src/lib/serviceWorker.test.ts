import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const remove = vi.fn().mockResolvedValue(true);
  const claim = vi.fn();
  const skipWaiting = vi.fn();
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const match = vi.fn().mockResolvedValue(new Response("offline"));
  const fetcher = vi.fn().mockResolvedValue(new Response("account HTML"));
  const currentCaches: string[] = [];
  currentCaches.push(
    ...runInNewContext(
      readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8") +
        "\n[ASSET_CACHE, PAGE_CACHE]",
      {
        self: {
          addEventListener: (name: string, listener: (event: unknown) => void) =>
            listeners.set(name, listener),
          clients: { claim },
          skipWaiting,
          location: { origin: "https://wine.example" },
        },
        caches: {
          keys: async () => [
            "winesnap-assets-v1",
            "winesnap-pages-v1",
            "unrelated-cache",
            "winesnap-assets-2026-10-03",
            "winesnap-pages-2026-10-03",
            "winesnap-assets-2026-10-10-scan-errors",
            "winesnap-pages-2026-10-10-scan-errors",
            "winesnap-assets-2026-10-13-privacy-controls",
            "winesnap-pages-2026-10-13-privacy-controls",
            ...currentCaches,
          ],
          delete: remove,
          open: async () => cache,
          match,
        },
        URL,
        fetch: fetcher,
        Response,
      },
    ),
  );
  return { listeners, remove, claim, skipWaiting, cache, match, fetcher };
}

describe("release service worker", () => {
  it("waits for an explicit update action instead of replacing an unsaved screen", async () => {
    const { listeners, cache, skipWaiting } = worker();
    let installed: Promise<unknown> | undefined;
    listeners.get("install")?.({
      waitUntil: (promise: Promise<unknown>) => {
        installed = promise;
      },
    });
    await installed;
    expect(cache.addAll).toHaveBeenCalledWith(["/offline.html", "/icon-512.png"]);
    expect(skipWaiting).not.toHaveBeenCalled();
    listeners.get("message")?.({ data: "SKIP_WAITING" });
    expect(skipWaiting).toHaveBeenCalledOnce();
  });
  it("does not cache account HTML and returns the offline shell only on network failure", async () => {
    const { listeners, fetcher, cache, match } = worker();
    let response: Promise<Response> | undefined;
    const event = {
      request: { method: "GET", url: "https://wine.example/me", mode: "navigate" },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    };
    listeners.get("fetch")?.(event);
    expect(await (await response!).text()).toBe("account HTML");
    expect(cache.put).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
    fetcher.mockRejectedValue(new Error("offline"));
    listeners.get("fetch")?.(event);
    expect(await (await response!).text()).toBe("offline");
    expect(match).toHaveBeenCalledWith("/offline.html");
  });
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
      "winesnap-assets-2026-10-03",
      "winesnap-pages-2026-10-03",
      "winesnap-assets-2026-10-10-scan-errors",
      "winesnap-pages-2026-10-10-scan-errors",
      "winesnap-assets-2026-10-13-privacy-controls",
      "winesnap-pages-2026-10-13-privacy-controls",
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

  it.each(["POST", "PUT", "DELETE", "HEAD"])(
    "does not intercept %s image/API requests",
    (method) => {
      const { listeners } = worker();
      const respondWith = vi.fn();
      listeners.get("fetch")?.({
        request: { method, url: "https://wine.example/api/wine-image", mode: "cors" },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    },
  );
});
