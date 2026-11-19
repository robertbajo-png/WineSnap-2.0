import assert from "node:assert/strict";
import { planOwnedMigrations } from "./owned-lifecycle.mjs";

export const planningMigration = "20261118200000_kitchen_week_plans.sql";

// Probe only schema markers and installer metadata, in a read-only transaction.
export const planningLedgerQuery = `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT json_build_object(
  'installation', (SELECT id FROM winesnap_local.installation),
  'applied', (SELECT coalesce(json_agg(json_build_object('name',name,'sha256',sha256)
    ORDER BY name),'[]'::json) FROM winesnap_local.migrations),
  'tableExists', to_regclass('public.kitchen_week_plans') IS NOT NULL,
  'saveExists', to_regprocedure('public.kitchen_save_week_plan(date,integer,uuid,jsonb)') IS NOT NULL
);
ROLLBACK;`;

export function assessPlanningLedger(sources, ledger, installation) {
  assert.match(installation, /^[a-f0-9]{32}$/);
  assert.equal(ledger?.installation, installation);
  assert.ok(Array.isArray(sources) && sources.length <= 256);
  assert.ok(sources.some(({ name }) => name === planningMigration));
  assert.ok(Array.isArray(ledger.applied) && ledger.applied.length <= sources.length);
  const pending = planOwnedMigrations(sources, ledger.applied).map(({ name }) => name);
  const ordered = sources.map(({ name }) => name).sort((a, b) => a.localeCompare(b, "en"));
  assert.deepEqual(
    pending,
    ordered.slice(ledger.applied.length),
    "Installed history is not a prefix",
  );
  const alreadyApplied = !pending.includes(planningMigration);
  assert.equal(ledger.tableExists, alreadyApplied);
  assert.equal(ledger.saveExists, alreadyApplied);
  assert.deepEqual(
    pending,
    alreadyApplied ? [] : [planningMigration],
    "Unexpected migration scope",
  );
  return {
    applied: ledger.applied.length,
    pending,
    scope: alreadyApplied ? "already_applied" : "expected_additive_migration",
  };
}

export function planningRollbackTag(imageId) {
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  return "winesnap-owned:planning-rollback-" + imageId.slice(7, 19);
}
