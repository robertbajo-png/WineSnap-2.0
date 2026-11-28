import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export function localIoFlags(platform, major) {
  // PG18 I/O workers can outlive the embedded runtime's Windows forced stop.
  return platform === "win32" && major >= 18 ? ["-c", "io_method=sync"] : [];
}

export function ciDatabaseTarget(env, args = []) {
  assert.equal(args.length, 0, "CI database checks do not accept connection arguments");
  assert.equal(env.CI, "true", "The CI service mode requires CI=true");
  assert.equal(
    env.WINESNAP_DATABASE_CHECK,
    "ephemeral-synthetic-only",
    "Explicit ephemeral database acknowledgement required",
  );
  // Intentionally ignore DATABASE_URL, PG*, SUPABASE_* and linked project files.
  return {
    host: "127.0.0.1",
    port: 54329,
    user: "winesnap_ci",
    password: "ci-only-synthetic-password",
    database: "postgres",
  };
}

export function assertFreshCluster({ databases, roles, tables }) {
  assert(
    databases.every((name) => ["postgres", "template0", "template1"].includes(name)),
    "Refusing a cluster with existing application databases",
  );
  assert.equal(roles.length, 0, "Refusing a cluster with existing Supabase application roles");
  assert.equal(
    tables.length,
    0,
    "Refusing a maintenance database with existing application tables",
  );
}

export async function sqlInventory(root) {
  const collect = async (directory, filter) => {
    const names = (await readdir(resolve(root, directory))).filter(filter).sort();
    assert(names.length > 0, `No SQL files found in ${directory}`);
    const files = [];
    for (const name of names) {
      const source = await readFile(resolve(root, directory, name), "utf8");
      files.push({
        file: `${directory}/${name}`,
        name,
        sha256: createHash("sha256").update(source).digest("hex"),
        source,
      });
    }
    return files;
  };
  const migrations = await collect("supabase/migrations", (name) => name.endsWith(".sql"));
  const versions = migrations.map(({ name }) => {
    assert(/^\d{14}_[\w-]+\.sql$/.test(name), "Unexpected migration filename");
    return name.slice(0, 14);
  });
  assert.equal(new Set(versions).size, versions.length, "Duplicate migration versions");
  const invariants = await collect("supabase/tests", (name) => /^step\d.*\.sql$/.test(name));
  return { migrations, invariants };
}
