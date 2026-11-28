import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import {
  authorizeMealPhotoStorage,
  createMealPhotoStorageHandler,
} from "../src/lib/mealPhotoStorage.server";
import { completePrivacyExport } from "../src/lib/privacyExport";
import { ownedBackendOrigin, ownedBrowserOrigin } from "../src/lib/backendScope";
import { isolatedMealPhotoApi, isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import { runAccountErasure } from "../supabase/functions/_shared/privacyErasure";
import { createHandler as createExport } from "../supabase/functions/privacy-export/handler";

assert.ok(
  process.argv.length === 2 ||
    (process.argv.length === 3 && ["--restore-only", "--resume-only"].includes(process.argv[2])),
);
const restoreOnly = process.argv[2] === "--restore-only";
const resumeOnly = process.argv[2] === "--resume-only";
const report = {
  checkedAt: new Date().toISOString(),
  synthetic: true,
  restoreOnly,
  resumeOnly,
  backupStage: undefined as string | undefined,
  failureCategory: undefined as string | undefined,
  archiveRejection: undefined as string | undefined,
  actualAuthRestStorage: false,
  externalAiCalled: false,
  realAccountUsed: false,
  installedAppTouched: false,
  productionTouched: false,
  completed: false,
  cleanupCompleted: false,
  phase: "fixture",
  isolatedMigrationsApplied: 0,
  failureCode: undefined as string | undefined,
  failedHttpStatus: undefined as { expected: number; actual: number } | undefined,
  restored: undefined as
    | {
        completed: boolean;
        cleanupCompleted: boolean;
        restoredObjectsDownloaded?: number;
        restoredMealPhotoDigestsVerified?: number;
        restoredPeerMealRowsHidden: boolean;
        phase?: string;
        errorCategory?: string;
      }
    | undefined,
  passed: [] as string[],
};
const backend = isolatedPlanningBackend(report, { meals: true, mealPhotos: true });
const test = async (phase: string, check: () => Promise<void>) => {
  report.phase = phase;
  await check();
  report.passed.push(phase);
  console.log("PASS " + phase);
};
function status(actual: number, expected: number) {
  if (actual !== expected) report.failedHttpStatus = { actual, expected };
  assert.equal(actual, expected);
}

async function run() {
  assert.equal(isolatedMealPhotoApi, ownedBackendOrigin);
  await backend.boot();
  report.phase = "synthetic_password_login";
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: backend.mealPhotoFixtureFetch() as typeof fetch },
  };
  const owner = await backend.createAccount("owner");
  const peer = await backend.createAccount("peer");
  const ownerClient = createClient(isolatedMealPhotoApi, backend.anon, options);
  const peerClient = createClient(isolatedMealPhotoApi, backend.anon, options);
  const anon = createClient(isolatedMealPhotoApi, backend.anon, options);
  const admin = createClient(isolatedMealPhotoApi, backend.serviceRole, options);
  const ownerLogin = await ownerClient.auth.signInWithPassword(owner);
  const peerLogin = await peerClient.auth.signInWithPassword(peer);
  assert.equal(ownerLogin.error, null);
  assert.equal(peerLogin.error, null);
  assert.equal(ownerLogin.data.user?.id, owner.id);
  assert.equal(peerLogin.data.user?.id, peer.id);
  const ownerToken = ownerLogin.data.session!.access_token;
  const peerToken = peerLogin.data.session!.access_token;
  const meal = randomUUID();
  const optOut = randomUUID();
  const bucket = "meal-photos";
  const path = `${owner.id}/${meal}.png`;
  const body = new Uint8Array([200, 187, 128, 91, 72, 39, 20, 64, 12, 75, 39, 28]);
  const items = [
    { name: "Matvete", portion: { source: "manual", grams: 160 } },
    { name: "Gronkalsmix", portion: null },
  ];
  const authorize = (token: string) => authorizeMealPhotoStorage(token, anon, async () => admin);
  const handle = createMealPhotoStorageHandler({ enabled: () => true, authorize });
  const photoRequest = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    id: string,
    token?: string,
    frame = body,
  ) =>
    new Request(`http://127.0.0.1/api/meal-photo?id=${id}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(method === "POST" && {
          "Content-Type": "application/octet-stream",
          "X-Meal-Photo-Width": "2",
          "X-Meal-Photo-Height": "2",
        }),
      },
      body: method === "POST" ? frame : undefined,
    });
  const photo = (...args: Parameters<typeof photoRequest>) => handle(photoRequest(...args));
  const save = (id: string, keep: boolean) =>
    ownerClient
      .rpc("kitchen_save_photo_meal", { _id: id, _items: items, _keep_photo: keep })
      .select("id,user_id,created_at,items,keep_photo,photo_state,photo_sha256")
      .single();
  const read = (id: string) =>
    ownerClient
      .from("kitchen_photo_meals")
      .select("photo_state,photo_sha256,items")
      .eq("id", id)
      .single();
  const storedPhoto = () => admin.storage.from(bucket).download(path);
  let retained: Buffer;
  const restoreName = "archive_restore_verifies_meal_photo_bytes_and_owner_isolation";
  const resumeName = "resume_checks_staged_bytes_missing_image_and_owner_access";
  if (restoreOnly) {
    await test(restoreName, verifyRestore);
    return;
  }
  if (resumeOnly) {
    await test(resumeName, verifyResume);
    return;
  }

  await test("explicit_save_with_and_without_attachment", async () => {
    const neverStored = await save(optOut, false);
    status(neverStored.status, 200);
    assert.equal(neverStored.data.photo_state, "none");
    assert.deepEqual(neverStored.data.items, items);
    const firstSave = await save(meal, true);
    status(firstSave.status, 200);
    assert.equal(firstSave.data.user_id, owner.id);
    assert.equal(firstSave.data.photo_state, "pending");
    assert.equal(firstSave.data.photo_sha256, null);
    const retry = await save(meal, true);
    status(retry.status, 200);
    assert.deepEqual(retry.data, firstSave.data);
    status((await save(meal, false)).status, 409);
    status((await photo("POST", optOut, ownerToken)).status, 409);
    status((await photo("GET", meal, ownerToken)).status, 404);
    assert.ok((await storedPhoto()).error);
  });

  await test("private_storage_round_trip_exact_pixels", async () => {
    const uploaded = await photo("POST", meal, ownerToken);
    status(uploaded.status, 200);
    assert.deepEqual(await uploaded.json(), { photoState: "ready" });
    status((await photo("POST", meal, ownerToken)).status, 200);
    const differentFrame = body.slice();
    differentFrame[0] ^= 1;
    status((await photo("POST", meal, ownerToken, differentFrame)).status, 409);
    const stored = await storedPhoto();
    assert.equal(stored.error, null);
    retained = Buffer.from(await stored.data!.arrayBuffer());
    assert.equal(retained.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(retained.readUInt32BE(16), 2);
    assert.equal(retained.readUInt32BE(20), 2);
    assert.equal(retained.subarray(37, 41).toString(), "IDAT");
    const idatSize = retained.readUInt32BE(33);
    const pixels = inflateSync(retained.subarray(41, 41 + idatSize));
    assert.deepEqual(pixels, Buffer.from([0, ...body.subarray(0, 6), 0, ...body.subarray(6)]));
    assert.equal(retained.subarray(49 + idatSize, 53 + idatSize).toString(), "IEND");
    const { data: row, error } = await read(meal);
    assert.equal(error, null);
    assert.equal(row.photo_state, "ready");
    assert.equal(row.photo_sha256, createHash("sha256").update(retained).digest("hex"));
    const response = await photo("GET", meal, ownerToken);
    status(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("location"), null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), retained);
  });
  report.actualAuthRestStorage = true;

  await test("owner_only_rest_api_and_direct_storage", async () => {
    const peerRows = await peerClient.from("kitchen_photo_meals").select("id").eq("id", meal);
    status(peerRows.status, 200);
    assert.deepEqual(peerRows.data, []);
    assert.ok((await anon.from("kitchen_photo_meals").select("id").eq("id", meal)).error);
    for (const method of ["GET", "POST", "DELETE"] as const) {
      status((await photo(method, meal, peerToken)).status, 404);
      status((await photo(method, meal)).status, 401);
    }
    for (const client of [ownerClient, peerClient, anon]) {
      assert.ok((await client.storage.from(bucket).download(path)).error);
      assert.ok((await client.storage.from(bucket).createSignedUrl(path, 60)).error);
    }
    const direct = await backend.request("storage", `/object/public/${bucket}/${path}`);
    assert.equal(direct.ok, false);
    const wine = await admin
      .from("wines")
      .insert({ user_id: owner.id, wine_name: "Synthetic shared wine", is_public: true })
      .select("id,share_id")
      .single();
    status(wine.status, 201);
    const shareLookup = (id: string) =>
      anon
        .from("wines")
        .select("id,image_url")
        .eq("share_id", id)
        .eq("is_public", true)
        .maybeSingle();
    const controlWine = await shareLookup(wine.data.share_id);
    status(controlWine.status, 200);
    assert.deepEqual(controlWine.data, { id: wine.data.id, image_url: null });
    const shared = await shareLookup(meal);
    status(shared.status, 200);
    assert.equal(shared.data, null);
    const publicImage = await anon.rpc("is_public_wine_photo", { _storage_path: path });
    status(publicImage.status, 200);
    assert.equal(publicImage.data, false);
    status((await photo("GET", meal, ownerToken)).status, 200);
  });

  await test("mixed_photo_export_contains_exact_bytes_not_credentials", async () => {
    const winePath = `${owner.id}/${randomUUID()}.png`;
    const winePixels = new Uint8Array(retained);
    const wineUpload = await admin.storage
      .from("wine-labels")
      .upload(winePath, new Blob([winePixels], { type: "image/png" }));
    assert.equal(wineUpload.error, null);
    const exportData = createExport({
      admin: () => admin,
      erase: runAccountErasure,
      env: (key) => (key === "OWNED_MEAL_PHOTO_EXPORT" ? "true" : undefined),
    });
    const response = await exportData(
      new Request("http://127.0.0.1/api/privacy/privacy-export", {
        method: "POST",
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
    );
    status(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const manifest = await response.json();
    assert.equal(manifest.tables.kitchen_photo_meals.length, 2);
    assert.equal(manifest.files.length, 2);
    assert.deepEqual(
      manifest.files.find((file: { bucket: string }) => file.bucket === bucket),
      { bucket, path, mealId: meal },
    );
    const signed = manifest.files.find((file: { bucket: string }) => file.bucket === "wine-labels");
    assert.equal(signed.path, winePath);
    assert.equal(new URL(signed.signedUrl).origin, ownedBackendOrigin);
    let authorizedReads = 0;
    const download = await completePrivacyExport(
      manifest,
      owner.id,
      ownedBrowserOrigin,
      async (href) => {
        const url = new URL(href);
        assert.equal(url.origin, ownedBrowserOrigin);
        assert.equal(url.pathname, `/storage/v1/object/sign/wine-labels/${winePath}`);
        return backend.request("storage", url.pathname.slice("/storage/v1".length) + url.search);
      },
      () => true,
      {
        ownedPage: { origin: "http://127.0.0.1:5212" },
        readPrivateMealPhoto: async (id) => {
          authorizedReads++;
          return photo("GET", id, ownerToken);
        },
      },
    );
    assert.equal(authorizedReads, 1);
    assert.deepEqual(download.files, [
      {
        bucket,
        path,
        mimeType: "image/png",
        base64: retained.toString("base64"),
      },
      {
        bucket: "wine-labels",
        path: winePath,
        mimeType: "image/png",
        base64: Buffer.from(winePixels).toString("base64"),
      },
    ]);
  });

  await test("photo_removal_keeps_meal_and_prevents_republication", async () => {
    status((await photo("DELETE", meal, ownerToken)).status, 204);
    status((await photo("DELETE", meal, ownerToken)).status, 204);
    status((await photo("GET", meal, ownerToken)).status, 404);
    status((await photo("POST", meal, ownerToken)).status, 409);
    assert.ok((await storedPhoto()).error);
    assert.deepEqual((await read(meal)).data, {
      photo_state: "removed",
      photo_sha256: null,
      items,
    });
  });
  await test(resumeName, verifyResume);

  await test("account_erasure_revokes_read_and_removes_private_file", async () => {
    const id = randomUUID();
    const peerMeal = randomUUID();
    status((await save(id, true)).status, 200);
    status(
      (
        await peerClient.rpc("kitchen_save_photo_meal", {
          _id: peerMeal,
          _items: items,
          _keep_photo: false,
        })
      ).status,
      200,
    );
    status((await photo("POST", id, ownerToken)).status, 200);
    const inventory = await admin.rpc("privacy_account_storage_objects", { _user_id: owner.id });
    status(inventory.status, 200);
    assert.equal(
      inventory.data.filter(
        (file: { bucket_id: string; name: string }) =>
          file.bucket_id === bucket && file.name === `${owner.id}/${id}.png`,
      ).length,
      1,
    );
    const deletion = await admin.rpc("request_account_erasure", { _user_id: owner.id });
    status(deletion.status, 204);
    status((await photo("GET", id, ownerToken)).status, 404);
    const rows = await ownerClient.from("kitchen_photo_meals").select("id");
    status(rows.status, 200);
    assert.deepEqual(rows.data, []);
    assert.equal((await runAccountErasure(admin, owner.id)).complete, true);
    assert.ok((await admin.storage.from(bucket).download(`${owner.id}/${id}.png`)).error);
    assert.ok((await admin.auth.admin.getUserById(owner.id)).error);
    const remaining = await admin.from("kitchen_photo_meals").select("id,user_id");
    status(remaining.status, 200);
    assert.deepEqual(remaining.data, [{ id: peerMeal, user_id: peer.id }]);
  });

  await test(restoreName, verifyRestore);

  async function verifyResume() {
    const staged = randomUUID();
    const missing = randomUUID();
    const retainNone = randomUUID();
    status((await save(staged, true)).status, 200);
    status((await save(missing, true)).status, 200);
    status((await save(retainNone, false)).status, 200);
    status((await photo("PATCH", retainNone, ownerToken)).status, 409);
    const preHash = await photo("PATCH", missing, ownerToken);
    status(preHash.status, 200);
    assert.deepEqual(await preHash.json(), { photoState: "pending" });

    const fault = (stage: "before-write" | "before-publish") =>
      createMealPhotoStorageHandler({
        enabled: () => true,
        async authorize(token) {
          const session = await authorize(token);
          assert.ok(session);
          return {
            ...session,
            async put(path, png) {
              return stage === "before-write" ? false : session.put(path, png);
            },
            async transition(id, ...args) {
              if (stage === "before-publish" && args[0] === "publish")
                throw new Error("synthetic interrupted upload");
              return session.transition(id, ...args);
            },
          };
        },
      });
    status((await fault("before-write")(photoRequest("POST", missing, ownerToken))).status, 503);
    assert.ok((await read(missing)).data.photo_sha256);
    const absent = await photo("PATCH", missing, ownerToken);
    status(absent.status, 200);
    assert.deepEqual(await absent.json(), { photoState: "pending" });
    const other = body.slice();
    other[0] ^= 1;
    status((await photo("POST", missing, ownerToken, other)).status, 409);
    status((await photo("POST", missing, ownerToken)).status, 200);

    status((await fault("before-publish")(photoRequest("POST", staged, ownerToken))).status, 503);
    const pinned = (await read(staged)).data;
    assert.equal(pinned.photo_state, "pending");
    status((await photo("GET", staged, ownerToken)).status, 404);
    status((await photo("PATCH", staged, peerToken)).status, 404);
    status((await photo("PATCH", staged)).status, 401);
    const ready = await photo("PATCH", staged, ownerToken);
    status(ready.status, 200);
    assert.deepEqual(await ready.json(), { photoState: "ready" });
    const restored = await photo("GET", staged, ownerToken);
    status(restored.status, 200);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await restored.arrayBuffer()))
        .digest("hex"),
      pinned.photo_sha256,
    );
    status((await photo("PATCH", staged, ownerToken)).status, 200);
    status((await photo("DELETE", staged, ownerToken)).status, 204);
    status((await photo("PATCH", staged, ownerToken)).status, 409);
    assert.deepEqual((await read(staged)).data.items, items);
    report.actualAuthRestStorage = true;
  }

  async function verifyRestore() {
    const restoredMeal = randomUUID();
    status(
      (
        await peerClient.rpc("kitchen_save_photo_meal", {
          _id: restoredMeal,
          _items: items,
          _keep_photo: true,
        })
      ).status,
      200,
    );
    status((await photo("POST", restoredMeal, peerToken)).status, 200);
    const result = await photo("GET", restoredMeal, peerToken);
    status(result.status, 200);
    const digest = createHash("sha256")
      .update(Buffer.from(await result.arrayBuffer()))
      .digest("hex");
    report.actualAuthRestStorage = true;
    report.restored = await backend.restoreMealPhotoFixture(digest);
    assert.equal(report.restored.completed, true);
    assert.equal(report.restored.cleanupCompleted, true);
    assert.equal(report.restored.restoredMealPhotoDigestsVerified, 1);
    assert.equal(report.restored.restoredObjectsDownloaded, 1);
    assert.equal(report.restored.restoredPeerMealRowsHidden, true);
  }
}

try {
  await run();
  report.completed = true;
} catch (error) {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)) report.failureCode = code;
  const reason = (error as { category?: unknown })?.category;
  if (typeof reason === "string" && /^[a-z_]{1,40}$/.test(reason)) report.archiveRejection = reason;
  if (
    error instanceof Error &&
    [
      "owned_storage_archive_rejected",
      "planning_database_command_failed",
      "isolated_meal_photo_restore_failed",
    ].includes(error.message)
  )
    report.failureCategory = error.message;
} finally {
  try {
    report.cleanupCompleted = await backend.close();
  } catch {
    report.cleanupCompleted = false;
  }
}

const destination = new URL("../dist/core-meal-photo/", import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(
  new URL(`storage-${report.checkedAt.replace(/[:.]/g, "-")}.json`, destination),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (!report.completed || !report.cleanupCompleted) process.exitCode = 1;
