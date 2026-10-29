import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ownedProject, ownedServices } from "./lib/owned-backend.mjs";
import { checkBinaryPart, recoveryToken, sha256 } from "./lib/platform-recovery.mjs";
import {
  assertOwnedRestoreContainer,
  inspectOwnedTar,
  ownedRestoreLimit,
  ownedRestoreNames,
  ownedRoleRestoreSql,
  ownedRestoreScope,
  validateOwnedArchive,
  validateOwnedManifest,
} from "./lib/owned-recovery.mjs";

assert.equal(process.argv.length, 2);
assert.equal(process.env.WINESNAP_OWNED_RESTORE_PIPE, "1");
assert.ok(!process.stdout.isTTY && !process.stdin.isTTY);
const run = process.env.WINESNAP_OWNED_RESTORE_ID;
const names = ownedRestoreNames(run);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const environment = Object.fromEntries(
  [
    "PATH",
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
const resources = [];
let network = false,
  phase = "validate_archive";
const report = {
  project: ownedProject,
  completed: false,
  cleanupCompleted: false,
  productionTouched: false,
  hostedTestTouched: false,
  runningInstallationStopped: false,
  sourceDatabaseConnected: false,
  providerCredentialsLoaded: false,
  publicPorts: 0,
  permanentVolumesCreated: 0,
  portableRecoveryVerified: false,
};

function command(args, input, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        env: environment,
        timeout,
        maxBuffer: ownedRestoreLimit,
        windowsHide: true,
        encoding: "buffer",
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const failure = new Error("owned_restore_command_failed");
        const diagnostic = stderr?.toString() ?? "";
        failure.category = /not running/i.test(diagnostic)
          ? "container_stopped"
          : /Permission denied|Operation not permitted/i.test(diagnostic)
            ? "permission_denied"
            : /No such file or directory/i.test(diagnostic)
              ? "missing_file"
              : /does not exist/i.test(diagnostic)
                ? "missing_database_object"
                : "command_failed";
        reject(failure);
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const json = async (args) => JSON.parse((await command(args)).toString());
const labels = [
  "--label",
  `winesnap.scope=${ownedRestoreScope}`,
  "--label",
  `winesnap.restore=${run}`,
];
async function start(service, image, user, { env = {}, tmpfs = [], entrypoint, args = [] } = {}) {
  phase = `create_${service}`;
  resources.push(names[service]);
  await command([
    "create",
    "--name",
    names[service],
    ...labels,
    "--network",
    names.network,
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
    "128",
    ...tmpfs.flatMap((value) => ["--tmpfs", value]),
    ...Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    ...(entrypoint ? ["--entrypoint", entrypoint] : []),
    image,
    ...args,
  ]);
  phase = `start_${service}`;
  await command(["start", names[service]]);
  phase = `isolation_${service}`;
  assertOwnedRestoreContainer((await json(["inspect", names[service]]))[0], names, run);
}
async function sql(source) {
  return (
    await command(
      [
        "exec",
        "--interactive",
        names.db,
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
      ],
      `SET search_path=public,extensions;\n${source}`,
    )
  )
    .toString()
    .trim();
}
async function ready(action) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await action();
      return;
    } catch (error) {
      if (attempt === 59) throw error;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
}
const httpCode = `
let input=''; for await(const chunk of process.stdin) { input+=chunk; if(input.length>65536) process.exit(2); }
const req=JSON.parse(input), url=new URL(req.url);
if(url.protocol!=='http:' || url.username || url.password ||
 !/^winesnap-owned-restore-[a-f0-9]{16}-(auth|rest|storage)$/.test(url.hostname)) process.exit(3);
const response=await fetch(url,{method:req.method??'GET',headers:req.headers,body:req.body,
 redirect:'error',signal:AbortSignal.timeout(15000)});
const bytes=Buffer.from(await response.arrayBuffer()); if(bytes.length>16*1024*1024) process.exit(4);
console.log(JSON.stringify({status:response.status,base64:bytes.toString('base64')}));`;
async function request(service, path, options = {}) {
  assert.ok(["auth", "storage", "rest"].includes(service));
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  const port = { auth: 9999, storage: 5000, rest: 3000 }[service];
  const result = JSON.parse(
    (
      await command(
        ["exec", "--interactive", names.probe, "node", "--input-type=module", "--eval", httpCode],
        JSON.stringify({ url: `http://${names[service]}:${port}${path}`, ...options }),
      )
    ).toString(),
  );
  result.bytes = Buffer.from(result.base64, "base64");
  result.json = () => JSON.parse(result.bytes.toString());
  return result;
}

try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= ownedRestoreLimit);
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const bundle = validateOwnedArchive(JSON.parse(input.toString()));
  input.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  chunks.length = 0;
  const originalInstallation = bundle.configuration.installationId;
  // Never reuse the source DB/JWT/job secrets in a running clone.
  for (const key of Object.keys(bundle.configuration)) bundle.configuration[key] = null;
  delete bundle.configuration;
  report.archiveVersion = 2;
  const database = checkBinaryPart(bundle.database),
    storage = checkBinaryPart(bundle.storage);
  assert.deepEqual(await inspectOwnedTar(storage), bundle.manifest.files);
  phase = "pin_local_images";
  assert.equal(
    (await json(["context", "inspect", "desktop-linux"]))[0].Endpoints.docker.Host,
    "npipe:////./pipe/dockerDesktopLinuxEngine",
  );
  const images = {};
  for (const service of ["db", "auth", "storage", "rest"]) {
    images[service] = (
      await command(["image", "inspect", ownedServices[service], "--format", "{{.Id}}"])
    )
      .toString()
      .trim();
    assert.equal(images[service], bundle.images[service]);
  }
  images.probe = (
    await command(["image", "inspect", "winesnap-owned:local", "--format", "{{.Id}}"])
  )
    .toString()
    .trim();
  assert.match(images.probe, /^sha256:[a-f0-9]{64}$/);
  phase = "isolated_network";
  await command(["network", "create", "--internal", ...labels, names.network]);
  network = true;
  const net = (await json(["network", "inspect", names.network]))[0];
  assert.equal(net.Internal, true);
  assert.equal(net.Labels["winesnap.restore"], run);
  const password = randomBytes(32).toString("hex"),
    signingSecret = randomBytes(32).toString("hex");
  phase = "empty_restore_database";
  await start("db", images.db, "postgres", {
    env: {
      POSTGRES_USER: "postgres",
      POSTGRES_DB: "postgres",
      POSTGRES_PASSWORD: password,
      POSTGRES_HOST_AUTH_METHOD: "scram-sha-256",
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=trust",
    },
    tmpfs: [
      "/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=512m,uid=999,gid=999,mode=0700",
      "/tmp:rw,nosuid,nodev,noexec,size=32m,uid=999,gid=999,mode=0700",
      "/var/run/postgresql:rw,nosuid,nodev,noexec,size=1m,uid=999,gid=999,mode=0770",
    ],
    entrypoint: "/bin/sh",
    args: [
      "-c",
      "umask 077; /usr/local/bin/docker-entrypoint.sh postgres -c unix_socket_directories=/tmp,/var/run/postgresql -c shared_buffers=32MB -c max_connections=40 >/tmp/owned-init.log 2>&1 & child=$!; wait $child; sleep 3600",
    ],
  });
  phase = "database_ready";
  try {
    await ready(async () => {
      // The entrypoint's temporary init server accepts Unix sockets only.
      await command(["exec", names.db, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      assert.equal(await sql("SELECT 1"), "1");
    });
  } catch (error) {
    // Startup diagnostics stay in this clone's private tmpfs. Only a fixed
    // category, never the raw log or user data, can enter the public report.
    const diagnostic = (await command(["exec", names.db, "cat", "/tmp/owned-init.log"])).toString();
    const match = [
      [
        "data_directory_permissions",
        /invalid permissions|Permission denied|Operation not permitted/i,
      ],
      ["database_already_exists", /already exists|not empty/i],
      ["database_memory_limit", /out of memory|cannot allocate memory|No space left/i],
      ["database_init_args", /unrecognized option|invalid argument|invalid option/i],
      ["database_connection", /connection to server.*failed|role .* does not exist/i],
    ].find(([, pattern]) => pattern.test(diagnostic));
    error.category = match?.[0] ?? error.category;
    throw error;
  }
  phase = "restore_roles";
  await sql(ownedRoleRestoreSql(checkBinaryPart(bundle.roles).toString()));
  await sql(`ALTER DATABASE postgres OWNER TO postgres;
    ALTER ROLE supabase_auth_admin PASSWORD '${password}';
    ALTER ROLE supabase_storage_admin PASSWORD '${password}';
    ALTER ROLE authenticator PASSWORD '${password}';`);
  phase = "restore_database_archive";
  await command(
    [
      "exec",
      "--interactive",
      names.db,
      "pg_restore",
      "-h",
      "/tmp",
      "-U",
      "postgres",
      "--exit-on-error",
      "--single-transaction",
      "--dbname=postgres",
    ],
    database,
  );
  database.fill(0);
  assert.equal(await sql("SELECT id FROM winesnap_local.installation"), originalInstallation);
  phase = "compare_database_manifest";
  const restored = validateOwnedManifest(
    JSON.parse(
      await sql(
        await readFile(
          new URL("../config/owned-windows/backup-manifest.sql", import.meta.url),
          "utf8",
        ),
      ),
    ),
  );
  for (const section of Object.keys(bundle.manifest.database.catalog)) {
    phase = `compare_catalog_${section}`;
    assert.equal(restored.catalog[section], bundle.manifest.database.catalog[section]);
  }
  phase = "compare_all_table_rows";
  assert.deepEqual(restored.relations, bundle.manifest.database.relations);
  report.tablesVerified = restored.relations.length;
  report.authHashesAndIdentitiesMatched = true;
  report.grantsPoliciesAndFunctionsMatched = true;
  report.allTableRowsAndShareIdsMatched = true;
  phase = "restored_services";
  const dbUrl = (role) => `postgres://${role}:${password}@${names.db}:5432/postgres`;
  const jwt = (role) => recoveryToken(signingSecret, role);
  const bearer = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  await start("probe", images.probe, "node", {
    entrypoint: "node",
    args: ["--eval", "setInterval(()=>{},60000)"],
  });
  await start("auth", images.auth, "1000:1000", {
    tmpfs: ["/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000"],
    env: {
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_DATABASE_URL: dbUrl("supabase_auth_admin"),
      GOTRUE_DB_NAMESPACE: "auth",
      API_EXTERNAL_URL: `http://${names.auth}:9999`,
      GOTRUE_SITE_URL: "http://example.test",
      GOTRUE_JWT_SECRET: signingSecret,
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
      GOTRUE_JWT_EXP: "3600",
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "false",
      GOTRUE_DISABLE_SIGNUP: "true",
      GOTRUE_LOG_LEVEL: "error",
    },
  });
  await start("rest", images.rest, "65534:65534", {
    env: {
      PGRST_DB_URI: dbUrl("authenticator"),
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: signingSecret,
      PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions",
      PGRST_LOG_LEVEL: "crit",
      PGRST_DB_POOL: "3",
      PGRST_SERVER_PORT: "3000",
    },
  });
  await start("storage", images.storage, "1000:1000", {
    tmpfs: [
      "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000",
      "/var/lib/storage:rw,nosuid,nodev,noexec,size=128m,uid=1000,gid=1000,mode=0700",
    ],
    env: {
      DATABASE_URL: dbUrl("supabase_storage_admin"),
      AUTH_JWT_SECRET: signingSecret,
      ANON_KEY: jwt("anon"),
      SERVICE_KEY: jwt("service_role"),
      POSTGREST_URL: `http://${names.rest}:3000`,
      STORAGE_BACKEND: "file",
      FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
      TENANT_ID: "winesnap-owned",
      REGION: "local",
      GLOBAL_S3_BUCKET: "winesnap-owned",
      FILE_SIZE_LIMIT: "10485760",
      ENABLE_IMAGE_TRANSFORMATION: "false",
      LOG_LEVEL: "error",
    },
  });
  for (const [service, path] of [
    ["auth", "/health"],
    ["rest", "/"],
    ["storage", "/status"],
  ])
    await ready(async () => assert.equal((await request(service, path)).status, 200));
  phase = "restore_image_files";
  await command(
    [
      "exec",
      "--interactive",
      names.storage,
      "tar",
      "--extract",
      "--file=-",
      "--directory=/var/lib/storage",
      "--no-same-owner",
    ],
    storage,
  );
  storage.fill(0);
  const copied = await command([
    "exec",
    names.storage,
    "tar",
    "-cf",
    "-",
    "-C",
    "/var/lib/storage",
    ".",
  ]);
  assert.deepEqual(await inspectOwnedTar(copied), bundle.manifest.files);
  copied.fill(0);
  report.storageFilesVerified = bundle.manifest.files.length;
  phase = "verify_restored_image_downloads";
  const objects = JSON.parse(
    await sql(
      "SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)),'[]'::jsonb)::text FROM storage.objects",
    ),
  );
  assert.ok(objects.length <= 4096);
  for (const object of objects) {
    const path = `${encodeURIComponent(object.bucket)}/${object.path.split("/").map(encodeURIComponent).join("/")}`;
    const image = await request("storage", `/object/${path}`, {
      headers: bearer(jwt("service_role")),
    });
    assert.equal(image.status, 200);
    assert.ok(
      bundle.manifest.files.some(
        (file) => file.bytes === image.bytes.length && file.sha256 === sha256(image.bytes),
      ),
    );
    assert.ok(
      [400, 401, 403, 404].includes((await request("storage", `/object/public/${path}`)).status),
    );
  }
  report.restoredObjectsDownloaded = objects.length;
  phase = "restored_auth_and_jwt_rls";
  const email = `owned-restore-${run}@example.test`,
    loginPassword = randomBytes(32).toString("hex");
  const created = await request("auth", "/admin/users", {
    method: "POST",
    headers: bearer(jwt("service_role")),
    body: JSON.stringify({ email, password: loginPassword, email_confirm: true }),
  });
  assert.ok([200, 201].includes(created.status));
  const login = await request("auth", "/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: loginPassword }),
  });
  assert.equal(login.status, 200);
  const session = login.json();
  assert.equal(session.user.id, created.json().id);
  const wrong = await request("auth", "/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: randomBytes(32).toString("hex") }),
  });
  assert.ok([400, 401, 422].includes(wrong.status));
  const hidden = await request("rest", "/wines?select=id&is_public=eq.false", {
    headers: bearer(session.access_token),
  });
  assert.equal(hidden.status, 200);
  assert.deepEqual(hidden.json(), []);
  report.syntheticCloneLoginAndWrongPassword = true;
  report.restoredOwnerIsolationWithRealJwt = true;
  report.originalUserPasswordsEnteredOrReset = false;
  report.isolatedOwnedRestoreVerified = true;
  report.completed = true;
} catch (error) {
  report.completed = false;
  report.failure = "owned_restore_not_accepted";
  report.phase = phase;
  if (
    [
      "container_stopped",
      "permission_denied",
      "missing_file",
      "missing_database_object",
      "command_failed",
      "data_directory_permissions",
      "database_already_exists",
      "database_memory_limit",
      "database_init_args",
      "database_connection",
    ].includes(error.category)
  )
    report.errorCategory = error.category;
  if (error.code === "ERR_ASSERTION") report.errorCategory = "isolation_or_content_assertion";
  process.exitCode = 1;
} finally {
  let clean = true;
  for (const name of resources.reverse()) {
    try {
      const found = (await json(["inspect", name]))[0];
      assertOwnedRestoreContainer(found, names, run);
      await command(["rm", "--force", name]);
    } catch {
      clean = false;
    }
  }
  if (network)
    try {
      const net = (await json(["network", "inspect", names.network]))[0];
      assert.equal(net.Internal, true);
      assert.equal(net.Labels["winesnap.scope"], ownedRestoreScope);
      assert.equal(net.Labels["winesnap.restore"], run);
      await command(["network", "rm", names.network]);
    } catch {
      clean = false;
    }
  report.cleanupCompleted = clean;
  if (!clean) {
    report.completed = false;
    process.exitCode = 1;
  }
  console.log(JSON.stringify(report));
}
