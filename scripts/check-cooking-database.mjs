import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pantryMigrationBatch, pantryMigrationTransaction } from "./lib/owned-pantry-preflight.mjs";
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const name = `winesnap-cooking-check-${randomUUID().slice(0, 8)}`;
const scope = "local-cooking-check";
let container;
let phase = "engine";
async function run(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--context", "desktop-linux", ...args],
      { timeout: 180000, windowsHide: true },
      (error, stdout, stderr) => (error ? reject(new Error(stderr.slice(-3000))) : resolve(stdout)),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
try {
  assert.equal(
    JSON.parse(await run(["context", "inspect", "desktop-linux"]))[0].Endpoints.docker.Host,
    "npipe:////./pipe/dockerDesktopLinuxEngine",
  );
  container = (
    await run([
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      `winesnap.scope=${scope}`,
      "--network",
      "none",
      "--read-only",
      "--user",
      "postgres",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--memory",
      "512m",
      "--pids-limit",
      "64",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,size=256m,uid=999,gid=999,mode=0700",
      "--tmpfs",
      "/var/run/postgresql:rw,size=1m,uid=999,gid=999",
      "--tmpfs",
      "/tmp:rw,size=32m,uid=999,gid=999",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:17-bookworm",
    ])
  ).trim();
  assert.match(container, /^[a-f0-9]{64}$/);
  for (let i = 0; ; i++) {
    try {
      await run(["exec", container, "pg_isready", "-U", "postgres"]);
      break;
    } catch {
      if (i > 30) throw new Error("Database not ready");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  const execute = (sql) =>
    run(
      [
        "exec",
        "--interactive",
        container,
        "psql",
        "-X",
        "-q",
        "-t",
        "-A",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      "SET search_path=public,extensions;\n" + sql,
    );
  phase = "schema";
  await execute(
    await readFile(new URL("../supabase/tests/bootstrap.local.sql", import.meta.url), "utf8"),
  );
  const migrations = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const pantryStart = migrations.indexOf(pantryMigrationBatch[0]);
  const pantryEnd = pantryStart + pantryMigrationBatch.length;
  assert.ok(pantryStart > 0);
  assert.deepEqual(migrations.slice(pantryStart, pantryEnd), pantryMigrationBatch);
  async function applyMigration(file) {
    phase = file;
    await execute(
      await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
    );
  }
  for (const file of migrations.slice(0, pantryStart)) await applyMigration(file);
  phase = "atomic_owned_pantry_migration_batch";
  await execute(`CREATE SCHEMA winesnap_local;
    CREATE TABLE winesnap_local.migrations(name text PRIMARY KEY, sha256 text NOT NULL);`);
  const migration = (name, source) => ({
    name,
    source,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
  const batch = await Promise.all(
    pantryMigrationBatch.map(async (file) =>
      migration(
        file,
        await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
      ),
    ),
  );
  const broken = [batch[0], migration(batch[1].name, batch[1].source + "\nSELECT 1 / 0;")];
  await assert.rejects(execute(pantryMigrationTransaction(broken)), /division by zero/);
  assert.equal(
    (
      await execute(`SELECT to_regclass('public.kitchen_pantry') IS NULL
    AND to_regprocedure('public.kitchen_week_diner_ids_valid(jsonb)') IS NULL
    AND NOT EXISTS(SELECT 1 FROM winesnap_local.migrations);`)
    ).trim(),
    "t",
  );
  await execute(pantryMigrationTransaction(batch));
  assert.equal(
    (
      await execute(`SELECT string_agg(name, ',' ORDER BY name)
    FROM winesnap_local.migrations;`)
    ).trim(),
    pantryMigrationBatch.join(","),
  );
  for (const file of migrations.slice(pantryEnd)) await applyMigration(file);
  phase = "invariants";
  await execute(
    await readFile(new URL("../supabase/tests/step12_cooking_core.sql", import.meta.url), "utf8"),
  );
  await execute(
    await readFile(
      new URL("../supabase/tests/step13_ai_chef_food_memory.sql", import.meta.url),
      "utf8",
    ),
  );
  phase = "ownership_versions_sessions_erasure";
  await execute(
    await readFile(
      new URL("../supabase/tests/step14_meals_households.sql", import.meta.url),
      "utf8",
    ),
  );
  await execute(
    await readFile(
      new URL("../supabase/tests/meals_households.local.sql", import.meta.url),
      "utf8",
    ),
  );
  const result = await execute(
    await readFile(new URL("../supabase/tests/cooking_core.local.sql", import.meta.url), "utf8"),
  );
  assert.ok(result.includes("cooking_core_acceptance_passed"));
  phase = "chef_memory_ownership_idempotency_forgetting_erasure";
  assert.ok(
    (
      await execute(
        await readFile(new URL("../supabase/tests/chef_memory.local.sql", import.meta.url), "utf8"),
      )
    ).includes("chef_memory_acceptance_passed"),
  );
  phase = "pantry_ownership_confirmation_and_consumption";
  assert.ok(
    (
      await execute(
        await readFile(
          new URL("../supabase/tests/kitchen_pantry.local.sql", import.meta.url),
          "utf8",
        ),
      )
    ).includes("kitchen_pantry_acceptance_passed"),
  );
  phase = "week_plan_existing_owner_diners";
  assert.ok(
    (
      await execute(
        await readFile(
          new URL("../supabase/tests/week_plan_diners.local.sql", import.meta.url),
          "utf8",
        ),
      )
    ).includes("week_plan_diners_acceptance_passed"),
  );
  console.log(
    JSON.stringify({
      passed: true,
      synthetic: true,
      atomicOwnedPantryBatch: true,
      productionTouched: false,
      hostedJwtTested: false,
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ passed: false, phase, error: error.message }));
  process.exitCode = 1;
} finally {
  if (container) {
    assert.equal(
      (
        await run([
          "inspect",
          "--format",
          '{{index .Config.Labels "winesnap.scope"}}|{{.HostConfig.NetworkMode}}',
          container,
        ])
      ).trim(),
      `${scope}|none`,
    );
    await run(["rm", "--force", container]);
  }
}
