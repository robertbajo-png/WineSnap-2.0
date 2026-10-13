export const privacyCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function privacyJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...privacyCors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function recentSignIn(lastSignIn: string | undefined, now = Date.now()) {
  const time = lastSignIn ? Date.parse(lastSignIn) : NaN;
  return Number.isFinite(time) && time <= now && now - time <= 15 * 60_000;
}

export type StorageObject = { bucket_id: string; name: string };
export type ErasureDependencies = {
  list: (userId: string) => Promise<StorageObject[]>;
  remove: (bucket: string, names: string[]) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
};

// Freeze the account first. Always finish Storage before Auth; repeated batches
// are idempotent and a failed batch never acknowledges completed erasure.
export async function eraseAccountFiles(userId: string, deps: ErasureDependencies, batches = 3) {
  for (let attempt = 0; attempt < batches; attempt++) {
    const objects = await deps.list(userId);
    if (!objects.length) {
      await deps.deleteAuth(userId);
      return { complete: true };
    }
    const buckets = new Map<string, string[]>();
    for (const object of objects) {
      const names = buckets.get(object.bucket_id) ?? [];
      names.push(object.name);
      buckets.set(object.bucket_id, names);
    }
    for (const [bucket, names] of buckets) await deps.remove(bucket, names);
  }
  return { complete: false };
}
