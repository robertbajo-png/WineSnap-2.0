import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [dependencyRoot, archivePath, restoreBinary] = process.argv.slice(2);
assert.ok(
  dependencyRoot && archivePath && restoreBinary,
  "Provide dependency root, archive, pg_restore",
);
const require = createRequire(join(resolve(dependencyRoot), "package.json"));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(require.resolve("embedded-postgres"))
);
const { Client } = require("pg");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "winesnap-backup-rehearsal-"));
const listener = createServer();
await new Promise((done) => listener.listen(0, "127.0.0.1", done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const password = randomUUID();
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
const db = new Client({
  host: "127.0.0.1",
  port,
  user: "postgres",
  password,
  database: "postgres",
});
let started = false;
let connected = false;
let stage = "bootstrap";
try {
  await cluster.initialise();
  await cluster.start();
  started = true;
  await db.connect();
  connected = true;
  await db.query(await readFile(join(root, "supabase/tests/bootstrap.local.sql"), "utf8"));
  await db.query('CREATE EXTENSION "uuid-ossp" WITH SCHEMA public');
  await db.query(
    "INSERT INTO storage.buckets(id,name,public) VALUES ('wine-labels','wine-labels',true)",
  );
  // Restore application objects only; Supabase platform contracts use the local bootstrap.
  const toc = execFileSync(restoreBinary, ["--list", archivePath], { encoding: "utf8" });
  const selected = toc
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.startsWith(";") ||
        (/\bpublic\b/.test(line) &&
          !/\b(EXTENSION|ACL|DEFAULT ACL)\b/.test(line) &&
          !/SCHEMA - public\b/.test(line)),
    );
  const list = join(directory, "application.toc");
  await writeFile(list, selected.join("\n"));
  function restore(section) {
    stage = `restore-${section}`;
    execFileSync(
      restoreBinary,
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--username",
        "postgres",
        "--dbname",
        "postgres",
        "--use-list",
        list,
        "--section",
        section,
        archivePath,
      ],
      { env: { ...process.env, PGPASSWORD: password }, stdio: ["ignore", "ignore", "pipe"] },
    );
  }
  restore("pre-data");
  restore("data");
  const tables = (
    await db.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id'",
    )
  ).rows;
  for (const { table_name: table } of tables) {
    const identifier = `"${table.replaceAll('"', '""')}"`;
    await db.query(
      `INSERT INTO auth.users(id) SELECT DISTINCT user_id FROM public.${identifier} WHERE user_id IS NOT NULL ON CONFLICT DO NOTHING`,
    );
  }
  restore("post-data");
  const before = (
    await db.query(
      "SELECT (SELECT count(*) FROM wines)::int AS wines, (SELECT count(*) FROM wine_photos)::int AS photos",
    )
  ).rows[0];
  const legacy = (await db.query("SELECT id,share_id,image_url FROM wines ORDER BY id")).rows;
  const migrations = (await readdir(join(root, "supabase/migrations")))
    .filter((name) => name.endsWith(".sql") && name >= "20260923")
    .sort();
  for (const file of migrations) {
    stage = file;
    await db.query(await readFile(join(root, "supabase/migrations", file), "utf8"));
    console.log(`Backup migration passed: ${file}`);
  }
  assert.deepEqual(
    (await db.query("SELECT id,share_id,image_url FROM wines ORDER BY id")).rows,
    legacy,
  );
  const tests = (await readdir(join(root, "supabase/tests")))
    .filter((name) => /^step\d.*\.sql$/.test(name))
    .sort();
  for (const file of tests) {
    stage = file;
    await db.query(await readFile(join(root, "supabase/tests", file), "utf8"));
  }
  console.log(
    JSON.stringify({
      scope:
        "Application schema/data restore with mocked Supabase platform; not full platform recovery",
      before,
      migrations: migrations.length,
      invariantFiles: tests.length,
      legacyWineFields: "preserved",
    }),
  );
} catch (error) {
  // PostgreSQL diagnostics can include private row contents. Report only safe metadata.
  console.error(
    JSON.stringify({ restoreFailed: true, code: error.code ?? error.status ?? "unknown", stage }),
  );
  process.exitCode = 1;
} finally {
  if (connected) await db.end();
  if (started) await cluster.stop();
}
