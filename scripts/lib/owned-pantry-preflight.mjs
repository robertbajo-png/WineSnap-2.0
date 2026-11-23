import assert from "node:assert/strict";
import { planOwnedMigrations } from "./owned-lifecycle.mjs";
import { planningMigration } from "./owned-planning-preflight.mjs";

export const pantryMigrationBatch = Object.freeze([
  "20261123140000_kitchen_pantry.sql",
  "20261123150000_week_plan_diners.sql",
]);
export const pantryMigrationBaseline = 38;

// The probe checks only the installer ledger and catalog, never owner rows.
export const pantryLedgerQuery = `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT json_build_object(
  'installation', (SELECT id FROM winesnap_local.installation),
  'applied', (SELECT coalesce(json_agg(json_build_object('name',name,'sha256',sha256)
    ORDER BY name),'[]'::json) FROM winesnap_local.migrations),
  'tableExists', to_regclass('public.kitchen_week_plans') IS NOT NULL,
  'saveExists', to_regprocedure('public.kitchen_save_week_plan(date,integer,uuid,jsonb)') IS NOT NULL,
  'stock', to_regclass('public.kitchen_pantry') IS NOT NULL,
  'receipt', to_regclass('public.kitchen_pantry_consumption') IS NOT NULL,
  'saveStock', to_regprocedure('public.kitchen_save_pantry_item(uuid,integer,uuid,jsonb)') IS NOT NULL,
  'confirmUsage', to_regprocedure('public.kitchen_confirm_pantry_consumption(uuid,integer,integer,uuid,jsonb)') IS NOT NULL,
  'validateDiners', to_regprocedure('public.kitchen_week_diner_ids_valid(jsonb)') IS NOT NULL,
  'enforceDiners', to_regprocedure('public.kitchen_week_validate_diner_changes()') IS NOT NULL,
  'dinerTrigger', EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=to_regclass('public.kitchen_week_plans')
      AND tgname='kitchen_week_validate_diners_before_write'
      AND tgfoid=to_regprocedure('public.kitchen_week_validate_diner_changes()')
      AND tgenabled='O' AND NOT tgisinternal)
);
ROLLBACK;`;

export function assessPantryLedger(sources, ledger, installation) {
  assert.match(installation, /^[a-f0-9]{32}$/);
  assert.equal(ledger?.installation, installation);
  assert.ok(Array.isArray(sources));
  assert.equal(sources.length, pantryMigrationBaseline + pantryMigrationBatch.length);
  const ordered = sources.map(({ name }) => name).sort((a, b) => a.localeCompare(b, "en"));
  assert.equal(ordered[pantryMigrationBaseline - 1], planningMigration);
  assert.deepEqual(ordered.slice(pantryMigrationBaseline), pantryMigrationBatch);
  assert.ok(Array.isArray(ledger.applied));
  assert.ok([pantryMigrationBaseline, sources.length].includes(ledger.applied.length));
  const pending = planOwnedMigrations(sources, ledger.applied).map(({ name }) => name);
  assert.deepEqual(pending, ordered.slice(ledger.applied.length), "Unexpected DEV-07 history");
  assert.equal(ledger.tableExists, true);
  assert.equal(ledger.saveExists, true);
  const installed = pending.length === 0;
  for (const marker of [
    "stock",
    "receipt",
    "saveStock",
    "confirmUsage",
    "validateDiners",
    "enforceDiners",
    "dinerTrigger",
  ]) {
    assert.equal(ledger[marker], installed, `Inconsistent DEV-07 schema marker: ${marker}`);
  }
  return {
    applied: ledger.applied.length,
    pending,
    scope: installed ? "already_applied" : "expected_additive_migrations",
  };
}

export function requirePantryUpdate(sources, ledger, installation) {
  const assessed = assessPantryLedger(sources, ledger, installation);
  assert.equal(assessed.scope, "expected_additive_migrations", "DEV-07 is not a retry");
  return assessed;
}

export function pantryRollbackTag(imageId) {
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  return "winesnap-owned:pantry-rollback-" + imageId.slice(7, 19);
}
