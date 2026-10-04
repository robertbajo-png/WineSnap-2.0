import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Optional dependency root allows reuse of an installed local PostgreSQL runtime.
const dependencyRoot = resolve(process.argv[2] ?? ".");
const dependencyRequire = createRequire(join(dependencyRoot, "package.json"));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(dependencyRequire.resolve("embedded-postgres")).href
);
const { Client } = dependencyRequire("pg");
const root = fileURLToPath(new URL("../", import.meta.url));
const databaseDir = await mkdtemp(join(tmpdir(), "winesnap-release-rehearsal-"));
const listener = createServer();
await new Promise((done) => listener.listen(0, "127.0.0.1", done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const password = randomUUID();
const cluster = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  initdbFlags: ["--encoding=UTF8"],
  onLog: () => {},
  onError: (error) => console.error(error),
});
const db = new Client({
  host: "127.0.0.1",
  port,
  user: "postgres",
  password,
  database: "postgres",
});
let started = false;
let connected = false;
try {
  await cluster.initialise();
  await cluster.start();
  started = true;
  await db.connect();
  connected = true;
  await db.query(await readFile(join(root, "supabase/tests/bootstrap.local.sql"), "utf8"));
  const directory = join(root, "supabase/migrations");
  const migrations = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of migrations.filter((name) => name < "20260923")) {
    await db.query(await readFile(join(directory, file), "utf8"));
  }

  const owner = randomUUID();
  const stranger = randomUUID();
  const wine = randomUUID();
  const oldShare = "legacy+share/id";
  const imagePath = `${owner}/legacy.jpg`;
  for (const id of [owner, stranger]) {
    await db.query("INSERT INTO auth.users (id,email) VALUES ($1,$2)", [id, `${id}@example.test`]);
  }
  await db.query(
    "INSERT INTO public.wines (id,user_id,wine_name,is_public,share_id,image_url) VALUES ($1,$2,'Legacy wine',true,$3,$4)",
    [
      wine,
      owner,
      oldShare,
      `https://example.test/storage/v1/object/public/wine-labels/${imagePath}`,
    ],
  );
  for (const file of migrations.filter((name) => name >= "20260923")) {
    await db.query(await readFile(join(directory, file), "utf8"));
    console.log(`Migration passed: ${file}`);
  }
  const invariants = (await readdir(join(root, "supabase/tests")))
    .filter((name) => /^step\d.*\.sql$/.test(name))
    .sort();
  for (const file of invariants) {
    await db.query(await readFile(join(root, "supabase/tests", file), "utf8"));
    console.log(`Invariant checks passed: ${file}`);
  }

  assert.equal(
    (await db.query("SELECT share_id FROM public.wines WHERE id=$1", [wine])).rows[0].share_id,
    oldShare,
  );
  assert.equal(
    (await db.query("SELECT storage_path FROM public.wine_photos WHERE wine_id=$1", [wine])).rows[0]
      .storage_path,
    imagePath,
  );

  async function asUser(id, sql, values = []) {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL ROLE authenticated");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
      const result = await db.query(sql, values);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
  const scan = await asUser(
    owner,
    "INSERT INTO public.restaurant_scans (user_id,constraints,extracted_wines) VALUES ($1,$2,$3) RETURNING id",
    [owner, { dish: "fish", maxPrice: 800 }, JSON.stringify([{ wine_name: "Riesling" }])],
  );
  const scanId = scan.rows[0].id;
  assert.equal(
    (await asUser(owner, "SELECT id FROM restaurant_scans WHERE id=$1", [scanId])).rowCount,
    1,
  );
  assert.equal(
    (await asUser(stranger, "SELECT id FROM restaurant_scans WHERE id=$1", [scanId])).rowCount,
    0,
  );
  await assert.rejects(
    asUser(stranger, "INSERT INTO restaurant_scans (user_id) VALUES ($1)", [owner]),
    /row-level security/,
  );
  await asUser(
    owner,
    "INSERT INTO recommendation_events (user_id,candidate_key,event_type,source,candidate) VALUES ($1,'test|riesling','like','restaurant',$2)",
    [owner, { wine_name: "Riesling", grape_varieties: ["Riesling"], wine_type: "white" }],
  );
  await asUser(owner, "UPDATE wines SET quantity=4 WHERE id=$1", [wine]);
  const acquisitionSql = `INSERT INTO collector_lots
    (user_id,wine_id,purpose,purchased_at,quantity,remaining,bottle_ml,unit_cost,currency)
    VALUES ($1,$2,'invest','2026-10-04',2,2,750,100,'SEK') RETURNING id`;
  const acquisition = await asUser(owner, acquisitionSql, [owner, wine]);
  const lotId = acquisition.rows[0].id;
  await assert.rejects(
    asUser(owner, "UPDATE collector_lots SET unit_cost='NaN'::numeric WHERE id=$1", [lotId]),
    /check constraint/,
  );
  await asUser(
    owner,
    `UPDATE collector_lots SET estimate_price=150,estimate_currency='SEK',
    estimate_date='2026-10-04',estimate_source='Synthetic test quote',estimate_confidence='low' WHERE id=$1`,
    [lotId],
  );
  assert.equal(
    (await asUser(owner, "SELECT id FROM collector_lots WHERE id=$1", [lotId])).rowCount,
    1,
  );
  assert.equal(
    (await asUser(stranger, "SELECT id FROM collector_lots WHERE id=$1", [lotId])).rowCount,
    0,
  );
  assert.equal(
    (
      await asUser(stranger, "UPDATE collector_lots SET remaining=0 WHERE id=$1 RETURNING id", [
        lotId,
      ])
    ).rowCount,
    0,
  );
  await assert.rejects(
    asUser(stranger, acquisitionSql, [owner, wine]),
    /row-level security|Wine not available/,
  );
  await assert.rejects(asUser(stranger, acquisitionSql, [stranger, wine]), /Wine not available/);
  await assert.rejects(
    asUser(owner, "UPDATE collector_lots SET user_id=$1 WHERE id=$2", [stranger, lotId]),
    /identity cannot change/,
  );
  await assert.rejects(
    asUser(owner, "UPDATE collector_lots SET estimate_date=NULL WHERE id=$1", [lotId]),
    /check constraint/,
  );
  await assert.rejects(
    asUser(owner, "UPDATE collector_lots SET remaining=5 WHERE id=$1", [lotId]),
    /exceeds cellar stock|check constraint/,
  );
  await assert.rejects(
    asUser(owner, "UPDATE wines SET quantity=1 WHERE id=$1", [wine]),
    /Reduce collector allocations/,
  );
  await assert.rejects(
    asUser(owner, "UPDATE wines SET consumed_at=now() WHERE id=$1", [wine]),
    /Reduce collector allocations/,
  );
  await asUser(owner, "UPDATE collector_lots SET remaining=0 WHERE id=$1", [lotId]);
  await asUser(owner, "UPDATE wines SET quantity=2 WHERE id=$1", [wine]);

  // Both writers target the same stock; only one allocation may commit.
  const clients = [new Client(db.connectionParameters), new Client(db.connectionParameters)];
  try {
    for (const client of clients) {
      await client.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
    }
    await clients[0].query(acquisitionSql, [owner, wine]);
    const competing = clients[1].query(acquisitionSql, [owner, wine]).then(
      () => null,
      (error) => error,
    );
    await clients[0].query("COMMIT");
    const rejected = await competing;
    assert.match(rejected?.message ?? "", /exceeds cellar stock/);
    await clients[1].query("ROLLBACK");
  } finally {
    for (const client of clients) await client.end();
  }
  console.log(
    "Collector owner isolation, validation, stock guards and concurrent allocation passed",
  );
  assert.ok(
    (
      await db.query(
        "SELECT id FROM taste_signals WHERE user_id=$1 AND source='recommendation_feedback'",
        [owner],
      )
    ).rowCount > 0,
  );
  console.log(
    JSON.stringify({
      migrations: migrations.length,
      invariantFiles: invariants.length,
      ownerIsolation: "passed",
      legacyShareAndImage: "passed",
      restaurantFeedback: "passed",
      collectorLots: "passed",
      scope: "local PostgreSQL, not hosted JWT or Storage HTTP",
    }),
  );
} finally {
  if (connected) await db.end();
  if (started) await cluster.stop();
}
