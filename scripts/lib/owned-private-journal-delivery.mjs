import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assessOwnedMealPhotoLedger,
  ownedMealPhotoLedgerQuery,
  requireMealPhotoRecovery,
} from "./owned-meal-photo-delivery.mjs";

export const journalWebRevision = "ec2b0bba613b20331498e7bab920d1cf0c0edbfc";
export const journalPriorWebImage =
  "sha256:f8b99303c8f8063a464d8dcd9ec3a1514d4f359a0800262c433794bc52b63da3";
export const journalDeliveryLabel = "dev11-dormant";
export const journalLabelKey = "winesnap.private-journal";
const schemaHash = "520c7c1d8c3bfcf5b61a6cf324364c49714a427b00752f6bbe1b024ff03a07a2";
const schemaMark = "WineSnap DEV-11 dormant source " + schemaHash;
const imageId = /^sha256:[a-f0-9]{64}$/;
const containerId = /^[a-f0-9]{64}$/;
const installationId = /^[a-f0-9]{32}$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const tableNames = [
  "winesnap_dev11_control.account",
  "winesnap_dev11_control.installation",
  "winesnap_dev11_control.reading_permit",
  "winesnap_dev11_data.goal",
  "winesnap_dev11_data.reading",
];

export function journalRollbackTag(image) {
  assert.match(image, imageId);
  return "winesnap-owned:private-journal-rollback-" + image.slice(7, 19);
}

export function requireJournalRecovery(observation, backup, evidence, now = Date.now()) {
  assert.equal(evidence.previousImage, journalPriorWebImage, "Unrehearsed DEV-10 base image");
  requireMealPhotoRecovery(observation, backup, evidence, now);
  assert.equal(observation.reports.backup.backupIncludesPrivateJournal, false);
  assert.equal(observation.reports.restore.ordinaryJournalExclusionVerified, true);
}

// No account IDs or journal content are returned.
export const journalCatalogQuery = `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
WITH schemas AS (
  SELECT oid, nspname FROM pg_namespace
  WHERE nspname IN ('winesnap_dev11_control','winesnap_dev11_data')
), api AS (SELECT * FROM pg_roles WHERE rolname='winesnap_dev11_api'), clients AS (
  SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','authenticator','service_role')
), relations AS (
  SELECT s.nspname || '.' || c.relname AS name, c.oid, c.relrowsecurity
  FROM schemas s JOIN pg_class c ON c.relnamespace = s.oid WHERE c.relkind IN ('r','p')
), bridge AS (SELECT to_regprocedure('winesnap_local.dev11_account_erasure()') AS oid),
trigger_state AS (
  SELECT tgfoid,tgenabled,tgtype FROM pg_trigger
  WHERE tgrelid=to_regclass('public.privacy_erasure_receipts') AND tgname='dev11_account_erasure'
)
SELECT json_build_object(
  'schemas',(SELECT count(*) FROM schemas),
  'mark',obj_description(to_regnamespace('winesnap_dev11_control'),'pg_namespace'),
  'roleExists',EXISTS(SELECT 1 FROM api),
  'roleLocked',EXISTS(SELECT 1 FROM api r WHERE NOT (rolcanlogin OR rolsuper OR rolcreaterole OR
    rolcreatedb OR rolbypassrls OR rolreplication OR rolinherit) AND NOT EXISTS (
      SELECT 1 FROM pg_auth_members m WHERE r.oid IN (m.member,m.roleid)
    )),
  'bridgeExists',(SELECT oid IS NOT NULL FROM bridge),
  'triggerCount',(SELECT count(*) FROM trigger_state),
  'bridgeSafe',EXISTS(SELECT 1 FROM trigger_state t JOIN bridge b ON t.tgfoid=b.oid
    JOIN pg_proc p ON p.oid=b.oid WHERE t.tgtype=5 AND t.tgenabled='O' AND p.prosecdef),
  'securedTables',(SELECT coalesce(json_agg(name ORDER BY name COLLATE "C"),'[]') FROM relations WHERE relrowsecurity),
  'tableCount',(SELECT count(*) FROM relations),
  'functionCount',(SELECT count(*) FROM schemas s JOIN pg_proc p ON p.pronamespace=s.oid),
  'unsafeClientGrant',EXISTS(SELECT 1 FROM clients c WHERE
    EXISTS(SELECT 1 FROM schemas s WHERE has_schema_privilege(c.oid,s.oid,'USAGE,CREATE')) OR
    EXISTS(SELECT 1 FROM relations r WHERE has_table_privilege(c.oid,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) OR
    EXISTS(SELECT 1 FROM schemas s JOIN pg_proc p ON p.pronamespace=s.oid
      WHERE has_function_privilege(c.oid,p.oid,'EXECUTE')) OR
    EXISTS(SELECT 1 FROM bridge b WHERE b.oid IS NOT NULL AND has_function_privilege(c.oid,b.oid,'EXECUTE'))
  ),
  'apiScoped',EXISTS(SELECT 1 FROM api r WHERE
    has_schema_privilege(r.oid,to_regnamespace('winesnap_dev11_control'),'USAGE') AND
    NOT has_schema_privilege(r.oid,to_regnamespace('winesnap_dev11_data'),'USAGE,CREATE') AND
    NOT has_schema_privilege(r.oid,to_regnamespace('winesnap_dev11_control'),'CREATE') AND
    NOT EXISTS(SELECT 1 FROM relations t WHERE has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) AND
    (SELECT count(*) FROM schemas s JOIN pg_proc p ON p.pronamespace=s.oid
      WHERE has_function_privilege(r.oid,p.oid,'EXECUTE'))=2 AND
    has_function_privilege(r.oid,to_regprocedure('winesnap_dev11_control.command(uuid,jsonb)'),'EXECUTE') AND
    has_function_privilege(r.oid,to_regprocedure('winesnap_dev11_control.confirm(uuid,uuid,timestamptz)'),'EXECUTE')
  )
);
ROLLBACK;`;

