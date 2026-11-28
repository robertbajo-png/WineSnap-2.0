import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { mealPhotoDigestSchema, mealPhotoStateSchema } from "../features/meal-photos/domain";
import { approvedLocalBackend, ownedBackendOrigin } from "./backendScope";
import {
  getOperationsAdmin,
  loadCredentials,
  localBackendFetch,
  localOperationsEnabled,
} from "./localCredentials.server";
import {
  encodeMealPhotoFrame,
  hasMealPhotoFrameType,
  mealPhotoFrame,
} from "./mealPhotoFrame.server";

const uuid = z.uuid();
const maxStoredPhotoBytes = 4 * 1024 * 1024;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

const stateSchema = z.object({
  photo_state: mealPhotoStateSchema,
  photo_sha256: mealPhotoDigestSchema.nullable(),
});
const transitionResult = z.union([
  mealPhotoStateSchema,
  z.literal("conflict"),
  z.literal("unavailable"),
]);
type PhotoTransition =
  [action: "pin" | "publish", digest: string] | [action: "begin_remove" | "finish_remove"];
type Session = {
  owner: string;
  read: (meal: string) => Promise<z.infer<typeof stateSchema> | null>;
  transition: (
    meal: string,
    ...action: PhotoTransition
  ) => Promise<z.infer<typeof transitionResult>>;
  put: (path: string, png: Blob) => Promise<boolean>;
  get: (path: string) => Promise<Blob | null>;
  remove: (path: string) => Promise<void>;
};
type Dependencies = {
  enabled: () => boolean;
  authorize: (token: string) => Promise<Session | null>;
};

function fail(status: number) {
  const error =
    status === 401
      ? "meal_photo_auth"
      : status === 404
        ? "meal_photo_not_found"
        : status === 409
          ? "meal_photo_conflict"
          : status === 400 || status === 415
            ? "meal_photo_frame"
            : status === 405
              ? "meal_photo_method"
              : "meal_photo_storage_unavailable";
  return Response.json({ error }, { status, headers: privateHeaders });
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function matchingPhoto(session: Session, path: string, digest: string) {
  const photo = await session.get(path);
  if (!photo) return null;
  if (
    photo.type !== "image/png" ||
    !photo.size ||
    photo.size > maxStoredPhotoBytes ||
    sha256(new Uint8Array(await photo.arrayBuffer())) !== digest
  )
    throw new Error("Stored meal photo could not be verified");
  return photo;
}

function receipt(photoState: "pending" | "ready") {
  return Response.json({ photoState }, { headers: privateHeaders });
}

function statusOf(result: z.infer<typeof transitionResult>) {
  return result === "unavailable" ? 404 : 409;
}

export function createMealPhotoStorageHandler(deps: Dependencies) {
  return async (request: Request) => {
    if (!deps.enabled()) return fail(404);
    if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return fail(405);
    const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return fail(401);
    const ids = [...new URL(request.url).searchParams];
    if (ids.length !== 1 || ids[0][0] !== "id") return fail(400);
    const meal = uuid.safeParse(ids[0][1]);
    if (!meal.success) return fail(400);
    const id = meal.data.toLowerCase();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);

    try {
      signal.throwIfAborted();
      const session = await deps.authorize(token);
      if (!session || !uuid.safeParse(session.owner).success) return fail(401);
      const path = `${session.owner.toLowerCase()}/${id}.png`;
      const record = await session.read(id);
      signal.throwIfAborted();
      if (!record) return fail(404);

      if (request.method === "GET") {
        if (record.photo_state !== "ready" || !record.photo_sha256) return fail(404);
        const photo = await matchingPhoto(session, path, record.photo_sha256);
        if (!photo) return fail(503);
        // A download held during an erasure or removal never becomes readable.
        const latest = await session.read(id);
        signal.throwIfAborted();
        if (latest?.photo_state !== "ready" || latest.photo_sha256 !== record.photo_sha256)
          return fail(404);
        return new Response(photo, {
          headers: {
            ...privateHeaders,
            "Content-Type": "image/png",
            "Content-Length": String(photo.size),
          },
        });
      }

      if (request.method === "DELETE") {
        const begun = await session.transition(id, "begin_remove");
        if (begun === "none" || begun === "removed")
          return new Response(null, { status: 204, headers: privateHeaders });
        if (begun !== "removing") return fail(statusOf(begun));
        // Once started, finish this idempotent removal even if its response is lost.
        await session.remove(path);
        const finished = await session.transition(id, "finish_remove");
        return finished === "removed"
          ? new Response(null, { status: 204, headers: privateHeaders })
          : fail(statusOf(finished));
      }

      if (record.photo_state !== "pending" && record.photo_state !== "ready") return fail(409);
      if (request.method === "PATCH") {
        // Resume an explicitly opted-in upload without accepting any new pixels.
        if (request.body) return fail(400);
        const digest = record.photo_sha256;
        if (!digest) return record.photo_state === "pending" ? receipt("pending") : fail(503);
        const stored = await matchingPhoto(session, path, digest);
        signal.throwIfAborted();
        if (stored && record.photo_state === "pending") {
          const published = await session.transition(id, "publish", digest);
          if (published !== "ready") return fail(statusOf(published));
        }
        const latest = await session.read(id);
        signal.throwIfAborted();
        if (latest?.photo_sha256 !== digest) return fail(404);
        if (latest.photo_state === "ready") return stored ? receipt("ready") : fail(503);
        if (latest.photo_state === "pending" && !stored) return receipt("pending");
        return fail(409);
      }
      if (!hasMealPhotoFrameType(request)) return fail(415);
      const frame = mealPhotoFrame(request);
      if (!frame) return fail(400);
      const bytes = await encodeMealPhotoFrame(request, frame, signal);
      signal.throwIfAborted();
      if (!bytes || bytes.length > maxStoredPhotoBytes) return fail(400);
      const digest = sha256(bytes);
      const pinned = await session.transition(id, "pin", digest);
      signal.throwIfAborted();
      if (pinned === "ready") {
        const stored = await matchingPhoto(session, path, digest);
        const latest = await session.read(id);
        signal.throwIfAborted();
        if (latest?.photo_state !== "ready" || latest.photo_sha256 !== digest) return fail(404);
        return stored ? receipt("ready") : fail(503);
      }
      if (pinned !== "pending") return fail(statusOf(pinned));
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      // An uncertain first upload can be reconciled, but only with identical bytes.
      if (!(await session.put(path, blob)) && !(await matchingPhoto(session, path, digest)))
        return fail(503);
      signal.throwIfAborted();
      const published = await session.transition(id, "publish", digest);
      return published === "ready" ? receipt("ready") : fail(statusOf(published));
    } catch {
      return fail(signal.aborted ? 504 : 503);
    }
  };
}

