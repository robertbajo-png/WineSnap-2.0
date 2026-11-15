import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startingRecipes } from "./catalog";
import { initialCookingState } from "./domain";
import type { KitchenCache } from "./storage";

const owner = "10000000-0000-4000-8000-000000000001";
const peer = "20000000-0000-4000-8000-000000000001";
const version = {
  id: "10000000-0000-4000-8000-000000000002",
  recipe_id: "10000000-0000-4000-8000-000000000003",
  user_id: owner,
  revision: 1,
  document: startingRecipes[0],
  created_at: "2026-11-15T00:00:00Z",
};
const cache = (revision = 0): KitchenCache => ({
  owner,
  cacheRevision: revision,
  verifiedAt: Date.now(),
  versions: [version],
  history: [],
  session: {
    id: "10000000-0000-4000-8000-000000000004",
    version,
    state: initialCookingState(version.document),
    feedback: null,
    baseRevision: 1,
    requestId: "10000000-0000-4000-8000-000000000005",
    dirty: false,
  },
});

// Request-lifetime mock only. Real transaction ordering is covered by the two-tab browser probe.
function idb(initial: unknown) {
  let row = structuredClone(initial);
  let release: (() => void) | undefined;
  const writes: unknown[] = [];
  const transaction = vi.fn(() => {
    let aborted = false;
    const tx = {
      oncomplete: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined,
      abort() {
        aborted = true;
        queueMicrotask(() => tx.onabort?.());
      },
      objectStore: () => ({
        get: () => {
          const request = {
            result: structuredClone(row),
            onsuccess: undefined as (() => void) | undefined,
          };
          queueMicrotask(() => {
            request.onsuccess?.();
            if (!aborted) queueMicrotask(() => tx.oncomplete?.());
          });
          return request;
        },
        put(value: unknown) {
          row = structuredClone(value);
          writes.push(row);
        },
        openCursor: () => {
          const request = { result: null, onsuccess: undefined as (() => void) | undefined };
          queueMicrotask(() => {
            request.onsuccess?.();
            queueMicrotask(() => tx.oncomplete?.());
          });
          return request;
        },
      }),
    };
    return tx;
  });
  const db = { transaction, close: vi.fn(), onversionchange: undefined };
  const opening = { result: db, onsuccess: undefined as (() => void) | undefined };
  const factory = {
    open: vi.fn(() => {
      release = () => opening.onsuccess?.();
      return opening;
    }),
  };
  vi.stubGlobal("indexedDB", factory);
  return { factory, transaction, writes, row: () => row, release: () => release?.() };
}
let storage: typeof import("./storage");
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  storage = await import("./storage");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("kitchen startup refresh versus mutation revisions", () => {
  it("writes a new verified snapshot only when the expected revision still matches", async () => {
    const db = idb(undefined),
      incoming = cache();
    const pending = storage.refreshKitchenCache(incoming, 0);
    db.release();
    await expect(pending).resolves.toEqual({
      cache: { ...incoming, cacheRevision: 1 },
      reused: false,
    });
    expect(db.writes).toHaveLength(1);
  });
  it("adopts a newer complete snapshot without writing or changing pending attempt metadata", async () => {
    const latest = cache(2);
    latest.session!.dirty = true;
    latest.session!.state.activeStep = 1;
    latest.session!.requestId = "10000000-0000-4000-8000-000000000099";
    const db = idb(latest);
    const pending = storage.refreshKitchenCache(cache(1), 1);
    db.release();
    await expect(pending).resolves.toEqual({ cache: latest, reused: true });
    expect(db.writes).toHaveLength(0);
    expect(db.row()).toEqual(latest);
  });
  it("keeps normal user mutations strictly compare-and-swap even with a valid newer cache", async () => {
    const latest = cache(2),
      db = idb(latest);
    const pending = storage.writeKitchenCache(cache(1), 1);
    const rejected = expect(pending).rejects.toThrow("kitchen_local_conflict");
    db.release();
    await rejected;
    expect(db.writes).toHaveLength(0);
    expect(db.row()).toEqual(latest);
  });
  it("retains the original write return shape after a matching user mutation", async () => {
    const incoming = cache(1),
      db = idb(incoming);
    const pending = storage.writeKitchenCache(incoming, 1);
    db.release();
    await expect(pending).resolves.toEqual({ ...incoming, cacheRevision: 2 });
  });
  it.each([
    "owner",
    "versionOwner",
    "historyOwner",
    "expired",
    "future",
    "malformed",
    "older",
    "missing",
  ])("never reuses %s data to recover startup", async (kind) => {
    const latest = cache(2);
    let value: unknown = latest;
    if (kind === "owner") latest.owner = peer;
    if (kind === "versionOwner") latest.versions = [{ ...version, user_id: peer }];
    if (kind === "historyOwner")
      latest.history = [{ ...latest.session!, version: { ...version, user_id: peer } }];
    if (kind === "expired") latest.verifiedAt -= 86400001;
    if (kind === "future") latest.verifiedAt += 60001;
    if (kind === "malformed") value = { owner, cacheRevision: 2, unexpected: "private-canary" };
    if (kind === "older") latest.cacheRevision = 0;
    if (kind === "missing") value = undefined;
    const db = idb(value),
      pending = storage.refreshKitchenCache(cache(1), 1);
    const rejected = expect(pending).rejects.toThrow("kitchen_local_conflict");
    db.release();
    await rejected;
    expect(db.writes).toHaveLength(0);
  });
  it("does not revive a cache after same-document account invalidation while opening IDB", async () => {
    const db = idb(cache(2));
    const pending = storage.refreshKitchenCache(cache(1), 1);
    const rejected = expect(pending).rejects.toThrow("kitchen_local_conflict");
    const cleared = storage.clearKitchenCache(peer);
    db.release();
    await Promise.all([rejected, cleared]);
    expect(db.writes).toHaveLength(0);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])(
    "rejects invalid expected revision %s before IDB",
    async (revision) => {
      const db = idb(undefined);
      await expect(storage.refreshKitchenCache(cache(), revision)).rejects.toThrow(
        "Invalid offline revision",
      );
      expect(db.factory.open).not.toHaveBeenCalled();
    },
  );
});
