import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const remove = vi.fn().mockResolvedValue(true);
  const claim = vi.fn();
  const skipWaiting = vi.fn();
  const assetMatch = vi.fn().mockResolvedValue(undefined);
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    match: assetMatch,
    delete: vi.fn().mockResolvedValue(true),
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
            "winesnap-assets-2026-10-21-revocable-images",
            "winesnap-pages-2026-10-21-revocable-images",
            "winesnap-assets-2026-10-22-release-candidate",
            "winesnap-pages-2026-10-22-release-candidate",
            "winesnap-assets-2026-10-25-recipe-nutrition",
            "winesnap-pages-2026-10-25-recipe-nutrition",
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
  return { listeners, remove, claim, skipWaiting, cache, match, fetcher, assetMatch };
}

describe("release service worker", () => {
  it("prepares only the marked generic cooking shell, without cookies or account HTML", async () => {
    const { listeners, cache, fetcher } = worker();
    const response = new Response('<meta name="winesnap-kitchen-shell" content="public-v1">');
    Object.defineProperty(response, "url", { value: "https://wine.example/kitchen" });
    fetcher.mockResolvedValueOnce(response);
    let completed: Promise<unknown> | undefined;
    listeners.get("message")?.({
      data: "PREPARE_KITCHEN",
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise;
      },
    });
    await completed;
    expect(fetcher).toHaveBeenCalledWith("/kitchen", {
      credentials: "omit",
      cache: "no-store",
    });
    expect(cache.put).toHaveBeenCalledWith("/kitchen", response);
    cache.put.mockClear();
    const privatePage = new Response("private account HTML");
    Object.defineProperty(privatePage, "url", { value: "https://wine.example/kitchen" });
    fetcher.mockResolvedValueOnce(privatePage);
    listeners.get("message")?.({
      data: "PREPARE_KITCHEN",
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise;
      },
    });
    await completed;
    expect(cache.put).not.toHaveBeenCalled();
  });
  it("serves the generic cooking shell on offline kitchen navigation only", async () => {
    const { listeners, fetcher, match } = worker();
    fetcher.mockRejectedValueOnce(new Error("offline"));
    match.mockImplementation(async (url: string) => new Response(url));
    let response: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      request: { method: "GET", url: "https://wine.example/kitchen", mode: "navigate" },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    expect(await (await response!).text()).toBe("/kitchen");
    expect(match).toHaveBeenCalledWith("/kitchen");
  });
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
      "winesnap-assets-2026-10-21-revocable-images",
      "winesnap-pages-2026-10-21-revocable-images",
      "winesnap-assets-2026-10-22-release-candidate",
      "winesnap-pages-2026-10-22-release-candidate",
      "winesnap-assets-2026-10-25-recipe-nutrition",
      "winesnap-pages-2026-10-25-recipe-nutrition",
    ]);
    expect(claim).toHaveBeenCalledOnce();
  });

  it.each([
    "https://wine.example/api/private",
    "https://wine.example/_serverFn/test",
    "https://storage.example/private.jpg",
    "https://wine.example/private/photo.jpg",
    "https://wine.example/avatar.png",
    "https://wine.example/assets/photo.webp?token=synthetic",
  ])("does not intercept API or external storage requests: %s", (url) => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")?.({ request: { method: "GET", url, mode: "cors" }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  function assetResponse(headers: HeadersInit = {}) {
    const response = new Response("public asset", { headers });
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  }
  async function fetchAsset(test: ReturnType<typeof worker>, authorization = false) {
    let response: Promise<Response> | undefined;
    let completed: Promise<unknown> | undefined;
    test.listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://wine.example/assets/app-hash.js",
        mode: "cors",
        headers: new Headers(authorization ? { Authorization: "Bearer synthetic" } : {}),
      },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
      waitUntil: (promise: Promise<unknown>) => {
        completed = promise;
      },
    });
    await response;
    await completed;
  }
  it("caches only public build assets and fetches them without cookies", async () => {
    const test = worker();
    test.fetcher.mockResolvedValueOnce(
      assetResponse({ "Cache-Control": "public, max-age=31536000, immutable" }),
    );
    await fetchAsset(test);
    expect(test.fetcher).toHaveBeenCalledWith(expect.anything(), { credentials: "omit" });
    expect(test.cache.put).toHaveBeenCalledOnce();
    expect(test.match).not.toHaveBeenCalled();
  });
  it("keeps public offline assets available without consulting other caches", async () => {
    const test = worker();
    test.assetMatch.mockResolvedValueOnce(assetResponse());
    test.fetcher.mockRejectedValueOnce(new Error("offline"));
    await fetchAsset(test);
    expect(test.assetMatch).toHaveBeenCalledOnce();
    expect(test.match).not.toHaveBeenCalled();
    expect(test.cache.put).not.toHaveBeenCalled();
  });
  it.each([
    ["Cache-Control", "private, max-age=60"],
    ["Cache-Control", "no-store"],
    ["Cache-Control", "no-cache"],
    ["Vary", "Accept-Encoding, Cookie"],
    ["Vary", "Authorization, Accept-Encoding"],
    ["Vary", "*"],
  ])("honors private response caching boundaries: %s %s", async (name, value) => {
    const headers = { [name]: value };
    const test = worker();
    test.fetcher.mockResolvedValueOnce(assetResponse(headers));
    test.assetMatch.mockResolvedValueOnce(assetResponse(headers));
    await fetchAsset(test);
    expect(test.cache.put).not.toHaveBeenCalled();
    expect(test.cache.delete).toHaveBeenCalledOnce();
  });
  it("does not intercept requests carrying an authorization header", async () => {
    const test = worker();
    await fetchAsset(test, true);
    expect(test.fetcher).not.toHaveBeenCalled();
    expect(test.cache.put).not.toHaveBeenCalled();
  });
  it("does not cache redirected assets", async () => {
    const test = worker();
    const response = assetResponse();
    Object.defineProperty(response, "redirected", { value: true });
    test.fetcher.mockResolvedValueOnce(response);
    await fetchAsset(test);
    expect(test.cache.put).not.toHaveBeenCalled();
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
