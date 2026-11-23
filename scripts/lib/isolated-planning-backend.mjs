import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { checkOwnedContainer, ownedServices } from "./owned-backend.mjs";
import {
  ownedRestoreProbeImage,
  ownedRoleRestoreSql,
  validateOwnedManifest,
} from "./owned-recovery.mjs";
import { finishOwnedInput } from "./owned-process-input.mjs";
import { recoveryToken } from "./platform-recovery.mjs";
import { ownedContainerProjection } from "./owned-planning-preflight.mjs";
import { pantryRollbackTag } from "./owned-pantry-preflight.mjs";
import { openPlanningWebRelay } from "./planning-web-relay.mjs";

const scope = "planning-database-check";
const prefix = "winesnap-planning-check";
const services = ["db", "auth", "storage", "rest", "probe"];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const source = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");

// The relay runs inside the disposable network. It cannot address an installed or remote API.
const relay = `
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 524288) process.exit(2);
}
const { url, method, headers, body } = JSON.parse(input);
const target = new URL(url);
if (target.protocol !== "http:" || target.username || target.password ||
    !/^winesnap-planning-check-[a-f0-9]{16}-(auth:9999|rest:3000)$/.test(target.host))
  process.exit(3);
const response = await fetch(target, { method, headers, body,
  redirect: "error", signal: AbortSignal.timeout(25000) });
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length > 8388608) process.exit(4);
console.log(JSON.stringify({ status: response.status,
  headers: Object.fromEntries([...response.headers].filter(([key]) =>
    ["content-type", "content-range", "range-unit"].includes(key))),
  bytes: bytes.toString("base64") }));`;

