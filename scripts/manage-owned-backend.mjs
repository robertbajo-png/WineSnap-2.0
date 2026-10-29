import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ownedProject,
  ownedScope,
  ownedNetwork,
  ownedEgress,
  ownedApp,
  ownedApi,
  ownedServices,
  validateOwnedKeys,
  ownedToken,
  checkOwnedContainer,
} from "./lib/owned-backend.mjs";
import { ownedResumeOrder, planOwnedMigrations } from "./lib/owned-lifecycle.mjs";
import { selectOwnedPublicOrigin } from "./lib/owned-public-origin.mjs";

assert.equal(process.env.WINESNAP_OWNED_PIPE, "1");
assert.ok(!process.stdout.isTTY && !process.stdin.isTTY);
const action = process.argv[2];
assert.ok(
  [
    "Start",
    "Resume",
    "RestartApp",
    "Verify",
    "Backup",
    "Update",
    "Accept",
    "Features",
    "FeaturesAi",
    "Offline",
    "BrowserPrepare",
    "BrowserInspect",
    "BrowserConflict",
    "BrowserMemory",
    "BrowserCleanup",
    "Maintain",
  ].includes(action),
);
assert.equal(process.argv.length, 3);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const baseEnv = Object.fromEntries(
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
let phase = "input";
let keys;
let archive;
let paused = [];
const startedAt = performance.now();
const deadline = startedAt + 16 * 60 * 1000;
let recovering = false;
const report = {
  project: ownedProject,
  completed: false,
  productionTouched: false,
  hostedTestTouched: false,
  app: ownedApp,
  api: ownedApi,
  mail: "http://127.0.0.1:8026",
  localOnly: true,
};
const command = (args, input, extraEnv = {}, timeout = 180000) =>
  new Promise((resolve, reject) => {
    const remaining = recovering
      ? Math.min(timeout, 15000)
      : Math.floor(deadline - performance.now());
    if (remaining <= 0) return reject(new Error("owned_operation_deadline"));
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        env: { ...baseEnv, ...extraEnv },
        encoding: "buffer",
        maxBuffer: 128 * 1024 * 1024,
        timeout: Math.min(timeout, remaining),
        windowsHide: true,
      },
      (error, stdout) =>
        error ? reject(new Error("owned_backend_operation_failed")) : resolve(stdout),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
const json = async (args) => JSON.parse((await command(args)).toString());
const name = (service) => `winesnap-owned-${service}`;
const labelArgs = () => [
  "--label",
  `winesnap.scope=${ownedScope}`,
  "--label",
  `winesnap.installation=${keys.installationId}`,
];
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
const digest = (s) => createHash("sha256").update(s).digest("hex");
async function existing(service) {
  const value = (
    await command(["ps", "--all", "--filter", `name=^/${name(service)}$`, "--format", "{{.ID}}"])
  )
    .toString()
    .trim();
  if (!value) return null;
  const found = (await json(["inspect", value]))[0];
  checkOwnedContainer(found, name(service), keys.installationId);
  return found;
}
async function sql(source) {
  return (
    await command(
      [
        "exec",
        "--interactive",
        name("db"),
        "psql",
        "-h",
        "/tmp",
        "-X",
        "-q",
        "-A",
        "-t",
        "-U",
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
async function wait(check) {
  for (let i = 0; i < 60; i++) {
    try {
      return await check();
    } catch {
      if (i === 59) throw new Error();
      await new Promise((done) => setTimeout(done, 500));
    }
  }
}
async function ensureNetwork(network, internal) {
  const names = (
    await command(["network", "ls", "--filter", `name=^${network}$`, "--format", "{{.Name}}"])
  )
    .toString()
    .trim();
  if (!names)
    await command([
      "network",
      "create",
      ...(internal ? ["--internal"] : []),
      ...labelArgs(),
      network,
    ]);
  const value = (await json(["network", "inspect", network]))[0];
  assert.equal(value.Name, network);
  assert.equal(value.Internal, internal);
  assert.equal(value.Labels["winesnap.scope"], ownedScope);
  assert.equal(value.Labels["winesnap.installation"], keys.installationId);
}
async function volume(suffix, uid, image) {
  const volumeName = `winesnap-owned-${suffix}`;
  const list = (
    await command(["volume", "ls", "--filter", `name=^${volumeName}$`, "--format", "{{.Name}}"])
  )
    .toString()
    .trim();
  if (!list) await command(["volume", "create", ...labelArgs(), volumeName]);
  const value = (await json(["volume", "inspect", volumeName]))[0];
  assert.equal(value.Name, volumeName);
  assert.equal(value.Labels["winesnap.scope"], ownedScope);
  assert.equal(value.Labels["winesnap.installation"], keys.installationId);
  // Only the root directory of our named volume is initialized. No recursive
  // host filesystem operation, database reset or volume deletion is supported.
  await command([
    "run",
    "--rm",
    "--log-driver",
    "none",
    "--network",
    "none",
    "--read-only",
    "--user",
    "0",
    ...labelArgs(),
    "--cap-drop",
    "ALL",
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "FOWNER",
    "--security-opt",
    "no-new-privileges:true",
    "--mount",
    `type=volume,source=${volumeName},target=/data`,
    "--entrypoint",
    "/bin/sh",
    image,
    "-c",
    `chown ${uid}:${uid} /data && chmod 700 /data`,
  ]);
}
async function start(
  service,
  image,
  {
    user = "1000:1000",
    env = {},
    mounts = [],
    port,
    memory = "256m",
    args = [],
    entrypoint,
    configHash,
    publicOrigin,
  } = {},
) {
  let found = await existing(service);
  if (found && configHash && found.Config.Labels["winesnap.config"] !== configHash) {
    assert.ok(["gateway", "auth"].includes(service));
    await command(["rm", "--force", name(service)]);
    found = null;
  }
  if (found) {
    if (!found.State.Running) await command(["start", name(service)]);
    return;
  }
  const argv = [
    "create",
    "--name",
    name(service),
    ...labelArgs(),
    ...(configHash ? ["--label", `winesnap.config=${configHash}`] : []),
    ...(publicOrigin ? ["--label", `winesnap.public-origin=${publicOrigin}`] : []),
    "--network",
    ownedNetwork,
    "--restart",
    "unless-stopped",
    "--read-only",
    "--user",
    user,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    memory,
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--log-driver",
    "none",
    "--tmpfs",
    `/tmp:rw,nosuid,nodev,noexec,size=32m,uid=${user === "postgres" ? 999 : user === "node" ? 1000 : user.split(":")[0]},mode=0700`,
    ...(service === "db"
      ? ["--tmpfs", "/var/run/postgresql:rw,nosuid,nodev,noexec,size=1m,uid=999,gid=999,mode=0770"]
      : []),
    ...mounts.flatMap((mount) => ["--mount", mount]),
    ...(port
      ? (Array.isArray(port) ? port : [port]).flatMap((value) => [
          "--publish",
          `127.0.0.1:${value}`,
        ])
      : []),
    ...Object.keys(env).flatMap((key) => ["--env", key]),
    ...(entrypoint ? ["--entrypoint", entrypoint] : []),
    image,
    ...args,
  ];
  await command(argv, undefined, env);
  if (["web", "gateway"].includes(service))
    await command(["network", "connect", ownedEgress, name(service)]);
  await command(["start", name(service)]);
  checkOwnedContainer(
    (await json(["inspect", name(service)]))[0],
    name(service),
    keys.installationId,
  );
}
async function request(path, { method = "GET", token, body, headers = {} } = {}) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  const response = await fetch(ownedApi + path, {
    method,
    headers: {
      apikey: ownedToken(keys, "anon"),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  return response;
}
async function installWebKeys() {
  const payload = {
    version: 1,
    project: ownedProject,
    publishable: ownedToken(keys, "anon"),
    secret: ownedToken(keys, "service_role"),
    cronSecret: keys.cronSecret,
    privacyCronSecret: keys.privacyCronSecret,
    ...(keys.openai ? { openai: keys.openai } : {}),
    ...(keys.gemini ? { gemini: keys.gemini } : {}),
  };
  const code = `import{mkdir,writeFile,rename,lstat}from'node:fs/promises';
    let s='';for await(const c of process.stdin){s+=c;if(s.length>16384)throw Error();}
    const p='/tmp/winesnap-ai';await mkdir(p,{recursive:true,mode:448});
    const f=await lstat(p);if(f.isSymbolicLink()||f.uid!==process.getuid()||(f.mode&63))throw Error();
    const n=p+'/pending.json';await writeFile(n,s,{mode:384});await rename(n,p+'/credentials.json');`;
  await command(
    ["exec", "--interactive", name("web"), "node", "--input-type=module", "--eval", code],
    JSON.stringify(payload),
  );
}
async function verify() {
  for (const service of [...Object.keys(ownedServices), "web"]) {
    const value = await existing(service);
    assert.ok(value?.State.Running);
  }
  assert.equal(await sql("SELECT id FROM winesnap_local.installation"), keys.installationId);
  assert.equal((await request("/auth/v1/health")).status, 200);
  assert.equal((await request("/storage/v1/status")).status, 200);
  assert.equal((await request("/rest/v1/")).status, 200);
  assert.equal(
    (
      await fetch(ownedApp + "/api/health", {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      })
    ).status,
    200,
  );
  await installWebKeys();
  report.database = true;
  report.auth = true;
  report.storage = true;
  report.application = true;
  report.emailDelivery = "local-inbox-only";
}

try {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    assert.ok(bytes <= 32768);
    chunks.push(chunk);
  }
  keys = validateOwnedKeys(JSON.parse(Buffer.concat(chunks).toString()));
  for (const chunk of chunks) chunk.fill(0);
  phase = "local_engine";
  assert.equal(
    (await command(["version", "--format", "{{.Server.Os}}"], undefined, {}, 10000))
      .toString()
      .trim(),
    "linux",
  );
  const images = {};
  for (const [service, tag] of Object.entries(ownedServices)) {
    images[service] = (await command(["image", "inspect", tag, "--format", "{{.Id}}"]))
      .toString()
      .trim();
    assert.match(images[service], /^sha256:[a-f0-9]{64}$/);
  }
  const installedWeb = await existing("web");
  const originSettings = selectOwnedPublicOrigin({
    requested: process.env.WINESNAP_OWNED_PUBLIC_ORIGIN,
    reset: process.env.WINESNAP_OWNED_ORIGIN_RESET,
    installed: installedWeb?.Config.Labels["winesnap.public-origin"] ?? "",
    action,
  });
  report.browserPublicOrigin = originSettings.origin || null;
  if (action === "Resume") {
    phase = "resume_existing_installation";
    // Require every exact installed container before starting any of them.
    const containers = [];
    for (const service of ownedResumeOrder) {
      const value = await existing(service);
      assert.ok(value, "Installed container is missing; explicit setup is required");
      containers.push([service, value]);
    }
    for (const [service, value] of containers)
      if (!value.State.Running) await command(["start", name(service)]);
    await wait(() => verify());
    report.resumedExistingInstallation = true;
  }
  if (action === "Start" || action === "Update") {
    phase = "owned_networks_and_volumes";
    await ensureNetwork(ownedNetwork, true);
    await ensureNetwork(ownedEgress, false);
    await volume("database", 999, images.db);
    await volume("images", 1000, images.db);
    await volume("mail", 1000, images.db);
    phase = "database";
    await start("db", images.db, {
      user: "postgres",
      memory: "512m",
      env: {
        POSTGRES_PASSWORD: keys.dbPassword,
        POSTGRES_HOST_AUTH_METHOD: "scram-sha-256",
        POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=trust",
      },
      mounts: ["type=volume,source=winesnap-owned-database,target=/var/lib/postgresql/data"],
      args: [
        "postgres",
        "-c",
        "shared_buffers=64MB",
        "-c",
        "max_connections=60",
        "-c",
        "unix_socket_directories=/tmp,/var/run/postgresql",
      ],
    });
    // All admin SQL stays on the local container socket, never a remote URL.
    const originalSql = sql;
    // The vendor init server is socket-only; wait for the final TCP listener.
    await wait(() =>
      command(["exec", name("db"), "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]),
    );
    // psql uses the same private socket, without a host password file.
    phase = "database_identity";
    const hasSchema = (
      await command(
        ["exec", "--interactive", name("db"), "psql", "-h", "/tmp", "-X", "-At", "-U", "postgres"],
        "SELECT to_regclass('winesnap_local.installation') IS NOT NULL",
      )
    )
      .toString()
      .trim();
    if (hasSchema === "f") {
      const empty = (
        await command(
          [
            "exec",
            "--interactive",
            name("db"),
            "psql",
            "-h",
            "/tmp",
            "-X",
            "-At",
            "-U",
            "postgres",
          ],
          "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
        )
      )
        .toString()
        .trim();
      assert.equal(empty, "0");
      await originalSql(
        await readFile(new URL("../config/owned-windows/platform.sql", import.meta.url), "utf8"),
      );
      await sql(`INSERT INTO winesnap_local.installation VALUES('${keys.installationId}')`);
    }
    assert.equal(await sql("SELECT id FROM winesnap_local.installation"), keys.installationId);
    await sql(
      ["authenticator", "supabase_auth_admin", "supabase_storage_admin"]
        .map((role) => `ALTER ROLE ${role} PASSWORD '${keys.dbPassword}';`)
        .join("\n"),
    );
    const dbUrl = (role) => `postgres://${role}:${keys.dbPassword}@${name("db")}:5432/postgres`;
    phase = "mail";
    await start("mail", images.mail, {
      env: {
        MP_DATABASE: "/data/mailpit.db",
        MP_MAX_MESSAGES: "100",
        MP_MAX_AGE: "7d",
        MP_DISABLE_VERSION_CHECK: "true",
        MP_QUIET: "true",
      },
      mounts: ["type=volume,source=winesnap-owned-mail,target=/data"],
      memory: "128m",
    });
    phase = "auth";
    await start("auth", images.auth, {
      configHash: digest(originSettings.authConfig),
      env: {
        GOTRUE_API_HOST: "0.0.0.0",
        GOTRUE_API_PORT: "9999",
        GOTRUE_DB_DRIVER: "postgres",
        GOTRUE_DB_DATABASE_URL: dbUrl("supabase_auth_admin"),
        GOTRUE_DB_NAMESPACE: "auth",
        ...originSettings.auth,
        GOTRUE_JWT_SECRET: keys.jwtSecret,
        GOTRUE_JWT_AUD: "authenticated",
        GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
        GOTRUE_JWT_EXP: "3600",
        GOTRUE_JWT_ADMIN_ROLES: "service_role",
        GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
        GOTRUE_MAILER_AUTOCONFIRM: "false",
        GOTRUE_DISABLE_SIGNUP: "false",
        GOTRUE_PASSWORD_MIN_LENGTH: "12",
        GOTRUE_SMTP_HOST: name("mail"),
        GOTRUE_SMTP_PORT: "1025",
        GOTRUE_SMTP_ADMIN_EMAIL: "no-reply@winesnap.local",
        GOTRUE_SMTP_SENDER_NAME: "WineSnap Local",
        GOTRUE_SMTP_MAX_FREQUENCY: "1s",
        GOTRUE_RATE_LIMIT_EMAIL_SENT: "60",
        GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify",
        GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
        GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: "/auth/v1/verify",
        GOTRUE_LOG_LEVEL: "error",
      },
    });
    await wait(async () =>
      assert.equal(await sql("SELECT to_regclass('auth.users') IS NOT NULL"), "t"),
    );
    phase = "storage";
    await start("storage", images.storage, {
      memory: "512m",
      env: {
        DATABASE_URL: dbUrl("supabase_storage_admin"),
        AUTH_JWT_SECRET: keys.jwtSecret,
        ANON_KEY: ownedToken(keys, "anon"),
        SERVICE_KEY: ownedToken(keys, "service_role"),
        POSTGREST_URL: `http://${name("rest")}:3000`,
        STORAGE_BACKEND: "file",
        FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
        TENANT_ID: "winesnap-owned",
        REGION: "local",
        GLOBAL_S3_BUCKET: "winesnap-owned",
        FILE_SIZE_LIMIT: "10485760",
        ENABLE_IMAGE_TRANSFORMATION: "false",
        LOG_LEVEL: "error",
      },
      mounts: ["type=volume,source=winesnap-owned-images,target=/var/lib/storage"],
    });
    await wait(async () =>
      assert.equal(
        await sql("SELECT to_regprocedure('storage.allow_any_operation(text[])') IS NOT NULL"),
        "t",
      ),
    );
    phase = "local_auth_context";
    await sql(
      await readFile(new URL("../config/owned-windows/auth-helpers.sql", import.meta.url), "utf8"),
    );
    phase = "application_migrations";
    const migrations = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const sources = [];
    for (const file of migrations)
      sources.push({
        name: file,
        source: await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
      });
    const applied = JSON.parse(
      await sql(
        "SELECT COALESCE(json_agg(json_build_object('name',name,'sha256',sha256) ORDER BY name),'[]'::json) FROM winesnap_local.migrations",
      ),
    );
    const pending = planOwnedMigrations(sources, applied);
    for (const item of pending) {
      phase = `migration:${item.name}`;
      await sql(
        `BEGIN;\n${item.source}\nINSERT INTO winesnap_local.migrations(name,sha256) VALUES(${literal(item.name)},'${item.sha256}'); COMMIT;`,
      );
    }
    report.migrations = { previouslyApplied: applied.length, newlyApplied: pending.length };
    phase = "owned_access_gates";
    const policy = "Wine labels use revocable image proxy";
    const exists = await sql(
      `SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND policyname=${literal(policy)}`,
    );
    if (exists === "0")
      await sql(`CREATE POLICY "${policy}" ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
      USING(bucket_id<>'wine-labels' OR storage.allow_any_operation(ARRAY['object.list','object.list_v2','object.upload','object.upload_update','object.delete','object.delete_many']));`);
    await sql(
      "UPDATE public.kitchen_config SET enabled=true,chef_enabled=true,meals_enabled=true WHERE id=true",
    );
    phase = "rest";
    await start("rest", images.rest, {
      user: "65534:65534",
      env: {
        PGRST_DB_URI: dbUrl("authenticator"),
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: keys.jwtSecret,
        PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions",
        PGRST_DB_POOL: "5",
        PGRST_SERVER_PORT: "3000",
        PGRST_LOG_LEVEL: "crit",
      },
    });
    phase = "gateway";
    await start("gateway", images.gateway, {
      configHash: digest(
        await readFile(new URL("../config/owned-windows/nginx.conf", import.meta.url)),
      ),
      user: "101",
      memory: "64m",
      port: ["54323:8080", "8026:8081"],
      mounts: [
        `type=bind,source=${fileURLToPath(new URL("../config/owned-windows/nginx.conf", import.meta.url))},target=/etc/nginx/nginx.conf,readonly`,
      ],
      entrypoint: "nginx",
      args: ["-g", "daemon off;"],
    });
    await wait(async () => assert.equal((await request("/auth/v1/health")).status, 200));
    phase = "web_build";
    let web = await existing("web");
    if (!web || action === "Update") {
      const flags = {
        ...originSettings.build,
        VITE_OWNED_BACKEND_ENABLED: "true",
        VITE_SUPABASE_URL: ownedApi,
        VITE_SUPABASE_PUBLISHABLE_KEY: ownedToken(keys, "anon"),
        VITE_WINE_IMAGE_PROXY_ENABLED: "true",
        VITE_LOCAL_AI_ENABLED: "true",
        VITE_COOKING_CORE_ENABLED: "true",
        VITE_AI_CHEF_ENABLED: "true",
        VITE_MEALS_ENABLED: "true",
        VITE_RECIPE_NUTRITION_ENABLED: "true",
        VITE_PRIVACY_CONTROLS_ENABLED: "true",
        VITE_PRIVACY_OPERATIONS_VERIFIED: "true",
        VITE_PRIVACY_SUPPLIERS_VERIFIED: "false",
      };
      await command(
        [
          "build",
          "--tag",
          "winesnap-owned:local",
          ...Object.entries(flags).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]),
          "--file",
          "Dockerfile",
          ".",
        ],
        undefined,
        {},
        600000,
      );
      if (web) await command(["rm", "--force", name("web")]);
    }
    const webImage = (
      await command(["image", "inspect", "winesnap-owned:local", "--format", "{{.Id}}"])
    )
      .toString()
      .trim();
    phase = "web_start";
    await start("web", webImage, {
      user: "node",
      publicOrigin: originSettings.origin,
      memory: "768m",
      port: "5212:3000",
      env: {
        SUPABASE_URL: "http://winesnap-owned-gateway:8080",
        SUPABASE_PUBLISHABLE_KEY: ownedToken(keys, "anon"),
        WINESNAP_OWNED_BACKEND_ENABLED: "true",
        WINESNAP_LOCAL_AI_ENABLED: "true",
        WINESNAP_LOCAL_OPERATIONS_ENABLED: "true",
        WINESNAP_COOKING_CORE_ENABLED: "true",
        WINESNAP_AI_CHEF_ENABLED: "true",
        WINESNAP_MEALS_ENABLED: "true",
        WINESNAP_LOCAL_RETAIL_MIRROR_ENABLED: "true",
        NODE_OPTIONS: "--max-old-space-size=384",
      },
    });
    await wait(async () =>
      assert.equal(
        (await fetch(ownedApp + "/api/health", { signal: AbortSignal.timeout(3000) })).status,
        200,
      ),
    );
  }
  phase = "verification";
  await verify();
  if (action === "RestartApp") {
    phase = "restart_owned_application";
    await existing("web");
    await command(["restart", name("web")]);
    await wait(() => verify());
    report.restartedApplication = true;
  }
  if (action.startsWith("Browser") || action === "Offline") {
    const { ownedBrowserFixture, validateBrowserFixture } =
      await import("./lib/owned-browser-fixture.mjs");
    const manifestPath = join(process.env.USERPROFILE, "WineSnapOwned", "browser-fixture.json");
    let fixture;
    try {
      const info = await lstat(manifestPath);
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 16384);
      fixture = validateBrowserFixture(JSON.parse(await readFile(manifestPath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    phase = `browser_${action.slice(7).toLowerCase()}`;
    if (["BrowserPrepare", "Offline"].includes(action) && fixture) {
      // Refuse to overwrite a live fixture's cleanup manifest.
      const existing = await ownedBrowserFixture(keys, "absent", fixture);
      assert.equal(existing.alreadyClean, true);
    }
    const remember = async (created) => {
      // The private directory/operation lock belongs to the Windows wrapper.
      // Keep this cleanup manifest independent of success/failure reports.
      await writeFile(manifestPath, JSON.stringify(validateBrowserFixture(created)), {
        flag: fixture ? "w" : "wx",
        mode: 0o600,
      });
    };
    if (action === "Offline") {
      const { acceptOwnedOffline } = await import("./lib/owned-offline.mjs");
      report.offline = await acceptOwnedOffline(keys, {
        fixture,
        remember,
        artifactDirectory: fileURLToPath(new URL("../dist/owned-offline", import.meta.url)),
        progress(step) {
          assert.match(step, /^[a-z_]+$/);
          phase = `offline_${step}`;
        },
      });
      assert.equal(report.offline.completed, true);
    } else {
      report.browser = await ownedBrowserFixture(
        keys,
        action.slice(7).toLowerCase(),
        fixture,
        remember,
      );
    }
  }
  if (["Features", "FeaturesAi"].includes(action)) {
    const { acceptOwnedFeatures } = await import("./lib/owned-features.mjs");
    report.features = await acceptOwnedFeatures(keys, {
      liveAi: action === "FeaturesAi",
      progress(step) {
        assert.match(step, /^[a-z_]+$/);
        phase = `features_${step}`;
      },
    });
    assert.equal(report.features.completed, true);
  }
  if (action === "Accept") {
    const { acceptOwnedBackend } = await import("./lib/owned-acceptance.mjs");
    report.acceptance = await acceptOwnedBackend(
      keys,
      async () => {
        for (const service of ["web", "rest", "auth", "storage"]) {
          await existing(service);
          await command(["stop", name(service)]);
          paused.push(service);
        }
        await command(["restart", name("db")]);
        await wait(() => sql("SELECT 1"));
        for (const service of paused.reverse()) await command(["start", name(service)]);
        paused = [];
        await wait(() => verify());
      },
      (step) => {
        assert.match(step, /^[a-z_]+$/);
        phase = `acceptance_${step}`;
      },
    );
  }
  if (action === "Maintain") {
    report.jobs = {};
    for (const [job, path, headers, body] of [
      [
        "privacy",
        "/api/privacy/privacy-maintenance",
        { authorization: `Bearer ${keys.privacyCronSecret}` },
        { execute: true },
      ],
      [
        "prices",
        "/api/public/hooks/check-wishlist-prices",
        { "x-cron-secret": keys.cronSecret },
        {},
      ],
    ]) {
      const response = await fetch(ownedApp + path, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(180000),
      });
      const data = await response.json();
      const result = {
        status: response.status,
        failed: data.failed ?? data.failures ?? 0,
        remaining: data.remaining ?? (data.more_work ? 1 : 0),
      };
      report.jobs[job] = result;
      assert.equal(result.status, 200);
      assert.equal(result.failed, 0);
      assert.equal(result.remaining, 0);
    }
  }
  if (action === "Backup") {
    phase = "quiesce_local_writers";
    for (const service of ["web", "rest", "auth", "storage"]) {
      await command(["stop", name(service)]);
      paused.push(service);
    }
    phase = "database_archive";
    const dump = await command([
      "exec",
      name("db"),
      "pg_dump",
      "-h",
      "/tmp",
      "-U",
      "postgres",
      "--format=custom",
      "postgres",
    ]);
    const roles = await command([
      "exec",
      name("db"),
      "pg_dumpall",
      "-h",
      "/tmp",
      "-U",
      "postgres",
      "--roles-only",
      "--no-role-passwords",
    ]);
    phase = "image_archive";
    const imagesTar = await command([
      "run",
      "--rm",
      "--log-driver",
      "none",
      "--network",
      "none",
      "--read-only",
      "--user",
      "1000:1000",
      ...labelArgs(),
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--mount",
      "type=volume,source=winesnap-owned-images,target=/data,readonly",
      "--entrypoint",
      "tar",
      images.db,
      "--xattrs",
      "--acls",
      "--numeric-owner",
      "-C",
      "/data",
      "-cf",
      "-",
      ".",
    ]);
    phase = "backup_manifest";
    const { inspectOwnedTar, validateOwnedManifest, validateOwnedArchive } =
      await import("./lib/owned-recovery.mjs");
    const manifest = {
      database: validateOwnedManifest(
        JSON.parse(
          await sql(
            await readFile(
              new URL("../config/owned-windows/backup-manifest.sql", import.meta.url),
              "utf8",
            ),
          ),
        ),
      ),
      files: await inspectOwnedTar(imagesTar),
    };
    const configuration = { ...keys };
    delete configuration.openai;
    delete configuration.gemini;
    const part = (bytes) => ({ base64: bytes.toString("base64"), sha256: digest(bytes) });
    archive = {
      version: 2,
      project: ownedProject,
      createdAt: new Date().toISOString(),
      configuration,
      database: part(dump),
      roles: part(roles),
      storage: part(imagesTar),
      images,
      writeQuiesced: true,
      manifest,
    };
    validateOwnedArchive(archive);
    report.backupIncludesAuthHashes = true;
    report.backupIncludesImageBytes = true;
  }
  report.completed = true;
} catch (error) {
  report.failure = "owned_backend_not_ready";
  if (
    [
      "null_aggregate_key",
      "json_object_expected",
      "role_configuration",
      "parameter_configuration",
    ].includes(error?.category)
  )
    report.errorCategory = error.category;
  if (typeof error?.code === "string" && /^[A-Z0-9_]{3,12}$/.test(error.code))
    report.errorCode = error.code;
  report.phase = phase;
  process.exitCode = 1;
} finally {
  recovering = true;
  for (const service of paused.reverse()) {
    try {
      await command(["start", name(service)]);
    } catch {
      report.completed = false;
      process.exitCode = 1;
    }
  }
  if (paused.length)
    try {
      await wait(() => verify());
    } catch {
      report.completed = false;
      process.exitCode = 1;
    }
  report.elapsedMs = Math.round(performance.now() - startedAt);
  console.log(
    JSON.stringify(
      archive && report.completed
        ? { archive, report }
        : { ...report, checkedAt: new Date().toISOString() },
    ),
  );
}
