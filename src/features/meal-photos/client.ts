import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accountAccessToken,
  accountWriteClient,
  type AccountWriteScope,
} from "@/lib/accountWriteScope";
import {
  mealPhotoEstimateSchema,
  mealPhotoFrameSideLimit,
  savedPhotoMealSchema,
  type ConfirmedPhotoMeal,
} from "./domain";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
export const mealPhotoAccept = imageTypes.join(",");
const maxFileBytes = 16 * 1024 * 1024;
const maxSourcePixels = 48_000_000;

export type PreparedMealPhoto = {
  width: number;
  height: number;
  pixels: Uint8Array<ArrayBuffer>;
  preview: Blob;
};

export class MealPhotoError extends Error {
  constructor(readonly code: "format" | "read" | "auth" | "quota" | "disabled" | "invalid") {
    super(code);
  }
}

export function mealPhotoFrameSize(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > maxSourcePixels
  )
    throw new MealPhotoError("format");
  const scale = Math.min(1, mealPhotoFrameSideLimit / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))] as const;
}

export async function prepareMealPhoto(
  file: File,
  signal: AbortSignal,
): Promise<PreparedMealPhoto> {
  signal.throwIfAborted();
  if (!imageTypes.includes(file.type) || file.size === 0 || file.size > maxFileBytes)
    throw new MealPhotoError("format");
  let bitmap: ImageBitmap | undefined;
  const canvas = document.createElement("canvas");
  try {
    bitmap = await createImageBitmap(file);
    signal.throwIfAborted();
    const [width, height] = mealPhotoFrameSize(bitmap.width, bitmap.height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new MealPhotoError("read");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const pixels = new Uint8Array(width * height * 3);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
      pixels[target] = rgba[source];
      pixels[target + 1] = rgba[source + 1];
      pixels[target + 2] = rgba[source + 2];
    }
    const preview = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    signal.throwIfAborted();
    if (!preview || preview.type !== "image/jpeg") throw new MealPhotoError("read");
    return { width, height, pixels, preview };
  } finally {
    bitmap?.close();
    canvas.width = canvas.height = 0;
  }
}

export async function analyzeMealPhoto(
  photo: PreparedMealPhoto,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(55_000)]);
  const assertCurrent = () => {
    deadline.throwIfAborted();
    if (!scope.current()) throw new MealPhotoError("auth");
  };
  assertCurrent();
  const token = await accountAccessToken(scope, 10_000, deadline);
  assertCurrent();
  const response = await fetch("/api/ai/analyze-meal-photo", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Meal-Photo-Width": String(photo.width),
      "X-Meal-Photo-Height": String(photo.height),
    },
    body: photo.pixels,
    signal: deadline,
    cache: "no-store",
    redirect: "error",
  });
  assertCurrent();
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) throw new MealPhotoError("auth");
    if (response.status === 429) throw new MealPhotoError("quota");
    if (response.status === 404 || response.status === 503) throw new MealPhotoError("disabled");
    throw new MealPhotoError("invalid");
  }
  const result = mealPhotoEstimateSchema.safeParse(await response.json());
  assertCurrent();
  if (!result.success) throw new MealPhotoError("invalid");
  return result.data;
}

export const photoMealPageSize = 20;
const photoMealColumns = "id,user_id,created_at,items,keep_photo,photo_state,photo_sha256";

function assertCurrent(scope: AccountWriteScope, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!scope.current()) throw new MealPhotoError("auth");
}

export async function savePhotoMeal(
  id: string,
  meal: ConfirmedPhotoMeal,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  const client: SupabaseClient = await accountWriteClient(scope, 12_000, signal);
  assertCurrent(scope, signal);
  const { data, error } = await client
    .rpc("kitchen_save_photo_meal", { _id: id, _items: meal.items, _keep_photo: meal.keepPhoto })
    .select(photoMealColumns)
    .abortSignal(signal)
    .single();
  assertCurrent(scope, signal);
  const record = savedPhotoMealSchema.safeParse(data);
  if (
    error ||
    !record.success ||
    record.data.user_id !== scope.owner ||
    record.data.id !== id ||
    record.data.keep_photo !== meal.keepPhoto
  )
    throw new MealPhotoError("invalid");
  return record.data;
}

export async function listPhotoMeals(
  scope: AccountWriteScope,
  signal: AbortSignal,
  offset: number,
) {
  const client: SupabaseClient = await accountWriteClient(scope, 12_000, signal);
  assertCurrent(scope, signal);
  const { data, error } = await client
    .from("kitchen_photo_meals")
    .select(photoMealColumns)
    .eq("user_id", scope.owner)
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + photoMealPageSize - 1)
    .abortSignal(signal);
  assertCurrent(scope, signal);
  const records = savedPhotoMealSchema.array().max(photoMealPageSize).safeParse(data);
  if (error || !records.success || records.data.some((record) => record.user_id !== scope.owner))
    throw new MealPhotoError("invalid");
  return records.data;
}

async function photoFile(
  id: string,
  method: "GET" | "POST" | "DELETE",
  scope: AccountWriteScope,
  signal: AbortSignal,
  photo?: PreparedMealPhoto,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(55_000)]);
  assertCurrent(scope, deadline);
  const token = await accountAccessToken(scope, 10_000, deadline);
  assertCurrent(scope, deadline);
  const response = await fetch(`/api/meal-photo?${new URLSearchParams({ id })}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(photo && {
        "Content-Type": "application/octet-stream",
        "X-Meal-Photo-Width": String(photo.width),
        "X-Meal-Photo-Height": String(photo.height),
      }),
    },
    body: photo?.pixels,
    signal: deadline,
    cache: "no-store",
    redirect: "error",
  });
  assertCurrent(scope, deadline);
  if (!response.ok) {
    await response.body?.cancel();
    throw new MealPhotoError(
      response.status === 401 || response.status === 403 ? "auth" : "invalid",
    );
  }
  return { response, deadline };
}

export async function attachMealPhoto(
  id: string,
  photo: PreparedMealPhoto,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  const { response, deadline } = await photoFile(id, "POST", scope, signal, photo);
  const result = await response.json();
  assertCurrent(scope, deadline);
  if (result?.photoState !== "ready") throw new MealPhotoError("invalid");
}

export async function readMealPhoto(id: string, scope: AccountWriteScope, signal: AbortSignal) {
  const { response, deadline } = await photoFile(id, "GET", scope, signal);
  if (response.headers.get("content-type") !== "image/png") {
    await response.body?.cancel();
    throw new MealPhotoError("invalid");
  }
  const photo = await response.blob();
  assertCurrent(scope, deadline);
  if (!photo.size || photo.size > 4 * 1024 * 1024) throw new MealPhotoError("invalid");
  return photo;
}

export async function removeMealPhoto(id: string, scope: AccountWriteScope, signal: AbortSignal) {
  const { response } = await photoFile(id, "DELETE", scope, signal);
  if (response.status !== 204) {
    await response.body?.cancel();
    throw new MealPhotoError("invalid");
  }
}