export function isolatedPlanningBackend(report, { meals = false, throughMigration } = {}) {
  const run = randomBytes(8).toString("hex");
  const names = Object.fromEntries(
    [...services, "restore", "web", "network"].map((s) => [s, `${prefix}-${run}-${s}`]),
  );
  const sign = randomBytes(32).toString("hex");
  const password = randomBytes(32).toString("hex");
  const tokens = {
    anon: recoveryToken(sign, "anon"),
    service_role: recoveryToken(sign, "service_role"),
  };
  const labels = { "winesnap.scope": scope, "winesnap.planning-check": run };
  const labelArgs = Object.entries(labels).flatMap(([k, v]) => ["--label", `${k}=${v}`]);
  const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
  const env = Object.fromEntries(
    [
      "PATH",
      "Path",
      "PATHEXT",
      "COMSPEC",
      "SystemRoot",
      "WINDIR",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "TEMP",
      "TMP",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
  let networkId, databaseImage;
  const engine = "npipe:////./pipe/dockerDesktopLinuxEngine";
  let webRelay;
  const containers = [];
  function command(args, input, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const proc = execFile(
        docker,
        ["--host", engine, ...args],
        { env, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: "buffer" },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout);
          // Safe diagnostics: never print SQL, argv, env, Docker logs or response bodies.
          const code = (stderr?.toString() ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
          const failure = new Error("planning_database_command_failed");
          failure.code = code;
          reject(failure);
        },
      );
      finishOwnedInput(proc.stdin, input);
    });
  }
  const output = async (args, stdin, timeout) =>
    (await command(args, stdin, timeout)).toString().trim();
  const inspect = async (args) => JSON.parse(await output(args))[0];
  const idPattern = /^[a-f0-9]{64}$/;
  const sameLabels = (available) => Object.entries(labels).every(([k, v]) => available?.[k] === v);
  const psql = (service = "db") => [
    "exec",
    "--interactive",
    names[service],
    "psql",
    "-h",
    "/tmp",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
  ];
  const sql = (text, service) =>
    output(psql(service), "SET search_path=public,extensions;\n" + text);
  const authHeader = (token) => ({
    authorization: "Bearer " + token,
    "content-type": "application/json",
  });
  const dbUrl = (role) => `postgres://${role}:${password}@${names.db}:5432/postgres`;
  async function start(
    service,
    image,
    user,
    { vars = {}, tmpfs = [], entrypoint, args = [], networkMode = networkId } = {},
  ) {
    const id = await output([
      "create",
      "--name",
      names[service],
      ...labelArgs,
      "--network",
      networkMode,
      "--read-only",
      "--user",
      user,
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--log-driver",
      "none",
      "--no-healthcheck",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--pids-limit",
      "96",
      ...tmpfs.flatMap((mount) => ["--tmpfs", mount]),
      ...Object.entries(vars).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
      ...(entrypoint ? ["--entrypoint", entrypoint] : []),
      image,
      ...args,
    ]);
    assert.match(id, idPattern);
    containers.push({ id, service });
    const record = await inspect(["inspect", id]);
    assert.equal(record.Name, "/" + names[service]);
    assert.equal(record.Image, image);
    assert.ok(sameLabels(record.Config.Labels));
    assert.equal(record.HostConfig.NetworkMode, networkMode);
    assert.equal(record.HostConfig.ReadonlyRootfs, true);
    assert.equal(record.HostConfig.LogConfig.Type, "none");
    assert.equal(record.Mounts.length, 0);
    assert.equal(Object.keys(record.HostConfig.PortBindings ?? {}).length, 0);
    assert.notEqual(record.HostConfig.PublishAllPorts, true);
    await command(["start", id]);
    return id;
  }
  async function ready(action) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await action();
      } catch (error) {
        if (attempt >= 45) throw error;
        await pause(600);
      }
    }
  }
  async function startDatabase(service, networkMode) {
    assert.ok(["db", "restore"].includes(service));
    await start(service, databaseImage, "postgres", {
      networkMode,
      vars: {
        POSTGRES_USER: "postgres",
        POSTGRES_DB: "postgres",
        POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
        POSTGRES_HOST_AUTH_METHOD: "scram-sha-256",
        POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=trust",
      },
      tmpfs: [
        "/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=512m,uid=999,gid=999,mode=0700",
        "/tmp:rw,nosuid,nodev,noexec,size=64m,uid=999,gid=999,mode=0700",
        "/var/run/postgresql:rw,nosuid,nodev,noexec,size=1m,uid=999,gid=999,mode=0770",
      ],
      entrypoint: "/bin/sh",
      args: [
        "-c",
        "exec /usr/local/bin/docker-entrypoint.sh postgres -c unix_socket_directories=/tmp,/var/run/postgresql -c shared_buffers=32MB -c max_connections=40",
      ],
    });
    await ready(async () => {
      await command(["exec", names[service], "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      assert.equal(await sql("SELECT 1", service), "1");
    });
  }
  async function request(service, path, { method = "GET", headers = {}, body } = {}) {
    assert.ok(["auth", "rest"].includes(service));
    assert.ok(path.startsWith("/") && !path.startsWith("//") && !path.includes("\\"));
    const port = service === "auth" ? 9999 : 3000;
    const result = JSON.parse(
      await output(
        ["exec", "--interactive", names.probe, "node", "--input-type=module", "--eval", relay],
        JSON.stringify({
          url: `http://${names[service]}:${port}${path}`,
          method,
          headers,
          body,
        }),
      ),
    );
    const bytes = Buffer.from(result.bytes, "base64");
    return new Response([204, 205, 304].includes(result.status) ? null : bytes, {
      status: result.status,
      headers: result.headers,
    });
  }
  async function boot() {
    report.phase = "check_local_images";
    assert.equal(
      (await inspect(["context", "inspect", "desktop-linux"])).Endpoints.docker.Host,
      engine,
    );
    const images = {};
    for (const service of services) {
      images[service] = await output([
        "image",
        "inspect",
        service === "probe" ? ownedRestoreProbeImage : ownedServices[service],
        "--format",
        "{{.Id}}",
      ]);
      assert.match(images[service], /^sha256:[a-f0-9]{64}$/);
    }
    databaseImage = images.db;
    report.phase = "create_internal_network";
    networkId = await output(["network", "create", "--internal", ...labelArgs, names.network]);
    assert.match(networkId, idPattern);
    const network = await inspect(["network", "inspect", networkId]);
    assert.equal(network.Internal, true);
    assert.ok(sameLabels(network.Labels));
    report.phase = "base_database";
    await startDatabase("db", networkId);
    await sql(
      (await source("config/owned-windows/platform.sql")) +
        `
      INSERT INTO winesnap_local.installation VALUES('${run}${run}');
      ALTER ROLE authenticator PASSWORD '${password}';
      ALTER ROLE supabase_auth_admin PASSWORD '${password}';
      ALTER ROLE supabase_storage_admin PASSWORD '${password}';`,
    );
    report.phase = "auth_and_storage_schema";
    await start("auth", images.auth, "1000:1000", {
      tmpfs: ["/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000"],
      vars: {
        GOTRUE_API_HOST: "0.0.0.0",
        GOTRUE_API_PORT: "9999",
        GOTRUE_DB_DRIVER: "postgres",
        GOTRUE_DB_DATABASE_URL: dbUrl("supabase_auth_admin"),
        GOTRUE_DB_NAMESPACE: "auth",
        API_EXTERNAL_URL: `http://${names.auth}:9999`,
        GOTRUE_SITE_URL: "http://example.test",
        GOTRUE_JWT_SECRET: sign,
        GOTRUE_JWT_AUD: "authenticated",
        GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
        GOTRUE_JWT_ADMIN_ROLES: "service_role",
        GOTRUE_JWT_EXP: "3600",
        GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
        GOTRUE_DISABLE_SIGNUP: "true",
        GOTRUE_LOG_LEVEL: "error",
      },
    });
    await ready(async () =>
      assert.equal(await sql("SELECT to_regclass('auth.users') IS NOT NULL"), "t"),
    );
    await start("storage", images.storage, "1000:1000", {
      tmpfs: [
        "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000",
        "/var/lib/storage:rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000",
      ],
      vars: {
        DATABASE_URL: dbUrl("supabase_storage_admin"),
        AUTH_JWT_SECRET: sign,
        ANON_KEY: tokens.anon,
        SERVICE_KEY: tokens.service_role,
        POSTGREST_URL: `http://${names.rest}:3000`,
        STORAGE_BACKEND: "file",
        FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
        TENANT_ID: "winesnap-planning",
        REGION: "local",
        GLOBAL_S3_BUCKET: "winesnap-planning",
        FILE_SIZE_LIMIT: "10485760",
        ENABLE_IMAGE_TRANSFORMATION: "false",
        LOG_LEVEL: "error",
      },
    });
    await ready(async () =>
      assert.equal(
        await sql("SELECT to_regprocedure('storage.allow_any_operation(text[])') IS NOT NULL"),
        "t",
      ),
    );
    report.phase = "apply_repository_migrations";
    let files = (await readdir(new URL("../../supabase/migrations/", import.meta.url)))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    assert.ok(files.every((file) => /^\d{14}_[a-z0-9_-]+\.sql$/i.test(file)));
    assert.ok(files.includes("20261118200000_kitchen_week_plans.sql"));
    if (throughMigration) {
      const last = files.indexOf(throughMigration);
      assert.ok(last >= 0);
      files = files.slice(0, last + 1);
    }
    let schema = await source("config/owned-windows/auth-helpers.sql");
    for (const file of files) {
      const migration = await source("supabase/migrations/" + file);
      const hash = createHash("sha256").update(migration).digest("hex");
      schema += `\nBEGIN;\n${migration}\nINSERT INTO winesnap_local.migrations(name,sha256) VALUES('${file}','${hash}'); COMMIT;\n`;
    }
    await sql(
      schema +
        "\nUPDATE public.kitchen_config SET enabled=true" +
        (meals ? ",chef_enabled=true,meals_enabled=true" : "") +
        " WHERE id=true;",
    );
    assert.equal(Number(await sql("SELECT count(*) FROM winesnap_local.migrations")), files.length);
    report.isolatedMigrationsApplied = files.length;
    report.phase = "postgrest_and_relay";
    await start("rest", images.rest, "65534:65534", {
      vars: {
        PGRST_DB_URI: dbUrl("authenticator"),
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: sign,
        PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions",
        PGRST_DB_POOL: "3",
        PGRST_SERVER_PORT: "3000",
        PGRST_LOG_LEVEL: "crit",
      },
    });
    await start("probe", images.probe, "node", {
      entrypoint: "node",
      args: ["--eval", "setInterval(()=>{},60000)"],
    });
    await ready(async () => assert.equal((await request("auth", "/health")).status, 200));
    await ready(async () => assert.equal((await request("rest", "/")).status, 200));
  }
  async function createAccount(label) {
    assert.ok(["owner", "peer"].includes(label));
    const email = `planning-${label}-${run}@example.test`;
    const accountPassword = randomBytes(24).toString("hex");
    const response = await request("auth", "/admin/users", {
      method: "POST",
      headers: authHeader(tokens.service_role),
      body: JSON.stringify({ email, password: accountPassword, email_confirm: true }),
    });
    assert.ok([200, 201].includes(response.status));
    const { id } = await response.json();
    assert.match(id, /^[a-f0-9-]{36}$/);
    return { id, email, password: accountPassword };
  }
  async function recover() {
    const manifestSql = await source("config/owned-windows/backup-manifest.sql");
    const writers = containers.filter(({ service }) =>
      ["rest", "auth", "storage"].includes(service),
    );
    assert.equal(writers.length, 3);
    const writerIds = writers.map(({ id }) => id);
    let archive;
    try {
      report.phase = "restore_quiesce_disposable_writers";
      await command(["stop", "--time", "5", ...writerIds]);
      report.phase = "restore_source_manifest";
      const before = validateOwnedManifest(JSON.parse(await sql(manifestSql)));
      assert.equal(
        before.relations.find(
          ({ schema, table }) => schema === "public" && table === "kitchen_week_plans",
        )?.rows,
        2,
      );
      report.phase = "restore_capture_database_archive";
      archive = await command([
        "exec",
        names.db,
        "pg_dump",
        "-h",
        "/tmp",
        "-U",
        "postgres",
        "--format=custom",
        "--dbname=postgres",
      ]);
      assert.equal(archive.subarray(0, 5).toString(), "PGDMP");
      const roles = await output([
        "exec",
        names.db,
        "pg_dumpall",
        "-h",
        "/tmp",
        "-U",
        "postgres",
        "--roles-only",
        "--no-role-passwords",
      ]);
      // The manifest includes catalog names from information_schema. Compare
      // identically named databases in two distinct clusters, not two names in one.
      report.phase = "restore_empty_networkless_cluster";
      await startDatabase("restore", "none");
      assert.equal(
        await sql(
          "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');",
          "restore",
        ),
        "0",
      );
      report.phase = "restore_role_and_database_archives";
      await sql(ownedRoleRestoreSql(roles), "restore");
      await command(
        [
          "exec",
          "--interactive",
          names.restore,
          "pg_restore",
          "-h",
          "/tmp",
          "-U",
          "postgres",
          "--exit-on-error",
          "--single-transaction",
          "--dbname=postgres",
        ],
        archive,
      );
      report.phase = "restore_compare_manifest";
      const restored = validateOwnedManifest(JSON.parse(await sql(manifestSql, "restore")));
      const restoredRelations = new Map(
        restored.relations.map((row) => [row.schema + "." + row.table, row]),
      );
      const changedRows = before.relations
        .filter((row) => {
          const copy = restoredRelations.get(row.schema + "." + row.table);
          return copy?.rows !== row.rows || copy?.sha256 !== row.sha256;
        })
        .map((row) => row.schema + "." + row.table);
      const changedCatalog = Object.keys(before.catalog).filter(
        (key) => before.catalog[key] !== restored.catalog[key],
      );
      if (changedRows.length) report.restoreDifferentRelations = changedRows;
      if (changedCatalog.length) report.restoreDifferentCatalogSections = changedCatalog;
      assert.deepEqual(restored.relations, before.relations);
      assert.deepEqual(restored.catalog, before.catalog);
      report.restoredRelationsVerified = restored.relations.length;
    } finally {
      archive?.fill(0);
    }
    report.phase = "restore_resume_disposable_services";
    await command(["start", ...writerIds]);
    await ready(async () => assert.equal((await request("auth", "/health")).status, 200));
    await ready(async () => assert.equal((await request("rest", "/")).status, 200));
    return report.restoredRelationsVerified;
  }
  async function removeFixture({ id, service }) {
    const record = await inspect(["inspect", id]);
    assert.equal(record.Name, "/" + names[service]);
    assert.ok(sameLabels(record.Config.Labels));
    await command(["rm", "--force", id]);
    containers.splice(
      containers.findIndex((item) => item.id === id),
      1,
    );
  }
  async function replaceRehearsalWeb(image) {
    assert.match(image, /^sha256:[a-f0-9]{64}$/);
    const previous = containers.find(({ service }) => service === "web");
    if (previous) {
      await webRelay?.close();
      webRelay = undefined;
      await removeFixture(previous);
    }
    const id = await start("web", image, "node", {
      networkMode: "none",
      vars: {
        SUPABASE_URL: "http://127.0.0.1:54323",
        SUPABASE_PUBLISHABLE_KEY: tokens.anon,
        WINESNAP_OWNED_BACKEND_ENABLED: "true",
        WINESNAP_COOKING_CORE_ENABLED: "true",
      },
    });
    webRelay = openPlanningWebRelay(docker, engine, env, id);
    await ready(async () => assert.equal((await webRelay.request("/api/health")).status, 200));
    return id;
  }
  async function close() {
    let clean = true;
    await webRelay?.close();
    for (const { id, service } of containers.slice().reverse()) {
      try {
        await removeFixture({ id, service });
      } catch {
        clean = false;
      }
    }
    if (networkId) {
      try {
        const record = await inspect(["network", "inspect", networkId]);
        assert.equal(record.Name, names.network);
        assert.equal(record.Internal, true);
        assert.ok(sameLabels(record.Labels));
        assert.equal(Object.keys(record.Containers ?? {}).length, 0);
        await command(["network", "rm", networkId]);
      } catch {
        clean = false;
      }
    }
    return clean;
  }
  return {
    boot,
    request,
    replaceRehearsalWeb,
    requestWeb(path, method) {
      assert.ok(webRelay);
      return webRelay.request(path, method);
    },
    async inspectPreviousOwnedWeb({ pantry = false } = {}) {
      const name = "winesnap-owned-web";
      const value = JSON.parse(
        await output([
          "inspect",
          "--type",
          "container",
          "--format",
          ownedContainerProjection,
          name,
        ]),
      );
      const identity = value.Config.Labels["winesnap.installation"];
      assert.match(identity, /^[a-f0-9]{32}$/);
      checkOwnedContainer(value, name, identity);
      assert.equal(value.State.Running, true);
      assert.match(value.Id, idPattern);
      assert.match(value.Image, /^sha256:[a-f0-9]{64}$/);
      assert.equal(
        await output([
          "image",
          "inspect",
          "--format",
          "{{.Id}}",
          pantry ? pantryRollbackTag(value.Image) : value.Image,
        ]),
        value.Image,
      );
      return { container: value.Id, image: value.Image };
    },
    candidateImage(tag, { pantry = false } = {}) {
      assert.match(
        tag,
        pantry
          ? /^winesnap-planning-rehearsal:dev07-[a-f0-9]{7,40}$/
          : /^winesnap-planning-rehearsal:dev06-[a-f0-9]{7,40}$/,
      );
      return output(["image", "inspect", "--format", "{{.Id}}", tag]);
    },
    async planSnapshot({ pantry = false } = {}) {
      const query = await source("config/owned-windows/backup-manifest.sql");
      const manifest = validateOwnedManifest(JSON.parse(await sql(query)));
      const interesting = new Set([
        "public.kitchen_week_plans",
        "public.kitchen_recipes",
        "public.kitchen_recipe_versions",
        "winesnap_local.migrations",
        ...(pantry
          ? [
              "public.kitchen_pantry",
              "public.kitchen_pantry_consumption",
              "public.kitchen_diners",
              "public.cooking_sessions",
            ]
          : []),
      ]);
      const relations = manifest.relations.filter(({ schema, table }) =>
        interesting.has(schema + "." + table),
      );
      assert.equal(relations.length, interesting.size);
      const sequenceDefinitions = JSON.parse(
        await sql(`
        SELECT coalesce(jsonb_agg(to_jsonb(s) - 'last_value' ORDER BY schemaname, sequencename), '[]')
        FROM pg_sequences s WHERE schemaname IN ('public','auth','storage','extensions','winesnap_local');`),
      );
      return { relations, catalog: manifest.catalog, sequenceDefinitions };
    },
    createAccount,
    recover,
    close,
    get anon() {
      return tokens.anon;
    },
    get serviceRole() {
      return tokens.service_role;
    },
    async discardFixtureVersion(owner, version) {
      for (const id of [owner, version]) assert.match(id, /^[a-f0-9-]{36}$/);
      assert.equal(
        await sql(`WITH removed AS (
        DELETE FROM public.kitchen_recipe_versions
        WHERE user_id='${owner}' AND id='${version}' RETURNING id
      ) SELECT count(*) FROM removed;`),
        "1",
      );
    },
    admin(path, options = {}) {
      return request("rest", path, {
        ...options,
        headers: {
          ...authHeader(tokens.service_role),
          ...options.headers,
        },
      });
    },
    removeAccount: (id) =>
      request("auth", "/admin/users/" + id, {
        method: "DELETE",
        headers: authHeader(tokens.service_role),
      }),
  };
}
