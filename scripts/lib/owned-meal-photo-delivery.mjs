import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { planOwnedMigrations } from "./owned-lifecycle.mjs";
import { pantryMigrationBatch } from "./owned-pantry-preflight.mjs";

export const mealPhotoMigrationBaseline = 40;
export const mealPhotoMigrationBatch = Object.freeze([
  "20261128090000_kitchen_photo_meals.sql",
  "20261128110000_kitchen_meal_photo_objects.sql",
]);
const reviewedMigrationDigests = Object.freeze([
  "2fdbc4a0d2baf71e4702ce4daef3eac1a5850a758f0c50e1c1314c181db8a6ba",
  "7910d15a5667a035deed6021112a3baab17e3d3c24f4ae59f5221a4344094783",
]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const table = "public.kitchen_photo_meals";
const save = "public.kitchen_save_photo_meal(uuid,jsonb,boolean)";
const transition = "public.kitchen_photo_object_transition(uuid,uuid,text,text)";

// Catalog and migration metadata only. Never select saved meals or object paths.
export const ownedMealPhotoLedgerQuery = `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT json_build_object(
  'installation', (SELECT id FROM winesnap_local.installation),
  'applied', (SELECT coalesce(json_agg(json_build_object('name',name,'sha256',sha256)
    ORDER BY name),'[]'::json) FROM winesnap_local.migrations),
  'baseline', to_regclass('public.kitchen_pantry') IS NOT NULL
    AND to_regclass('public.kitchen_pantry_consumption') IS NOT NULL
    AND to_regprocedure('public.kitchen_week_diner_ids_valid(jsonb)') IS NOT NULL,
  'mealTable', to_regclass('${table}') IS NOT NULL,
  'rls', EXISTS (SELECT 1 FROM pg_catalog.pg_class
    WHERE oid=to_regclass('${table}') AND relrowsecurity),
  'bucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='meal-photos'),
  'publicBucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='meal-photos' AND public),
  'directStorageDenied', EXISTS (SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid=to_regclass('storage.objects') AND polname='meal_photos_service_only'
      AND NOT polpermissive AND polcmd='*'
      AND to_regrole('anon')::oid = ANY(polroles)
      AND to_regrole('authenticated')::oid = ANY(polroles)),
  'digestColumn', EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid=to_regclass('${table}') AND attname='photo_sha256' AND NOT attisdropped),
  'saveFunction', to_regprocedure('${save}') IS NOT NULL,
  'objectTransition', to_regprocedure('${transition}') IS NOT NULL,
  'ownerReadGranted', coalesce(has_table_privilege('authenticated', to_regclass('${table}'), 'SELECT'), false),
  'anonymousReadGranted', coalesce(has_table_privilege('anon', to_regclass('${table}'), 'SELECT'), false),
  'directWriteGranted', coalesce(has_table_privilege('authenticated', to_regclass('${table}'), 'INSERT,UPDATE,DELETE,TRUNCATE'), false),
  'ownerSaveGranted', coalesce(has_function_privilege('authenticated', to_regprocedure('${save}'), 'EXECUTE'), false),
  'anonymousSaveGranted', coalesce(has_function_privilege('anon', to_regprocedure('${save}'), 'EXECUTE'), false),
  'serviceTransitionGranted', coalesce(has_function_privilege('service_role', to_regprocedure('${transition}'), 'EXECUTE'), false),
  'clientTransitionGranted', coalesce(has_function_privilege('authenticated', to_regprocedure('${transition}'), 'EXECUTE'), false)
    OR coalesce(has_function_privilege('anon', to_regprocedure('${transition}'), 'EXECUTE'), false)
);
ROLLBACK;`;

function checkReviewedSource(item, index) {
  assert.equal(item.name, mealPhotoMigrationBatch[index], "Unexpected DEV-10 migration");
  const normalized = item.source.replaceAll("\r\n", "\n");
  assert.equal(digest(normalized), reviewedMigrationDigests[index], "DEV-10 source changed");
  return normalized;
}

export function assessOwnedMealPhotoLedger(sources, observation, installation) {
  assert.match(installation, /^[a-f0-9]{32}$/);
  assert.equal(observation?.installation, installation);
  assert.equal(observation.baseline, true, "DEV-07 baseline markers are missing");
  const ordered = planOwnedMigrations(sources, []);
  assert.equal(ordered.length, mealPhotoMigrationBaseline + mealPhotoMigrationBatch.length);
  assert.deepEqual(
    ordered
      .slice(mealPhotoMigrationBaseline - pantryMigrationBatch.length, mealPhotoMigrationBaseline)
      .map(({ name }) => name),
    pantryMigrationBatch,
  );
  ordered.slice(mealPhotoMigrationBaseline).forEach(checkReviewedSource);
  const applied = observation.applied.length;
  assert.ok(
    [mealPhotoMigrationBaseline, ordered.length].includes(applied),
    "Partial DEV-10 ledger",
  );
  const pending = planOwnedMigrations(sources, observation.applied);
  assert.deepEqual(
    pending.map(({ name }) => name),
    applied === mealPhotoMigrationBaseline ? mealPhotoMigrationBatch : [],
  );
  const installed = pending.length === 0;
  for (const marker of [
    "mealTable",
    "rls",
    "bucket",
    "directStorageDenied",
    "digestColumn",
    "saveFunction",
    "objectTransition",
    "ownerReadGranted",
    "ownerSaveGranted",
    "serviceTransitionGranted",
  ]) {
    assert.equal(observation[marker], installed, `Inconsistent DEV-10 schema marker: ${marker}`);
  }
  for (const marker of [
    "publicBucket",
    "anonymousReadGranted",
    "directWriteGranted",
    "anonymousSaveGranted",
    "clientTransitionGranted",
  ])
    assert.equal(observation[marker], false, `Unsafe DEV-10 schema marker: ${marker}`);
  return {
    applied,
    pending,
    scope: installed ? "already_applied" : "expected_additive_migrations",
  };
}

export function requireOwnedMealPhotoUpdate(sources, observation, installation) {
  const result = assessOwnedMealPhotoLedger(sources, observation, installation);
  assert.equal(result.scope, "expected_additive_migrations", "DEV-10 is not a retry");
  return result;
}

export function ownedMealPhotoMigrationTransaction(pending) {
  assert.equal(pending.length, mealPhotoMigrationBatch.length);
  const statements = pending.map((item, index) => {
    const normalized = checkReviewedSource(item, index);
    assert.equal(digest(item.source), item.sha256);
    // Only the exact reviewed files may have their outer wrappers removed.
    const body = /^BEGIN;\n([\s\S]+)\nCOMMIT;\n?$/.exec(normalized)?.[1];
    assert.ok(body);
    return `${body}\nINSERT INTO winesnap_local.migrations(name,sha256) VALUES('${item.name}','${item.sha256}');`;
  });
  return `BEGIN;\n${statements.join("\n")}\nCOMMIT;`;
}

export function refuseOrdinaryMealPhotoMigration(pending) {
  assert.ok(
    !pending.some(({ name }) => mealPhotoMigrationBatch.includes(name)),
    "DEV-10 requires the dedicated locally approved update",
  );
}
