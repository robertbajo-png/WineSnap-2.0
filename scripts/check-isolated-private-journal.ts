import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createJournalHandler,
  journalProofHeader,
} from "../src/features/private-journal/handler.server";
import type { JournalCommand, JournalState, Reading } from "../src/features/private-journal/domain";
import { isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import {
  assertOrdinaryJournalFree,
  openJournalArchive,
  ordinaryJournalExclusions,
  sealJournalArchive,
} from "./lib/owned-dev11-archive.mjs";
import { verifyPrivateJournalBrowser } from "./lib/private-journal-browser.mjs";
import { verifyWindowsVault } from "./lib/private-journal-vault-fixture.mjs";
import { createOwnedJournalOperator } from "./lib/owned-private-journal-operator.mjs";

const mode = process.argv[2];
assert.ok(
  process.argv.length <= 3 &&
    [undefined, "--browser", "--browser-only", "--windows-storage", "--retention-browser"].includes(
      mode,
    ),
);
const windowsStorage = mode === "--windows-storage" || mode === "--retention-browser";

const evidence: Record<string, boolean | number | string | undefined> = {
  synthetic: true,
  productionTouched: false,
  installedAppTouched: false,
  completed: false,
  cleanupCompleted: false,
  phase: "boot",
};
const backend = isolatedPlanningBackend(evidence, { meals: true, privateJournal: true });
const proof = randomBytes(32).toString("hex");
const sql = backend.journalFixtureSql;
const literal = (text: string | null) =>
  text === null ? "NULL" : "'" + text.replaceAll("'", "''") + "'";
const json = (value: unknown) => literal(JSON.stringify(value)) + "::jsonb";
const bounded = async (source: string) =>
  sql("SET ROLE winesnap_dev11_api;\n" + source + "\nRESET ROLE;");
const result = async (text: string) => JSON.parse(await sql(text));
const auth = (token: string) => ({ authorization: "Bearer " + token });
const at = (daysAgo = 0) =>
  new Date(Date.now() - daysAgo * 86_400_000 - 3000).toISOString().replace(/\.\d{3}Z$/, "Z");

async function accept() {
  await backend.boot();
  evidence.phase = "synthetic_auth";
  const owner = await backend.createAccount("owner");
  const peer = await backend.createAccount("peer");
  const signIn = async (account: typeof owner) => {
    const response = await backend.request("auth", "/token?grant_type=password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.equal(session.user.id, account.id);
    assert.equal(typeof session.access_token, "string");
    return session.access_token as string;
  };
  const token = await signIn(owner);
  const peerToken = await signIn(peer);
  const id = literal(owner.id);
  evidence.phase = "owned_only_schema";
  await sql(await readFile(new URL("../config/owned-windows/dev11.sql", import.meta.url), "utf8"));
  await sql(`INSERT INTO winesnap_dev11_control.account(owner) VALUES (${id});`);
  let beforeConfirm: (() => Promise<unknown>) | undefined;
  let useOperations = false;
  const handler = createJournalHandler({
    proof,
    ownerForToken: async (jwt) => {
      const response = await backend.request("auth", "/user", { headers: auth(jwt) });
      return response.ok ? (await response.json()).id : undefined;
    },
    command: async (user, input) =>
      JSON.parse(
        await bounded(
          `SELECT winesnap_dev11_control.${useOperations ? "guarded_command" : "command"}(${literal(user)},${json(input)});`,
        ),
      ),
    confirm: async (user, stamp, expiresAt) => {
      const intercept = beforeConfirm;
      beforeConfirm = undefined;
      await intercept?.();
      return (
        (await bounded(
          `SELECT winesnap_dev11_control.${useOperations ? "guarded_confirm" : "confirm"}(${literal(user)},${literal(stamp)},${literal(expiresAt)});`,
        )) === "t"
      );
    },
  });
  const call = async (
    body: unknown,
    { account = token, trusted = true, path = "journal", status = 200 } = {},
  ): Promise<Response> => {
    const headers = new Headers({ "content-type": "application/json" });
    if (account) headers.set("authorization", "Bearer " + account);
    if (trusted) headers.set(journalProofHeader, proof);
    const response = await handler(
      new Request("http://127.0.0.1/api/dev11/" + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    return response;
  };
  const command = async (input: JournalCommand): Promise<JournalState> =>
    (await (await call(input)).json()).state;
  await call({ action: "read" }, { trusted: false, status: 404 });
  await call({ action: "read" }, { account: "", status: 401 });
  await call({ action: "read" }, { status: 403 });
  await sql("INSERT INTO winesnap_dev11_control.installation DEFAULT VALUES;");
  await call({ action: "read" }, { account: peerToken, status: 403 });
  await call({ action: "read", owner: peer.id }, { status: 400 });
  for (const jwt of [backend.anon, token, peerToken, backend.serviceRole]) {
    const blocked = await backend.request("rest", "/reading", {
      headers: { ...auth(jwt), "accept-profile": "winesnap_dev11_data" },
    });
    assert.equal(blocked.status, 406);
  }
  assert.equal(
    await sql(`SELECT has_schema_privilege('authenticated','winesnap_dev11_control','USAGE')
    OR has_schema_privilege('service_role','winesnap_dev11_data','USAGE')
    OR has_function_privilege('winesnap_dev11_api','winesnap_dev11_control.capture(uuid)','EXECUTE');`),
    "f",
  );
  evidence.isolationPassed = true;
  if (mode === "--browser-only") {
    await verifyPrivateJournalBrowser({ backend, owner, peer, handler, proof, report: evidence });
    return;
  }

  evidence.phase = "consent_and_measurements";
  let state = await command({ action: "read" });
  assert.equal(state.goalChoice.enabled || state.readingsChoice.enabled, false);
  await call(
    {
      action: "setGoal",
      revision: state.goalChoice.revision,
      goal: { grams: "41.5", period: "day" },
    },
    { status: 409 },
  );
  state = await command({
    action: "enable",
    feature: "goal",
    revision: state.goalChoice.revision,
    notice: 1,
  });
  assert.equal(state.readingsChoice.enabled, false);
  state = await command({
    action: "setGoal",
    revision: state.goalChoice.revision,
    goal: { grams: "41.5", period: "day" },
  });
  state = await command({
    action: "enable",
    feature: "readings",
    revision: state.readingsChoice.revision,
    notice: 1,
  });
  const version = state.readingsChoice.revision;
  const blood: Reading = { method: "blood", unit: "mmol/L", value: "1.20", at: at() };
  const breath: Reading = { method: "breath", unit: "ppm", value: "21.5", at: at(2) };
  const urine: Reading = {
    method: "urine",
    unit: "category",
    scale: "ketostix-acetoacetate",
    value: "trace",
    at: at(3),
  };
  for (const input of [
    { ...blood, unit: "ppm" },
    { ...blood, at: at(91) },
    { ...blood, at: "2026-10-25T02:30:00" },
    { ...blood, value: "HI" },
    { ...urine, value: "0" },
    { ...urine, scale: "unknown" },
  ])
    await call({ action: "addReading", revision: version, reading: input }, { status: 400 });
  for (const reading of [blood, breath, urine])
    state = await command({ action: "addReading", revision: version, reading });
  assert.deepEqual(
    state.readings.map((entry) => entry.reading),
    [blood, breath, urine],
  );
  const exported = await call(
    {
      action: "export",
      goalRevision: state.goalChoice.revision,
      readingsRevision: version,
    },
    { path: "export" },
  );
  assert.match(exported.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.deepEqual(
    (await exported.json()).readings.map((entry: { reading: Reading }) => entry.reading),
    [blood, breath, urine],
  );
  evidence.independentConsentAndExportPassed = true;

  evidence.phase = "inspect_actual_postgres_archives";
  await backend.checkJournalArchive([], (list: string) =>
    assert.throws(() => assertOrdinaryJournalFree(list), /Private journal/),
  );
  await backend.checkJournalArchive(ordinaryJournalExclusions, (list: string) =>
    assertOrdinaryJournalFree(list),
  );
  evidence.ordinaryDumpExcludedAllPrivateSchemas = true;

  evidence.phase = "recover_without_resurrection";
  const [first, second, third] = state.readings;
  const prepareSelectiveRestore = async () => {
    await command({
      action: "deleteReading",
      revision: version,
      id: first.id,
      entryRevision: first.revision,
    });
    await command({
      action: "editReading",
      revision: version,
      id: second.id,
      entryRevision: second.revision,
      reading: { ...breath, value: "22" },
    });
    await sql(`DELETE FROM winesnap_dev11_data.reading WHERE owner = ${id};`);
  };
  let archive: Record<string, unknown> | undefined;
  let operator: ReturnType<typeof createOwnedJournalOperator> | undefined;
  const restore = (snapshot = archive) =>
    result(`SELECT winesnap_dev11_control.restore(${id},${json(snapshot)});`);
  const captureSql = `SELECT winesnap_dev11_control.capture(${id});`;
  const checkPaused = async () => {
    const payload = await (await call({ action: "read" })).json();
    assert.equal(payload.maintenancePaused, true);
    assert.equal(payload.validUntil, null);
    assert.deepEqual([payload.state.goal, payload.state.readings], [null, []]);
    return payload.state as JournalState;
  };
  if (windowsStorage) {
    evidence.phase = "windows_storage";
    useOperations = true;
    await call({ action: "read" }, { status: 503 });
    useOperations = false;
    const seeded = await command({
      action: "addReading",
      revision: version,
      reading: { ...blood, value: "9.87", at: at(4) },
    });
    const expiring = seeded.readings.find((entry) => entry.reading.value === "9.87");
    assert.ok(expiring);
    await sql(
      await readFile(
        new URL("../config/owned-windows/dev11-operations.sql", import.meta.url),
        "utf8",
      ),
    );
    useOperations = true;
    const backendId = await sql("SELECT id FROM winesnap_local.installation;");
    const installation = await sql("SELECT identity FROM winesnap_dev11_control.installation;");
    const configured = createOwnedJournalOperator({
      execute: sql,
      backendId,
      journalId: installation,
    });
    operator = configured;
    const denied = createOwnedJournalOperator({
      execute: sql,
      backendId: randomBytes(16).toString("hex"),
      journalId: installation,
    });
    assert.equal(await denied.begin(), null);
    await checkPaused();
    await call({ action: "addReading", revision: version, reading: blood }, { status: 403 });
    assert.equal(
      await sql(`SELECT
      has_function_privilege('winesnap_dev11_api','winesnap_dev11_control.command(uuid,jsonb)','EXECUTE') OR
      has_function_privilege('winesnap_dev11_api','winesnap_dev11_control.confirm(uuid,uuid,timestamptz)','EXECUTE') OR
      has_function_privilege('winesnap_dev11_api','winesnap_dev11_control.maintenance_pass(uuid,uuid)','EXECUTE') OR
      has_table_privilege('winesnap_dev11_api','winesnap_dev11_control.maintenance','SELECT');`),
      "f",
    );
    const interrupted = await configured.begin();
    assert.ok(interrupted);
    assert.equal(await configured.begin(), null);
    assert.equal(await denied.pass(interrupted), false);
    await assert.rejects(denied.prune(interrupted));
    await sql(
      "UPDATE winesnap_dev11_control.maintenance SET started_at = clock_timestamp() - interval '6 minutes';",
    );
    assert.equal(await configured.pass(interrupted), false);
    await checkPaused();
    await sql(`UPDATE winesnap_dev11_control.reading_permit
       SET expires_at = statement_timestamp() - interval '1 second'
       WHERE id = ${literal(expiring.id)};`);
    let recoveryAttempt: string | null = null;
    await verifyWindowsVault({
      installation,
      operator: configured,
      onCapturedSnapshot: (document: string) => {
        archive = JSON.parse(document);
      },
      captured: async () => {
        assert.deepEqual(
          (await command({ action: "read" })).readings.map(({ id }) => id),
          [first.id, second.id, third.id],
        );
        await prepareSelectiveRestore();
        recoveryAttempt = await configured.begin();
        assert.ok(recoveryAttempt);
        await checkPaused();
      },
      restore: (bytes: Buffer) => configured.restore(recoveryAttempt, bytes),
      report: evidence,
    });
    assert.equal(
      await sql(
        `SELECT count(*) FROM winesnap_dev11_control.reading_permit WHERE id = ${literal(expiring.id)};`,
      ),
      "0",
    );
    // The recovery path is still dark; reopening below is a synthetic completion only.
    await checkPaused();
    assert.ok(recoveryAttempt && (await configured.pass(recoveryAttempt)));
    evidence.boundMaintenanceAndExpiredAttemptPassed = true;
  } else {
    const snapshot = await result(captureSql);
    const key = randomBytes(32);
    try {
      const sealed = sealJournalArchive(snapshot, key, snapshot.installation);
      archive = openJournalArchive(sealed, key, snapshot.installation);
    } finally {
      key.fill(0);
    }
    await prepareSelectiveRestore();
    assert.deepEqual(await restore(), { status: 200, goals: 0, readings: 1 });
  }
  assert.ok(archive);
  evidence.phase = "recover_without_resurrection";
  assert.deepEqual(await restore(), { status: 200, goals: 0, readings: 0 });
  assert.deepEqual(
    (await command({ action: "read" })).readings.map((entry) => entry.id),
    [third.id],
  );
  assert.equal((await restore({ ...archive, capturedAt: at(8) })).status, 400);
  // Probe missing live evidence in one disposable transaction.
  assert.equal(
    await sql(`BEGIN; DELETE FROM winesnap_dev11_control.installation;
    SELECT (winesnap_dev11_control.restore(${id},${json(archive)})->>'status'); ROLLBACK;`),
    "403",
  );
  await sql(
    `UPDATE winesnap_dev11_control.reading_permit SET expires_at = statement_timestamp() - interval '1 second';`,
  );
  assert.equal(await sql("SELECT winesnap_dev11_control.prune();"), "2");
  assert.deepEqual(await restore(), { status: 200, goals: 0, readings: 0 });
  state = await command({ action: "disable", feature: "readings", revision: version });
  assert.deepEqual(state.readings, []);
  assert.equal(state.goal?.period, "day");
  await call({ action: "addReading", revision: version, reading: blood }, { status: 409 });
  state = await command({
    action: "enable",
    feature: "readings",
    revision: state.readingsChoice.revision,
    notice: 1,
  });
  assert.deepEqual(await restore(), { status: 200, goals: 0, readings: 0 });
  assert.deepEqual(state.readings, []);
  evidence.withdrawalExpiryAndRestorePassed = true;

  evidence.phase = "late_export_after_revoke";
  beforeConfirm = () =>
    command({
      action: "disable",
      feature: "readings",
      revision: state.readingsChoice.revision,
    });
  const late = await call(
    {
      action: "export",
      goalRevision: state.goalChoice.revision,
      readingsRevision: state.readingsChoice.revision,
    },
    { path: "export", status: 409 },
  );
  assert.equal(late.headers.has("content-disposition"), false);
  evidence.lateExportRefused = true;
  state = await command({ action: "read" });
  if (operator) {
    evidence.phase = "maintenance_release_and_stale";
    const configured = operator;
    let failedDuringRelease: string | null = null;
    beforeConfirm = async () => {
      failedDuringRelease = await configured.begin();
      assert.ok(failedDuringRelease);
    };
    const exportInput = {
      action: "export",
      goalRevision: state.goalChoice.revision,
      readingsRevision: state.readingsChoice.revision,
    };
    const refused = await call(exportInput, { path: "export", status: 409 });
    assert.equal(refused.headers.has("content-disposition"), false);
    assert.ok(failedDuringRelease && (await configured.pass(failedDuringRelease)));
    await sql(
      "UPDATE winesnap_dev11_control.maintenance SET checked_at = clock_timestamp() - interval '75 minutes';",
    );
    const paused = await checkPaused();
    assert.equal(paused.goalChoice.enabled, true);
    await call(exportInput, { path: "export", status: 403 });
    const disabled = await (
      await call({ action: "disable", feature: "goal", revision: paused.goalChoice.revision })
    ).json();
    assert.equal(disabled.maintenancePaused, true);
    assert.equal(disabled.state.goalChoice.enabled, false);
    assert.equal(await sql("SELECT count(*) FROM winesnap_dev11_data.goal;"), "0");
    const retry = await configured.begin();
    assert.ok(retry && (await configured.pass(retry)));
    evidence.maintenanceLateReleaseAndWithdrawalPassed = true;
    state = await command({ action: "read" });
  }
  if (mode === "--browser" || mode === "--retention-browser") {
    if (state.goalChoice.enabled)
      state = await command({
        action: "disable",
        feature: "goal",
        revision: state.goalChoice.revision,
      });
    let afterBrowserPause: string | null = null;
    const pauseMaintenance = operator
      ? async () => {
          afterBrowserPause = await operator.begin();
          assert.ok(afterBrowserPause);
        }
      : undefined;
    await verifyPrivateJournalBrowser({
      backend,
      owner,
      peer,
      handler,
      proof,
      report: evidence,
      pauseMaintenance,
    });
    if (operator) assert.ok(afterBrowserPause && (await operator.pass(afterBrowserPause)));
    state = await command({ action: "read" });
  }

  evidence.phase = "whole_account_erasure";
  state = await command({
    action: "enable",
    feature: "readings",
    revision: state.readingsChoice.revision,
    notice: 1,
  });
  await command({ action: "addReading", revision: state.readingsChoice.revision, reading: blood });
  await sql(`SELECT public.request_account_erasure(${id});`);
  await call({ action: "read" }, { status: 403 });
  assert.equal((await restore()).status, 403);
  assert.equal(await sql(`SELECT count(*) FROM winesnap_dev11_control.account;`), "0");
  assert.equal(await sql(`SELECT count(*) FROM winesnap_dev11_data.reading;`), "0");
  assert.equal(await sql(`SELECT count(*) FROM winesnap_dev11_data.goal;`), "0");
  evidence.accountErasurePassed = true;
}

try {
  await accept();
  evidence.completed = true;
} catch (problem) {
  evidence.failure = problem instanceof Error ? problem.name : "unknown";
  if (problem && typeof problem === "object") {
    if ("actual" in problem && typeof problem.actual === "number") evidence.actual = problem.actual;
    if ("expected" in problem && typeof problem.expected === "number")
      evidence.expected = problem.expected;
  }
  if (
    problem &&
    typeof problem === "object" &&
    "code" in problem &&
    typeof problem.code === "string"
  )
    evidence.safeErrorCode = /^[A-Z0-9_]+$/.test(problem.code) ? problem.code : undefined;
  process.exitCode = 1;
} finally {
  evidence.cleanupCompleted = await backend.close();
  if (!evidence.cleanupCompleted) process.exitCode = 1;
  console.log(JSON.stringify(evidence, null, 2));
}
