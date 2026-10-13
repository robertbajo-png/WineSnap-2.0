import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// No connection URL or archive is accepted. This always creates its own local
// cluster, synthetic users and SQL snapshots; it cannot target production.
const dependencyRoot = resolve(process.argv[2] ?? ".");
const require = createRequire(join(dependencyRoot, "package.json"));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(require.resolve("embedded-postgres"))
);
const { Client } = require("pg");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "winesnap-privacy-recovery-"));
const listener = createServer();
await new Promise((done) => listener.listen(0, "127.0.0.1", done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const password = randomUUID();
const config = { host: "127.0.0.1", port, user: "postgres", password };
const cluster = new EmbeddedPostgres({
  databaseDir: join(directory, "data"),
  port,
  user: "postgres",
  password,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  initdbFlags: ["--encoding=UTF8"],
  onLog: () => {},
  onError: () => {},
});
const admin = new Client({ ...config, database: "postgres" });
const source = new Client({ ...config, database: "privacy_source" });
const restored = new Client({ ...config, database: "privacy_restored" });
let started = false;
let adminConnected = false;
let sourceConnected = false;
let restoredConnected = false;
let stage = "initialise";
try {
  await cluster.initialise();
  await cluster.start();
  started = true;
  await admin.connect();
  adminConnected = true;
  await admin.query("CREATE DATABASE privacy_source");
  await source.connect();
  sourceConnected = true;
  await source.query(await readFile(join(root, "supabase/tests/bootstrap.local.sql"), "utf8"));
  const migrations = (await readdir(join(root, "supabase/migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    stage = file;
    await source.query(await readFile(join(root, "supabase/migrations", file), "utf8"));
  }

  stage = "synthetic-fixtures";
  const owner = randomUUID();
  const peer = randomUUID();
  const ownerWine = randomUUID();
  const peerWine = randomUUID();
  for (const [id, email] of [
    [owner, "recovery-owner@example.test"],
    [peer, "recovery-peer@example.test"],
  ]) {
    await source.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [id, email]);
  }
  for (const [id, user, share] of [
    [ownerWine, owner, "erased+legacy/id"],
    [peerWine, peer, "kept+legacy/id"],
  ]) {
    await source.query(
      "INSERT INTO wines(id,user_id,wine_name,is_public,share_id,image_url) VALUES($1,$2,'Synthetic wine',true,$3,$4)",
      [id, user, share, `${user}/label.jpg`],
    );
    await source.query(
      "INSERT INTO wine_photos(wine_id,user_id,url,storage_path) VALUES($1,$2,$3,$3)",
      [id, user, `${user}/label.jpg`],
    );
    await source.query(
      "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('wine-labels',$1,$2)",
      [`${user}/label.jpg`, user],
    );
  }
  await source.query("UPDATE profiles SET is_public=true WHERE id IN ($1,$2)", [owner, peer]);
  const peerBefore = (await source.query("SELECT * FROM wines WHERE id=$1", [peerWine])).rows[0];

  stage = "pre-erasure-snapshot";
  // PostgreSQL template cloning copies real schema, rows, grants and RLS. This
  // exercises database recovery, not hosted backup files or physical Storage.
  await source.end();
  sourceConnected = false;
  await admin.query("CREATE DATABASE privacy_snapshot TEMPLATE privacy_source");
  const current = new Client({ ...config, database: "privacy_source" });
  try {
    await current.connect();
    stage = "erase-synthetic-owner";
    await current.query("SELECT request_account_erasure($1)", [owner]);
    // Mock Storage API deletion for local platform-contract rows only.
    await current.query("DELETE FROM storage.objects WHERE owner_id=$1", [owner]);
    await current.query("DELETE FROM wine_photos WHERE user_id=$1", [owner]);
    await current.query("DELETE FROM auth.users WHERE id=$1", [owner]);
    await current.query("UPDATE privacy_erasure_receipts SET completed_at=now() WHERE user_id=$1", [
      owner,
    ]);
    const receipts = (
      await current.query("SELECT user_id,requested_at,completed_at FROM privacy_erasure_receipts")
    ).rows;
    await writeFile(join(directory, "synthetic-erasure-ledger.json"), JSON.stringify(receipts));
    assert.equal(
      (await current.query("SELECT id FROM auth.users WHERE id=$1", [owner])).rowCount,
      0,
    );
  } finally {
    await current.end();
  }

  stage = "restore-old-snapshot";
  await admin.query("CREATE DATABASE privacy_restored TEMPLATE privacy_snapshot");
  await restored.connect();
  restoredConnected = true;
  assert.equal(
    (await restored.query("SELECT privacy_account_active($1) AS active", [owner])).rows[0].active,
    true,
    "Old backup must demonstrably predate the erasure receipt",
  );

  stage = "import-independent-ledger";
  const receipts = JSON.parse(
    await readFile(join(directory, "synthetic-erasure-ledger.json"), "utf8"),
  );
  for (const receipt of receipts) {
    await restored.query(
      "INSERT INTO privacy_erasure_receipts(user_id,requested_at,completed_at) VALUES($1,$2,$3)",
      [receipt.user_id, receipt.requested_at, receipt.completed_at],
    );
  }
  await restored.query(
    await readFile(join(root, "supabase/operations/reapply-restored-erasures.sql"), "utf8"),
  );
  assert.equal(
    (await restored.query("SELECT privacy_account_active($1) AS active", [owner])).rows[0].active,
    false,
  );
  assert.equal(
    (await restored.query("SELECT user_id FROM account_erasure_jobs WHERE user_id=$1", [owner]))
      .rowCount,
    1,
  );
  assert.equal(
    (await restored.query("SELECT is_public FROM wines WHERE id=$1", [ownerWine])).rows[0]
      .is_public,
    false,
  );
  assert.equal(
    (await restored.query("SELECT is_public FROM profiles WHERE id=$1", [owner])).rows[0].is_public,
    false,
  );
  assert.deepEqual(
    (await restored.query("SELECT * FROM wines WHERE id=$1", [peerWine])).rows[0],
    peerBefore,
  );
  assert.equal(
    (await restored.query("SELECT id FROM storage.objects WHERE owner_id=$1", [peer])).rowCount,
    1,
  );

  stage = "stale-jwt-and-public-read-guards";
  await restored.query("BEGIN");
  await restored.query("SET LOCAL ROLE authenticated");
  await restored.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
  assert.equal((await restored.query("SELECT id FROM wines")).rowCount, 0);
  await restored.query("ROLLBACK");
  await restored.query("BEGIN");
  await restored.query("SET LOCAL ROLE anon");
  assert.equal((await restored.query("SELECT id FROM wines WHERE id=$1", [ownerWine])).rowCount, 0);
  assert.equal((await restored.query("SELECT id FROM wines WHERE id=$1", [peerWine])).rowCount, 1);
  assert.equal(
    (await restored.query("SELECT id FROM storage.objects WHERE name=$1", [`${owner}/label.jpg`]))
      .rowCount,
    0,
  );
  await restored.query("ROLLBACK");

  stage = "idempotent-reapplication-and-erasure";
  await restored.query(
    await readFile(join(root, "supabase/operations/reapply-restored-erasures.sql"), "utf8"),
  );
  assert.equal(
    (await restored.query("SELECT count(*)::int AS count FROM account_erasure_jobs")).rows[0].count,
    1,
  );
  await restored.query("DELETE FROM storage.objects WHERE owner_id=$1", [owner]);
  await restored.query("DELETE FROM wine_photos WHERE user_id=$1", [owner]);
  await restored.query("DELETE FROM auth.users WHERE id=$1", [owner]);
  await restored.query("SELECT run_privacy_retention(true)");
  assert.equal(
    (await restored.query("SELECT id FROM wines WHERE user_id=$1", [owner])).rowCount,
    0,
  );
  assert.equal(
    (
      await restored.query("SELECT completed_at FROM privacy_erasure_receipts WHERE user_id=$1", [
        owner,
      ])
    ).rows[0].completed_at instanceof Date,
    true,
  );
  assert.deepEqual(
    (await restored.query("SELECT * FROM wines WHERE id=$1", [peerWine])).rows[0],
    peerBefore,
  );
  console.log(
    JSON.stringify({
      migrations: migrations.length,
      staleBackupReproduced: true,
      separateLedgerReapplied: true,
      restoredOwnerBlocked: true,
      publicSharesBlocked: true,
      peerDataUnchanged: true,
      repeatErasureCompleted: true,
      scope:
        "Synthetic local PostgreSQL snapshot clone; not hosted Auth JWT, Storage HTTP or backup infrastructure",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({ recoveryFailed: true, stage, code: error.code ?? "assertion_or_runtime" }),
  );
  process.exitCode = 1;
} finally {
  if (restoredConnected) await restored.end();
  if (sourceConnected) await source.end();
  if (adminConnected) await admin.end();
  if (started) await cluster.stop();
}
