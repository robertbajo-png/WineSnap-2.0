import { supabase } from "@/integrations/supabase/client";
import { accountWriteClient, type AccountWriteScope } from "./accountWriteScope";
import { saveScanOnce, type ScanSaveAttempt } from "./scanSave";
import { readAllPages } from "./readAllPages";
import { wineImageStoragePath } from "./wineImages";

export type WinePhoto = {
  id: string;
  user_id: string;
  wine_id: string;
  url: string;
  storage_path: string | null;
  kind: string;
  sort_order: number;
};
export type PhotoSaveAttempt = {
  save: ScanSaveAttempt;
  readonly wineId: string;
  readonly path: string;
  readonly blob: Blob;
  readonly order: number;
  readonly contentType: string;
};
export class WinePhotoError extends Error {
  constructor(public kind: "unavailable" | "unconfirmed" | "cleanup" | "changed") {
    super(kind);
  }
}
const fields = "id,user_id,wine_id,url,storage_path,kind,sort_order";
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function loadWinePhotos(wineId: string): Promise<WinePhoto[]> {
  const { data, error } = await supabase
    .from("wine_photos")
    .select(fields)
    .eq("wine_id", wineId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new WinePhotoError("unavailable");
  if (data?.some((row) => row.wine_id !== wineId)) throw new WinePhotoError("unavailable");
  return data ?? [];
}

export function createPhotoSaveAttempt(
  owner: string,
  wineId: string,
  blob: Blob,
  order: number,
): PhotoSaveAttempt {
  if (
    !uuid.test(owner) ||
    !uuid.test(wineId) ||
    !Number.isInteger(order) ||
    order < 0 ||
    order > 2147483647 ||
    !Object.hasOwn(imageExtensions, blob.type) ||
    !blob.size ||
    blob.size > 10 * 1024 * 1024
  )
    throw new WinePhotoError("unavailable");
  const id = crypto.randomUUID();
  return {
    save: { id, owner, imagePath: null, insertStarted: false },
    wineId,
    path: `${owner}/${wineId}/${id}.${imageExtensions[blob.type]}`,
    blob,
    order,
    contentType: blob.type,
  };
}

type Client = Awaited<ReturnType<typeof accountWriteClient>>;
async function active(client: Client, scope: AccountWriteScope, wineId: string) {
  if (!scope.current()) throw new WinePhotoError("changed");
  const privacy = await client.rpc("privacy_account_active", { _user_id: scope.owner });
  const wine = await client
    .from("wines")
    .select("id")
    .eq("id", wineId)
    .eq("user_id", scope.owner)
    .maybeSingle();
  if (privacy.error || privacy.data !== true || wine.error || !wine.data || !scope.current())
    throw new WinePhotoError("unavailable");
}
async function find(client: Client, scope: AccountWriteScope, wineId: string, id: string) {
  if (!scope.current()) throw new WinePhotoError("changed");
  const result = await client
    .from("wine_photos")
    .select(fields)
    .eq("id", id)
    .eq("user_id", scope.owner)
    .eq("wine_id", wineId)
    .maybeSingle();
  if (result.error || !scope.current()) throw new WinePhotoError("unconfirmed");
  return result.data as WinePhoto | null;
}

export async function saveWinePhoto(attempt: PhotoSaveAttempt, scope: AccountWriteScope) {
  if (
    !uuid.test(attempt.save.id) ||
    !uuid.test(attempt.wineId) ||
    attempt.save.owner !== scope.owner ||
    !Object.hasOwn(imageExtensions, attempt.contentType) ||
    attempt.blob.type !== attempt.contentType ||
    attempt.path !==
      `${scope.owner}/${attempt.wineId}/${attempt.save.id}.${imageExtensions[attempt.contentType]}`
  )
    throw new WinePhotoError("changed");
  const client = await accountWriteClient(scope);
  await active(client, scope, attempt.wineId);
  const checked = (row: WinePhoto) => {
    if (
      row.wine_id !== attempt.wineId ||
      row.storage_path !== attempt.path ||
      row.url !== attempt.path
    )
      throw new WinePhotoError("changed");
    return { ...row, image_url: row.storage_path };
  };
  // Reuse scan reconciliation, a stable metadata ID and a private same-bytes upload path.
  const saved = await saveScanOnce(attempt.save, {
    find: async () => {
      const row = await find(client, scope, attempt.wineId, attempt.save.id);
      return row ? checked(row) : null;
    },
    upload: async () => {
      await active(client, scope, attempt.wineId);
      const result = await client.storage.from("wine-labels").upload(attempt.path, attempt.blob, {
        contentType: attempt.contentType,
        cacheControl: "0",
        upsert: true,
      });
      if (result.error || !scope.current()) throw new WinePhotoError("unconfirmed");
      return attempt.path;
    },
    insert: async (id, path) => {
      await active(client, scope, attempt.wineId);
      const result = await client
        .from("wine_photos")
        .insert({
          id,
          wine_id: attempt.wineId,
          user_id: scope.owner,
          url: path!,
          storage_path: path,
          kind: "bottle",
          sort_order: attempt.order,
        })
        .select(fields)
        .single();
      if (result.error) throw result.error;
      if (!result.data || !scope.current()) throw new WinePhotoError("unconfirmed");
      return checked(result.data as WinePhoto);
    },
  });
  if (!scope.current()) throw new WinePhotoError("changed");
  return saved;
}

export async function removeWinePhoto(photo: WinePhoto, scope: AccountWriteScope) {
  if (photo.user_id !== scope.owner || !uuid.test(photo.id) || !uuid.test(photo.wine_id))
    throw new WinePhotoError("changed");
  const client = await accountWriteClient(scope);
  await active(client, scope, photo.wine_id);
  const row = await find(client, scope, photo.wine_id, photo.id);
  if (row && (row.storage_path !== photo.storage_path || row.url !== photo.url))
    throw new WinePhotoError("changed");
  if (row) {
    await active(client, scope, photo.wine_id);
    // Never remove image bytes while their metadata deletion is denied or uncertain.
    await client
      .from("wine_photos")
      .delete()
      .eq("id", photo.id)
      .eq("user_id", scope.owner)
      .eq("wine_id", photo.wine_id);
    if (await find(client, scope, photo.wine_id, photo.id)) throw new WinePhotoError("unconfirmed");
  }
  const path = photo.storage_path || wineImageStoragePath(photo.url);
  if (!path) return "external" as const;
  const prefix = `${scope.owner}/${photo.wine_id}/`;
  if (
    !path.startsWith(prefix) ||
    !uuid.test(path.slice(prefix.length).replace(/\.(?:jpg|jpeg|png|webp|gif|avif)$/i, ""))
  )
    return "retained" as const;
  const wines = await readAllPages<{ image_url: string | null }>(
    (from, to) => {
      if (from >= 5000) throw new WinePhotoError("cleanup");
      return client
        .from("wines")
        .select("image_url")
        .eq("user_id", scope.owner)
        .order("id")
        .range(from, to);
    },
    () => !scope.current(),
  );
  const photos = await readAllPages<{ url: string; storage_path: string | null }>(
    (from, to) => {
      if (from >= 5000) throw new WinePhotoError("cleanup");
      return client
        .from("wine_photos")
        .select("url,storage_path")
        .eq("user_id", scope.owner)
        .order("id")
        .range(from, to);
    },
    () => !scope.current(),
  );
  await active(client, scope, photo.wine_id);
  if (
    wines.some((item) => wineImageStoragePath(item.image_url) === path) ||
    photos.some((item) => item.storage_path === path || wineImageStoragePath(item.url) === path)
  )
    return "retained" as const;
  const bucket = client.storage.from("wine-labels");
  const removal = await bucket.remove([path]);
  if (removal.error) throw new WinePhotoError("cleanup");
  await active(client, scope, photo.wine_id);
  // The owned image-read rule explicitly permits object.list, not direct downloads.
  const listed = await bucket.list(prefix.slice(0, -1), {
    search: path.slice(prefix.length),
    limit: 1000,
  });
  if (
    listed.error ||
    !listed.data ||
    listed.data.length >= 1000 ||
    listed.data.some((item) => item.name === path.slice(prefix.length))
  )
    throw new WinePhotoError("cleanup");
  if (!scope.current()) throw new WinePhotoError("changed");
  return "deleted" as const;
}
