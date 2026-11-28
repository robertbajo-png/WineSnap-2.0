import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import { mealPhotoWebLabel } from "./lib/owned-meal-photo-delivery.mjs";
import {
  deliverDormantJournal,
  inspectJournalDeliveryState,
  journalDeliveryLabel,
  journalInstallationTransaction,
  journalLabelKey,
  journalWebRevision,
} from "./lib/owned-private-journal-delivery.mjs";
import {
  assertOrdinaryJournalFree,
  ordinaryJournalExclusions,
} from "./lib/owned-dev11-archive.mjs";

assert.equal(process.platform, "win32");
assert.ok(
  process.argv.length === 2 ||
    (process.argv.length === 3 && process.argv[2] === "--ordinary-recovery-only"),
);
const archiveOnly = process.argv[2] === "--ordinary-recovery-only";
const report = {
  checkedAt: new Date().toISOString(),
  synthetic: true,
  installedAppTouched: false,
  productionTouched: false,
  hostedTestTouched: false,
  externalAiCalled: false,
  completed: false,
  cleanupCompleted: false,
  phase: "boot",
};
const backend = isolatedPlanningBackend(report, {
  meals: true,
  mealPhotos: true,
  privateJournal: true,
});
const root = new URL("../", import.meta.url);
const sql = backend.journalFixtureSql;
const stage = (phase) => {
  report.phase = phase;
  console.log("DEV11 " + phase);
};
async function signIn(account) {
  const response = await backend.request("auth", "/token?grant_type=password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.user.id, account.id);
  assert.ok(typeof session.access_token === "string");
  return session.access_token;
}

async function rehearse() {
  await backend.boot();
  assert.equal(report.isolatedMigrationsApplied, 42);
  stage("verify_image_ids_and_baseline");
  const fixture = backend.journalDeliveryFixture();
  report.appSource = journalWebRevision;
  const sources = [];
  const migrations = new URL("supabase/migrations/", root);
  for (const name of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort())
    sources.push({ name, source: await readFile(new URL(name, migrations), "utf8") });
  const source = await readFile(new URL("config/owned-windows/dev11.sql", root), "utf8");
  const assess = () =>
    inspectJournalDeliveryState({ sources, sql, installation: fixture.installation });
  const baseline = await assess();
  assert.equal(baseline.schema, "absent");
  const ordinary = await fixture.services();
  const owner = await backend.createAccount("owner");
  const peer = await backend.createAccount("peer");
  const ownerToken = await signIn(owner);
  const peerToken = await signIn(peer);
  const auth = (token) => ({
    authorization: "Bearer " + token,
    "content-type": "application/json",
  });
  const wines = "/wines?select=wine_name&order=wine_name.asc";
  const save = async (name) => {
    const response = await backend.request("rest", "/wines", {
      method: "POST",
      headers: auth(ownerToken),
      body: JSON.stringify({ user_id: owner.id, wine_name: name, is_public: false }),
    });
    assert.equal(response.status, 201);
  };
  const checkData = async (names) => {
    const list = async (token) => {
      const response = await backend.request("rest", wines, { headers: auth(token) });
      assert.equal(response.status, 200);
      return (await response.json()).map(({ wine_name }) => wine_name);
    };
    assert.deepEqual(await list(ownerToken), names);
    assert.deepEqual(await list(peerToken), []);
  };
  await save("A synthetic before update");
  await checkData(["A synthetic before update"]);
  if (archiveOnly) {
    stage("install_empty_schema_for_ordinary_recovery");
    await sql(journalInstallationTransaction(source, fixture.installation, baseline.ledger));
    assert.equal((await assess()).schema, "dormant");
    stage("restore_ordinary_archive_without_private_schemas");
    report.ordinaryRelationsRestored = await fixture.restoreOrdinaryJournalArchive(owner.id);
    report.ordinaryRestoreWithoutPrivateSchemas = true;
    report.ordinaryAccountErasureAfterRestore = true;
    return;
  }

  const { prior, candidate } = await fixture.images();
  assert.notEqual(prior, candidate);
  report.previousImage = prior;
  report.syntheticCandidateImage = candidate;

  let retained,
    tagged = prior,
    recovery,
    applied = 0;
  const verifyBackend = async () => {
    assert.deepEqual(await fixture.services(), ordinary);
    assert.deepEqual((await assess()).ledger, baseline.ledger);
  };
  const verifyWeb = async (id, label) => {
    const web = await fixture.readWeb();
    assert.equal(web.Image, id);
    assert.equal(web.Config.Labels[journalLabelKey], label);
    assert.equal(web.Config.Labels["winesnap.meal-photo"], mealPhotoWebLabel);
    assert.equal(web.HostConfig.NetworkMode, "none");
    assert.ok(!web.Config.Env.some((entry) => entry.startsWith("WINESNAP_OWNED_DEV11_ENABLED=")));
    assert.equal((await backend.requestWeb("/api/health")).status, 200);
    assert.equal((await backend.requestWeb("/kitchen")).status, 200);
    assert.equal(
      (await backend.requestWeb("/api/meal-photo?id=11111111-1111-4111-8111-111111111111")).status,
      401,
    );
    for (const path of ["/api/dev11/journal", "/api/dev11/export"]) {
      const response = await backend.requestWeb(path, "POST");
      assert.equal(response.status, 404);
      if (label) {
        assert.match(response.headers["cache-control"], /no-store/);
        assert.deepEqual(JSON.parse(response.body), { error: "private_journal_unavailable" });
      }
    }
  };
  const originalId = await fixture.startWeb(prior);
  await verifyWeb(prior);
  const runner = async (mode) =>
    deliverDormantJournal({
      previous: await fixture.readWeb(),
      async guard({ retained: required }) {
        assert.equal(tagged, prior);
        if (required) assert.equal(retained, prior);
        await verifyBackend();
        const state = await assess();
        return {
          ...state,
          transaction: journalInstallationTransaction(source, fixture.installation, state.ledger),
        };
      },
      build: async () => candidate,
      async retain(id) {
        retained = id;
      },
      async apply(transaction) {
        applied++;
        if (mode === "ddl_failure")
          await sql(transaction.replace(/COMMIT;$/, "SELECT 1/0; COMMIT;"));
        else await sql(transaction);
      },
      assess,
      verifyBackend,
      readWeb: fixture.readWeb,
      removeWeb: fixture.removeWeb,
      startWeb: fixture.startWeb,
      async verifyWeb(id, label) {
        await verifyWeb(id, label);
        if (mode === "web_failure" && label === journalDeliveryLabel) {
          await save("B synthetic during update");
          throw new Error("injected_candidate_failure");
        }
      },
      async tagWeb(id) {
        tagged = id;
      },
      stage,
      recovery(state) {
        recovery = state;
      },
    });

  stage("simulate_interrupted_schema_transaction");
  await assert.rejects(runner("ddl_failure"), (error) => error.code === "22012");
  assert.equal(recovery, "previous_web_unchanged");
  assert.equal((await fixture.readWeb()).Id, originalId);
  assert.deepEqual(await assess(), baseline);
  report.interruptedDdlRolledBack = true;

  stage("simulate_failure_after_candidate_started");
  await assert.rejects(runner("web_failure"), /injected_candidate_failure/);
  assert.equal(recovery, "exact_web_fallback_verified");
  const fallback = await fixture.readWeb();
  assert.equal(fallback.Image, prior);
  assert.notEqual(fallback.Id, originalId);
  assert.equal(tagged, prior);
  assert.equal((await assess()).schema, "dormant");
  await checkData(["A synthetic before update", "B synthetic during update"]);
  await verifyBackend();
  report.exactPreviousImageRebooted = true;
  report.inFlightOrdinaryDataSurvived = true;

  stage("reject_drifted_private_role");
  await sql("ALTER ROLE winesnap_dev11_api LOGIN;");
  await assert.rejects(assess(), /login or membership/);
  await sql("ALTER ROLE winesnap_dev11_api NOLOGIN;");
  assert.equal((await assess()).schema, "dormant");
  report.enabledRoleRefused = true;

  stage("retry_with_known_empty_schema");
  assert.equal(await runner("success"), candidate);
  assert.equal(tagged, candidate);
  assert.equal(applied, 2); // One failed transaction, one success; the retry applies nothing.
  assert.equal((await fixture.readWeb()).Config.Labels[journalLabelKey], journalDeliveryLabel);
  await checkData(["A synthetic before update", "B synthetic during update"]);
  await backend.checkJournalArchive(ordinaryJournalExclusions, assertOrdinaryJournalFree);
  report.dormantCandidateBooted = true;
  report.ordinaryDumpExcludedPrivateSchemas = true;
  report.migrationLedgerUnchanged = true;

  stage("rehearse_both_ingress_modes");
  await fixture.checkJournalIngress(ownerToken);
  await verifyBackend();
  report.bothIngressModesDeniedPrivatePaths = true;
}

try {
  await rehearse();
  report.completed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.name : "unknown";
  if (typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code))
    report.failureCode = error.code;
  if (typeof error?.actual === "number") report.actual = error.actual;
  if (typeof error?.expected === "number") report.expected = error.expected;
} finally {
  try {
    report.cleanupCompleted = await backend.close();
  } catch {
    report.cleanupCompleted = false;
  }
}
const output = new URL("dist/private-journal-check/", root);
await mkdir(output, { recursive: true });
await writeFile(
  new URL("delivery-" + report.checkedAt.replace(/[:.]/g, "-") + ".json", output),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (!report.completed || !report.cleanupCompleted) process.exitCode = 1;