export async function authorizeMealPhotoStorage(
  token: string,
  client: SupabaseClient,
  operationsAdmin: () => Promise<SupabaseClient>,
): Promise<Session | null> {
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return null;
  const owner = auth.user.id;
  const admin = await operationsAdmin();
  const storage = admin.storage.from("meal-photos");
  return {
    owner,
    async read(id) {
      const active = await admin.rpc("privacy_account_active", { _user_id: owner });
      if (active.error) throw new Error("Photo account check failed");
      if (active.data !== true) return null;
      const result = await admin
        .from("kitchen_photo_meals")
        .select("photo_state,photo_sha256")
        .eq("user_id", owner)
        .eq("id", id)
        .maybeSingle();
      if (result.error) throw new Error("Photo state unavailable");
      return result.data === null ? null : stateSchema.parse(result.data);
    },
    async transition(id, ...[action, digest]) {
      const result = await admin.rpc("kitchen_photo_object_transition", {
        _owner: owner,
        _meal: id,
        _action: action,
        _digest: digest ?? null,
      });
      if (result.error) throw new Error("Photo transition unavailable");
      return transitionResult.parse(result.data);
    },
    async put(path, blob) {
      const result = await storage.upload(path, blob, {
        contentType: "image/png",
        upsert: false,
        cacheControl: "0",
      });
      return !result.error && result.data.path === path;
    },
    async get(path) {
      const result = await storage.download(path);
      if (!result.error) return result.data;
      if (["NoSuchKey", "not_found", "404"].includes(String(result.error.statusCode))) return null;
      throw new Error("Meal photo storage unavailable");
    },
    async remove(path) {
      const result = await storage.remove([path]);
      if (result.error) throw new Error("Photo removal unavailable");
    },
  };
}

export const handleMealPhotoStorage = createMealPhotoStorageHandler({
  enabled: () =>
    approvedLocalBackend(process.env) === ownedBackendOrigin &&
    localOperationsEnabled() &&
    process.env.WINESNAP_MEAL_PHOTO_STORAGE_ENABLED === "true",
  authorize: async (token) => {
    const credentials = await loadCredentials();
    const client = createClient(ownedBackendOrigin, credentials.publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: localBackendFetch },
    });
    return authorizeMealPhotoStorage(token, client, getOperationsAdmin);
  },
});