export const journalEmptyQuery = `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT NOT (${tableNames.map((table) => `EXISTS (SELECT 1 FROM ${table})`).join(" OR ")});
ROLLBACK;`;

export function assessJournalCatalog(catalog) {
  if (
    catalog?.schemas === 0 &&
    catalog.roleExists === false &&
    catalog.bridgeExists === false &&
    catalog.triggerCount === 0
  )
    return "absent";
  assert.equal(catalog?.schemas, 2, "Incomplete private journal schemas");
  assert.equal(catalog.mark, schemaMark, "Unreviewed private journal schema");
  assert.equal(catalog.roleExists, true);
  assert.equal(catalog.roleLocked, true, "Private journal login or membership exists");
  assert.equal(catalog.bridgeExists, true);
  assert.equal(catalog.triggerCount, 1);
  assert.equal(catalog.bridgeSafe, true);
  assert.equal(catalog.tableCount, tableNames.length);
  assert.deepEqual(catalog.securedTables, tableNames);
  assert.equal(catalog.functionCount, 7);
  assert.equal(catalog.unsafeClientGrant, false);
  assert.equal(catalog.apiScoped, true);
  return "dormant";
}

export async function inspectJournalDeliveryState({ sources, installation, sql }) {
  const ledger = JSON.parse(await sql(ownedMealPhotoLedgerQuery));
  const state = assessOwnedMealPhotoLedger(sources, ledger, installation);
  assert.equal(state.scope, "already_applied", "Verified DEV-10 required");
  const schema = assessJournalCatalog(JSON.parse(await sql(journalCatalogQuery)));
  if (schema === "dormant")
    assert.equal(await sql(journalEmptyQuery), "t", "Journal is not empty; refuse installation");
  return { schema, applied: state.applied, ledger: ledger.applied };
}

