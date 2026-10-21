import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertFreshCluster,
  ciDatabaseTarget,
  localIoFlags,
  sqlInventory,
} from "./lib/database-checks.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const reportPath = resolve(root, "dist/staging-database-check.json");
let cluster;
let directory;
let started = false;
let admin;
let db;
let created = false;
let stage = "target-guard";
let report;
const name = `winesnap_check_${randomUUID().replaceAll("-", "")}`;
try {
  let target;
  let driverRoot = root;
  if (args[0] === "--embedded") {
    assert(
      args.length === 2 || (args.length === 4 && args[2] === "--driver"),
      "Use --embedded <dependency-root> [--driver <client-dependency-root>]",
    );
    const require = createRequire(resolve(args[1], "package.json"));
    const { default: EmbeddedPostgres } = await import(
      pathToFileURL(require.resolve("embedded-postgres")).href
    );
    driverRoot = args[3] ? resolve(args[3]) : root;
    directory = await mkdtemp(resolve(tmpdir(), "winesnap-staging-db-"));
    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await new Promise((done, reject) => {
      listener.once("listening", done);
      listener.once("error", reject);
    });
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    target = {
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: randomUUID(),
      database: "postgres",
    };
    const postgresFlags = ["-h", "127.0.0.1"];
    cluster = new EmbeddedPostgres({
      databaseDir: resolve(directory, "data"),
      port,
      user: target.user,
      password: target.password,
      persistent: true,
      postgresFlags,
      initdbFlags: ["--encoding=UTF8"],
      onLog: () => {},
      onError: () => {},
    });
    stage = "start-local-cluster";
    await cluster.initialise();
    const major = Number((await readFile(resolve(directory, "data/PG_VERSION"), "utf8")).trim());
    postgresFlags.push(...localIoFlags(process.platform, major));
    await cluster.start();
    started = true;
  } else {
    target = ciDatabaseTarget(process.env, args);
  }
  const require = createRequire(resolve(driverRoot, "package.json"));
  const postgres = require("postgres");
  const options = {
    ...target,
    max: 1,
    ssl: false,
    connect_timeout: 5,
    idle_timeout: 5,
    onnotice: () => {},
    prepare: false,
  };
  admin = postgres(options);
  stage = "verify-empty-cluster";
  const identity = await admin`SELECT current_user AS role, current_database() AS database`;
  assert.equal(identity[0].role, target.user);
  assert.equal(identity[0].database, "postgres");
  assertFreshCluster({
    databases: (await admin`SELECT datname FROM pg_database`).map((row) => row.datname),
    roles: (
      await admin`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`
    ).map((row) => row.rolname),
    tables: (
      await admin`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')`
    ).map((row) => row.tablename),
  });
  stage = "create-synthetic-database";
  await admin`CREATE DATABASE ${admin(name)}`;
  created = true;
  db = postgres({ ...options, database: name });
  stage = "bootstrap-platform-contracts";
  await db.unsafe(await readFile(resolve(root, "supabase/tests/bootstrap.local.sql"), "utf8"));
  const inventory = await sqlInventory(root);
  const preflightFile = "supabase/operations/staging-preflight.sql";
  const preflightSource = await readFile(resolve(root, preflightFile), "utf8");
  async function checkPreflight(privacyInstalled) {
    const counts = async () =>
      (
        await db`SELECT
      (SELECT count(*)::int FROM auth.users) AS auth_users,
      (SELECT count(*)::int FROM public.wines) AS wines,
      (SELECT count(*)::int FROM public.wine_photos) AS wine_photos,
      (SELECT count(*)::int FROM storage.objects) AS storage_objects`
      )[0];
    const before = await counts();
    const rows = (await db.unsafe(preflightSource)).flat().filter((row) => row?.check_name);
    assert.equal(rows.length, 6, "Expected six preflight result groups");
    assert.deepEqual(rows.find((row) => row.check_name === "counts_only").result, { ...before });
    assert.deepEqual({ ...(await counts()) }, { ...before }, "Preflight changed fixture counts");
    const functions = rows.find((row) => row.check_name === "function_permissions").result;
    const tables = rows.find((row) => row.check_name === "table_security").result;
    assert.equal(
      functions.find((item) => item.function === "privacy_account_active").present,
      privacyInstalled,
    );
    assert.equal(
      tables.find((item) => item.table === "privacy_erasure_receipts").present,
      privacyInstalled,
    );
  }
  const owner = randomUUID();
  const wine = randomUUID();
  const share = `synthetic+legacy/${randomUUID()}`;
  const path = `${owner}/legacy.jpg`;
  let seeded = false;
  let preflightBeforePrivacy = false;
  for (const migration of inventory.migrations) {
    if (!seeded && migration.name >= "20260923") {
      stage = "seed-legacy-upgrade-fixture";
      await db`INSERT INTO auth.users (id,email) VALUES (${owner},'staging-fixture@example.test')`;
      await db`INSERT INTO public.wines (id,user_id,wine_name,is_public,share_id,image_url) VALUES (${wine},${owner},'Synthetic legacy wine',true,${share},${`https://example.invalid/storage/v1/object/public/wine-labels/${path}`})`;
      seeded = true;
    }
    if (migration.name === "20261013180000_privacy_controls.sql") {
      stage = "preflight-before-privacy-migration";
      await checkPreflight(false);
      preflightBeforePrivacy = true;
      console.log("PASS preflight detects missing privacy schema without changing fixture counts");
    }
    stage = migration.name;
    await db.unsafe(migration.source);
    console.log(`PASS migration ${migration.name}`);
  }
  assert(seeded, "Legacy fixture was not exercised");
  stage = "legacy-share-and-image-preservation";
  assert.equal((await db`SELECT share_id FROM public.wines WHERE id=${wine}`)[0].share_id, share);
  assert.equal(
    (await db`SELECT storage_path FROM public.wine_photos WHERE wine_id=${wine}`)[0].storage_path,
    path,
  );
  for (const invariant of inventory.invariants) {
    stage = invariant.name;
    await db.unsafe(invariant.source);
    console.log(`PASS invariants ${invariant.name}`);
  }
  stage = "read-only-staging-preflight";
  assert(preflightBeforePrivacy);
  await checkPreflight(true);
  console.log("PASS preflight detects installed privacy schema without changing fixture counts");
  stage = "test-only-image-proxy-policy";
  // Preservation was asserted above. Remove only this checker's own legacy fixture
  // so the operator policy's empty-project guard is exercised, not bypassed.
  await db`DELETE FROM public.wine_photos WHERE wine_id=${wine}`;
  await db`DELETE FROM public.wines WHERE id=${wine} AND user_id=${owner}`;
  await db`DELETE FROM auth.users WHERE id=${owner}`;
  const imageProxyFiles = [];
  for (const file of [
    "supabase/operations/test-image-proxy-policy.sql",
    "supabase/tests/image_proxy.local.sql",
    "supabase/tests/image_proxy_legacy_metadata.local.sql",
    "supabase/operations/test-image-proxy-metadata-repair.sql",
    "supabase/tests/image_proxy.local.sql",
  ]) {
    const source = await readFile(resolve(root, file), "utf8");
    await db.unsafe(source);
    imageProxyFiles.push({ file, sha256: createHash("sha256").update(source).digest("hex") });
  }
  console.log(
    "PASS new and repaired image policies: raw/info reads denied, owner listing/mutations preserved",
  );
  stage = "write-synthetic-report";
  report = {
    status: "passed",
    checkedAt: new Date().toISOString(),
    postgresVersion: (await db`SHOW server_version`)[0].server_version,
    migrations: inventory.migrations.length,
    invariantFiles: inventory.invariants.length,
    legacyShareAndImage: "preserved",
    readOnlyPreflight: "passed before and after privacy migration",
    testOnlyImageProxyPolicy: "passed; not an automatic migration",
    scope: "Synthetic PostgreSQL platform contracts only; not hosted Auth JWT or Storage HTTP",
    files: [
      ...inventory.migrations,
      ...inventory.invariants,
      ...imageProxyFiles,
      { file: preflightFile, sha256: createHash("sha256").update(preflightSource).digest("hex") },
    ].map(({ file, sha256 }) => ({
      file,
      sha256,
    })),
  };
} catch (error) {
  // SQL diagnostics can contain row contents. Never print arbitrary error objects.
  report = {
    status: "failed",
    stage,
    code: /^[A-Z0-9_]+$/.test(error.code ?? "") ? error.code : "CHECK_FAILED",
  };
  process.exitCode = 1;
} finally {
  try {
    if (db) await db.end({ timeout: 5 });
    if (admin && created) {
      assert(/^winesnap_check_[a-f0-9]{32}$/.test(name));
      await admin`DROP DATABASE ${admin(name)}`;
    }
  } catch {
    report = { status: "failed", stage: "database-cleanup", code: "CLEANUP_FAILED" };
    process.exitCode = 1;
  } finally {
    try {
      if (admin) await admin.end({ timeout: 5 });
    } catch {
      report = { status: "failed", stage: "connection-cleanup", code: "CLEANUP_FAILED" };
      process.exitCode = 1;
    }
    try {
      if (started) await cluster.stop();
      if (directory) {
        assert(
          dirname(directory) === resolve(tmpdir()) &&
            basename(directory).startsWith("winesnap-staging-db-"),
        );
        await rm(directory, { recursive: true, force: true });
      }
    } catch {
      report = { status: "failed", stage: "local-cluster-cleanup", code: "CLEANUP_FAILED" };
      process.exitCode = 1;
    }
  }
}
await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2));
const summary = JSON.stringify({ ...report, files: undefined });
if (process.exitCode) console.error(summary);
else console.log(summary);
