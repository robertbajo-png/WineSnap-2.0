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
      scope: "local PostgreSQL, not hosted JWT or Storage HTTP",
    }),
  );
} finally {
  if (connected) await db.end();
  if (started) await cluster.stop();
}