// Pin the reviewed DDL. Confirm the DEV-10 ledger again inside the same transaction.
export function journalInstallationTransaction(source, installation, ledger) {
  assert.match(installation, installationId);
  assert.equal(ledger.length, 42);
  const expectedLedger = hash(ledger.map(({ name, sha256 }) => name + ":" + sha256).join("\n"));
  const normalized = source.replaceAll("\r\n", "\n");
  assert.equal(hash(normalized), schemaHash, "Reviewed private journal source changed");
  const body = /^--[^\n]+\nBEGIN;\n([\s\S]+)\nCOMMIT;\n?$/.exec(normalized)?.[1];
  assert.ok(body);
  return `BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE winesnap_local.migrations IN SHARE MODE;
DO $$
BEGIN
  IF (SELECT id FROM winesnap_local.installation) IS DISTINCT FROM '${installation}'
    OR (SELECT encode(sha256(convert_to(coalesce(string_agg(name || ':' || sha256, chr(10)
        ORDER BY name COLLATE "C"),''),'UTF8')),'hex') FROM winesnap_local.migrations)
      IS DISTINCT FROM '${expectedLedger}'
    OR to_regnamespace('winesnap_dev11_control') IS NOT NULL
    OR to_regnamespace('winesnap_dev11_data') IS NOT NULL
    OR to_regrole('winesnap_dev11_api') IS NOT NULL
    OR to_regprocedure('winesnap_local.dev11_account_erasure()') IS NOT NULL
  THEN RAISE EXCEPTION 'Private journal install baseline changed';
  END IF;
END $$;
${body}
COMMENT ON SCHEMA winesnap_dev11_control IS '${schemaMark}';
COMMIT;`;
}

// Use the same replacement and fallback sequence in the isolated rehearsal and on the owned host.
export async function deliverDormantJournal({
  previous,
  guard,
  build,
  retain,
  apply,
  assess,
  verifyBackend,
  readWeb,
  removeWeb,
  startWeb,
  verifyWeb,
  tagWeb,
  stage,
  recovery,
}) {
  assert.match(previous.Id, containerId);
  assert.match(previous.Image, imageId);
  assert.equal(previous.Config.Labels[journalLabelKey], undefined);
  const unchanged = (web) =>
    web?.Id === previous.Id && web.Image === previous.Image && web.State.Running === true;
  const exactPrevious = async () =>
    assert.ok(unchanged(await readWeb()), "Previous web container changed");
  const requireGuard = async (retained) => {
    const plan = await guard({ retained });
    assert.ok(["absent", "dormant"].includes(plan.schema));
    await exactPrevious();
    return plan;
  };
  const dormant = async () => {
    assert.equal((await assess()).schema, "dormant");
    await verifyBackend();
  };

  const initial = await requireGuard(false);
  stage("private_journal_build");
  const candidate = await build();
  assert.match(candidate, imageId);
  assert.notEqual(candidate, previous.Image);
  assert.equal((await requireGuard(false)).schema, initial.schema, "Journal changed during build");
  await retain(previous.Image);
  const plan = await requireGuard(true);
  assert.equal(plan.schema, initial.schema, "Journal changed before installation");
  try {
    stage("private_journal_install_dormant_schema");
    if (plan.schema === "absent") {
      assert.equal(typeof plan.transaction, "string");
      await apply(plan.transaction);
    }
    await dormant();
    await exactPrevious();
    stage("private_journal_replace_web");
    await removeWeb(previous.Id);
    await startWeb(candidate, journalDeliveryLabel);
    await verifyWeb(candidate, journalDeliveryLabel);
    await dormant();
    await tagWeb(candidate);
  } catch (failure) {
    stage("private_journal_recovery");
    const current = await readWeb();
    if (unchanged(current)) {
      await verifyWeb(previous.Image, undefined, { unchanged: true });
      recovery("previous_web_unchanged");
      throw failure;
    }
    if (current) {
      assert.match(current.Id, containerId);
      assert.ok(
        current.Image === candidate &&
          current.Config.Labels[journalLabelKey] === journalDeliveryLabel,
        "Unexpected web container; refuse removal",
      );
      await removeWeb(current.Id);
    }
    await startWeb(previous.Image);
    await verifyWeb(previous.Image);
    await dormant();
    await tagWeb(previous.Image);
    recovery("exact_web_fallback_verified");
    throw failure;
  }
  return candidate;
}
