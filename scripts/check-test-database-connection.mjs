import assert from "node:assert/strict";
import { connect } from "node:net";
import { connect as secureConnect, rootCertificates } from "node:tls";
import postgres from "postgres";
import {
  loadTestRootCertificate,
  testDatabaseEndpoints,
  testDatabaseFailure,
  testDatabaseOptions,
  testDatabaseProject,
  validateTestDatabaseInput,
} from "./lib/test-database-connection.mjs";

assert.equal(process.env.WINESNAP_TEST_DATABASE_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.ok(
  process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--network-check"),
);
const networkOnly = process.argv[2] === "--network-check";
const report = {
  project: testDatabaseProject,
  completed: false,
  productionTouched: false,
  readOnly: true,
  authenticationChecked: false,
  fullBackupCreated: false,
};
let phase = "input";
let sql;
let input;

async function checkNetwork(certificate) {
  // PostgreSQL's SSL negotiation only: no startup/authentication message, user
  // password, SQL or API key is sent by this reachability check.
  const host = testDatabaseEndpoints.session.host;
  await new Promise((resolve, reject) => {
    const socket = connect({ host, port: 5432 });
    let tls;
    const fail = (error) => {
      socket.destroy();
      tls?.destroy();
      reject(error);
    };
    socket.setTimeout(10000, () => fail(Object.assign(new Error(), { code: "ETIMEDOUT" })));
    socket.once("error", fail);
    socket.once("connect", () => {
      const message = Buffer.alloc(8);
      message.writeInt32BE(8, 0);
      message.writeInt32BE(80877103, 4);
      socket.write(message);
    });
    socket.once("data", (bytes) => {
      if (bytes.length !== 1 || bytes[0] !== 83) return fail(new Error());
      tls = secureConnect({
        socket,
        servername: host,
        rejectUnauthorized: true,
        ca: [...rootCertificates, certificate],
      });
      tls.once("error", fail);
      tls.once("secureConnect", () => {
        tls.destroy();
        socket.destroy();
        resolve();
      });
    });
  });
}

try {
  if (!networkOnly) {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      assert.ok(size <= 65536);
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    try {
      input = validateTestDatabaseInput(JSON.parse(bytes.toString()));
    } finally {
      bytes.fill(0);
      for (const chunk of chunks) chunk.fill(0);
    }
  }
  phase = "trusted_certificate";
  const certificate = await loadTestRootCertificate();
  if (networkOnly) {
    phase = "network";
    await checkNetwork(certificate);
    report.networkReachable = true;
    report.tlsVerified = true;
  } else {
    phase = "read_only_connection";
    sql = postgres(testDatabaseOptions(input, certificate));
    await sql.begin("READ ONLY", async (transaction) => {
      await transaction`SET LOCAL statement_timeout='10s'`;
      await transaction`SET LOCAL lock_timeout='2s'`;
      const [identity] = await transaction`SELECT current_database() AS database,
        current_user AS role,current_setting('transaction_read_only') AS readonly,
        current_setting('server_version_num')::integer AS version`;
      assert.equal(identity.database, "postgres");
      assert.equal(identity.role, "postgres");
      assert.equal(identity.readonly, "on");
      phase = "schema_and_backup_permissions";
      const [access] = await transaction`SELECT
        has_table_privilege(current_user,'auth.users','SELECT') AS auth,
        has_table_privilege(current_user,'auth.identities','SELECT') AS identities,
        has_table_privilege(current_user,'storage.objects','SELECT') AS storage,
        has_table_privilege(current_user,'public.privacy_erasure_receipts','SELECT') AS erasures,
        (SELECT count(*)::integer FROM pg_tables WHERE schemaname='public') AS tables,
        (SELECT count(*)::integer FROM supabase_migrations.schema_migrations
          WHERE version IN ('20261013180000','20261025090000')) AS migrations`;
      assert.ok(access.auth && access.identities && access.storage && access.erasures);
      assert.ok(access.tables >= 35);
      assert.equal(access.migrations, 2);
      report.serverMajor = Math.floor(identity.version / 10000);
      report.applicationTables = access.tables;
      report.authStorageErasureReadAccess = true;
      report.authenticationChecked = true;
      report.tlsVerified = true;
    });
  }
  report.completed = true;
} catch (error) {
  report.failure = testDatabaseFailure(error, phase);
  report.phase = phase;
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 2 }).catch(() => {});
  if (input) input.password = "";
  console.log(JSON.stringify({ ...report, checkedAt: new Date().toISOString() }));
}
