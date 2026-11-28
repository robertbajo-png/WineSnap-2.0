import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isolatedMealPhotoApi, isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import { pantryMigrationBatch } from "./lib/owned-pantry-preflight.mjs";
import {
  mealPhotoMigrationBatch,
  mealPhotoMigrationBaseline,
} from "./lib/owned-meal-photo-delivery.mjs";

assert.ok(
  process.argv.length === 2 ||
    (process.argv.length === 3 &&
      /^winesnap-planning-rehearsal:dev10-[a-f0-9]{7,40}$/.test(process.argv[2])),
);
const candidateTag = process.argv[2];
const report = {
  checkedAt: new Date().toISOString(),
  synthetic: true,
  completed: false,
  cleanupCompleted: false,
  installedAppTouched: false,
  productionTouched: false,
  externalAiCalled: false,
  phase: "bootstrap",
};
const backend = isolatedPlanningBackend(report, {
  meals: true,
  mealPhotos: true,
  throughMigration: pantryMigrationBatch.at(-1),
});

async function rehearseWebFallback(previous, nextImage, account) {
  const { createClient } = await import("@supabase/supabase-js");
  const { authorizeMealPhotoStorage, createMealPhotoStorageHandler } =
    await import("../src/lib/mealPhotoStorage.server.ts");
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: backend.mealPhotoFixtureFetch() },
  };
  const owner = createClient(isolatedMealPhotoApi, backend.anon, options);
  const lookup = createClient(isolatedMealPhotoApi, backend.anon, options);
  const admin = createClient(isolatedMealPhotoApi, backend.serviceRole, options);
  const login = await owner.auth.signInWithPassword(account);
  assert.equal(login.error, null);
  const id = randomUUID();
  const saved = await owner.rpc("kitchen_save_photo_meal", {
    _id: id,
    _items: [{ name: "Synthetic meal", portion: null }],
    _keep_photo: true,
  });
  assert.equal(saved.status, 200);
  const handle = createMealPhotoStorageHandler({
    enabled: () => true,
    authorize: (token) => authorizeMealPhotoStorage(token, lookup, async () => admin),
  });
  const photo = (method) =>
    handle(
      new Request("http://127.0.0.1/api/meal-photo?id=" + id, {
        method,
        headers: {
          Authorization: "Bearer " + login.data.session.access_token,
          ...(method === "POST"
            ? {
                "Content-Type": "application/octet-stream",
                "X-Meal-Photo-Width": "2",
                "X-Meal-Photo-Height": "1",
              }
            : {}),
        },
        ...(method === "POST" ? { body: new Uint8Array([200, 187, 128, 91, 72, 39]) } : {}),
      }),
    );
  assert.equal((await photo("POST")).status, 200);
  const readHash = async () => {
    const response = await photo("GET");
    assert.equal(response.status, 200);
    return createHash("sha256")
      .update(Buffer.from(await response.arrayBuffer()))
      .digest("hex");
  };
  const hash = await readHash();
  const before = await backend.mealPhotoSnapshot();
  const privateExportDisabled = async () => {
    const response = await backend.requestWeb("/api/privacy/privacy-export", "POST");
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), { error: "Local operations disabled" });
  };
  report.phase = "boot_exact_candidate_image";
  const candidate = await backend.replaceRehearsalWeb(nextImage);
  assert.equal((await backend.requestWeb("/kitchen", "GET")).status, 200);
  assert.equal((await backend.requestWeb("/api/meal-photo?id=" + id, "GET")).status, 404);
  await privateExportDisabled();
  assert.deepEqual(await backend.mealPhotoSnapshot(), before);
  assert.equal(await readHash(), hash);
  report.candidateImageBootVerified = true;
  report.phase = "boot_exact_previous_image_with_operations_disabled";
  const fallback = await backend.replaceRehearsalWeb(previous.image);
  assert.notEqual(fallback, candidate);
  await privateExportDisabled();
  assert.deepEqual(await backend.mealPhotoSnapshot(), before);
  assert.equal(await readHash(), hash);
  assert.deepEqual(await backend.inspectPreviousOwnedWeb(), previous);
  report.legacyPrivacyEndpointDisabled = true;
  report.webOnlyRollbackPreservedPrivateBytes = true;
  report.backOnOriginalImageInFixture = true;
}

try {
  let previous, candidate;
  if (candidateTag) {
    report.phase = "read_exact_image_identities";
    previous = await backend.inspectPreviousOwnedWeb();
    candidate = await backend.candidateImage(candidateTag, { mealPhoto: true });
    assert.match(candidate, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(candidate, previous.image);
    report.previousImage = previous.image;
    report.candidateImage = candidate;
  }
  await backend.boot();
  assert.equal(report.isolatedMigrationsApplied, mealPhotoMigrationBaseline);
  report.phase = "seed_legacy_share";
  const account = await backend.createAccount("owner");
  const owner = account.id;
  const wine = await backend.admin("/wines?select=id,share_id", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      user_id: owner,
      wine_name: "Synthetic migration control",
      is_public: true,
    }),
  });
  assert.equal(wine.status, 201);
  const [{ id, share_id }] = await wine.json();
  assert.ok(id && share_id);
  const query = new URLSearchParams({
    select: "id,share_id,image_url",
    share_id: "eq." + share_id,
    is_public: "eq.true",
  });
  const readShare = async () => {
    const response = await backend.request("rest", "/wines?" + query, {
      headers: { authorization: "Bearer " + backend.anon },
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const before = await readShare();
  assert.deepEqual(before, [{ id, share_id, image_url: null }]);
  report.migrations = await backend.rehearseMealPhotoMigrations(
    candidate ? { previousImage: previous.image, candidateImage: candidate } : undefined,
  );
  assert.deepEqual(report.migrations, {
    before: mealPhotoMigrationBaseline,
    after: mealPhotoMigrationBaseline + mealPhotoMigrationBatch.length,
    applied: [...mealPhotoMigrationBatch],
  });
  report.phase = "verify_preserved_legacy_share";
  assert.deepEqual(await readShare(), before);
  report.legacyShareUnchanged = true;
  if (candidate) await rehearseWebFallback(previous, candidate, account);
  report.completed = true;
} catch (error) {
  if (typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code))
    report.failureCode = error.code;
} finally {
  try {
    report.cleanupCompleted = await backend.close();
  } catch {
    report.cleanupCompleted = false;
  }
}
const directory = new URL("../dist/core-meal-photo/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL(`delivery-${report.checkedAt.replace(/[:.]/g, "-")}.json`, directory),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (!report.completed || !report.cleanupCompleted) process.exitCode = 1;
