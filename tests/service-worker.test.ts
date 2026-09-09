import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
type WorkerEvent = {
  request?: { method: string; url: string; mode?: string; cache?: string };
  waitUntil?: (value: Promise<void>) => void;
  respondWith?: (value: Promise<Response>) => void;
};
function worker(offline = false) {
  const handlers: Record<string, (event: WorkerEvent) => void> = {};
  const deleted: string[] = [];
  const writes: unknown[] = [];
  const offlineResponse = new Response("offline");
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://winesnap.test" },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => {
        handlers[name] = handler;
      },
      clients: { claim: async () => {} },
      skipWaiting: () => {},
    },
    caches: {
      keys: async () => [
        "winesnap-pages-v1",
        "winesnap-assets-v1",
        "other-app",
        "winesnap-pages-v2",
      ],
      delete: async (key: string) => {
        deleted.push(key);
      },
      match: async () => offlineResponse,
      open: async () => ({
        put: (...args: unknown[]) => writes.push(args),
        addAll: async () => {},
      }),
    },
    fetch: async () => {
      if (offline) throw new Error("offline");
      return new Response("private page");
    },
  });
  return { handlers, deleted, writes, offlineResponse };
}

test("activation deletes old WineSnap caches only", async () => {
  const state = worker();
  let done: Promise<void> | undefined;
  state.handlers.activate({
    waitUntil: (value: Promise<void>) => {
      done = value;
    },
  });
  await done;
  expect(state.deleted).toEqual(["winesnap-pages-v1", "winesnap-assets-v1"]);
});

test("navigation never persists private HTML", async () => {
  const state = worker();
  let response: Promise<Response> | undefined;
  state.handlers.fetch({
    request: { method: "GET", url: "https://winesnap.test/cellar", mode: "navigate" },
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
  });
  expect(await (await response)?.text()).toBe("private page");
  expect(state.writes).toHaveLength(0);
});

test("offline navigation returns only the neutral offline page", async () => {
  const state = worker(true);
  let response: Promise<Response> | undefined;
  state.handlers.fetch({
    request: { method: "GET", url: "https://winesnap.test/cellar", mode: "navigate" },
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
  });
  expect(await response).toBe(state.offlineResponse);
});

test("private images, APIs and no-store requests bypass caching", () => {
  const state = worker();
  let intercepted = false;
  for (const request of [
    { url: "https://project.supabase.co/storage/v1/object/label.png" },
    { url: "https://winesnap.test/api/profile" },
    { url: "https://winesnap.test/private.png" },
    { url: "https://winesnap.test/assets/app.js", cache: "no-store" },
  ])
    state.handlers.fetch({
      request: { method: "GET", ...request },
      respondWith: () => {
        intercepted = true;
      },
    });
  expect(intercepted).toBe(false);
});
