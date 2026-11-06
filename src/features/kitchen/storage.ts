import { z } from "zod";
import {
  feedbackSchema,
  sessionSchema,
  validState,
  versionSchema,
  type LocalSession,
  type RecipeVersion,
} from "./domain";

const name = "winesnap-kitchen-v1";
const store = "accounts";
const maxOfflineMs = 24 * 60 * 60 * 1000;
const localSessionSchema = z
  .object({
    id: z.string().uuid(),
    version: versionSchema,
    state: sessionSchema,
    feedback: feedbackSchema.nullable(),
    baseRevision: z.number().int().min(0),
    requestId: z.string().uuid(),
    dirty: z.boolean(),
  })
  .strict();
const cacheSchema = z
  .object({
    owner: z.string().uuid(),
    verifiedAt: z.number().int().nonnegative(),
    cacheRevision: z.number().int().nonnegative(),
    versions: z.array(versionSchema).max(300),
    session: localSessionSchema.nullable(),
    history: z.array(localSessionSchema).max(20).default([]),
  })
  .strict();
export type KitchenCache = z.infer<typeof cacheSchema>;
let epoch = 0;
let open: Promise<IDBDatabase> | undefined;
function database() {
  if (!open)
    open = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: "owner" });
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(new Error("Offline storage unavailable"));
    });
  return open;
}
export function validateCache(input: unknown, owner: string, now = Date.now()): KitchenCache {
  const data = cacheSchema.parse(input);
  if (
    data.owner !== owner ||
    data.verifiedAt > now + 60000 ||
    now - data.verifiedAt > maxOfflineMs ||
    data.versions.some((version) => version.user_id !== owner) ||
    (data.session?.version.user_id && data.session.version.user_id !== owner)
  )
    throw new Error("Offline verification required");
  if (data.session) validState(data.session.state, data.session.version.document);
  for (const session of data.history) {
    if (session.version.user_id !== owner) throw new Error("Offline owner mismatch");
    validState(session.state, session.version.document);
  }
  return data;
}
export async function readKitchenCache(owner: string) {
  const db = await database();
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(owner);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Offline storage unavailable"));
  });
  if (!value) return null;
  return validateCache(value, owner);
}
export async function writeKitchenCache(data: KitchenCache, expectedRevision: number) {
  validateCache(data, data.owner);
  const generation = epoch;
  const db = await database();
  return new Promise<KitchenCache>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);
    const read = objectStore.get(data.owner);
    let conflict = false;
    const next = { ...data, cacheRevision: expectedRevision + 1 };
    read.onsuccess = () => {
      if (generation !== epoch || (read.result?.cacheRevision ?? 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      objectStore.put(next);
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = transaction.onerror = () =>
      reject(new Error(conflict ? "kitchen_local_conflict" : "Offline storage unavailable"));
  });
}
export async function clearKitchenCache(keepOwner?: string) {
  epoch++;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const request = transaction.objectStore(store).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if (cursor.key !== keepOwner) cursor.delete();
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(new Error("Could not clear private cooking data"));
  });
}
export function emptyKitchenCache(
  owner: string,
  versions: RecipeVersion[] = [],
  session: LocalSession | null = null,
): KitchenCache {
  return { owner, verifiedAt: Date.now(), cacheRevision: 0, versions, session, history: [] };
}
