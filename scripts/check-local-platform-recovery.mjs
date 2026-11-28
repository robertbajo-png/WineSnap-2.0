import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import {
  assertSandbox,
  binaryPart,
  checkBinaryPart,
  recoveryImages,
  recoveryLimit,
  recoveryNames,
  recoveryProject,
  recoveryScope,
  recoveryToken,
  sha256,
  validatePlatformBundle,
} from "./lib/platform-recovery.mjs";

assert.equal(process.argv.length, 3);
assert.equal(process.env.WINESNAP_PLATFORM_PRIVATE_IO, "1");
assert.ok(!process.stdout.isTTY && !process.stdin.isTTY);
const mode = process.argv[2];
assert.ok(["create", "restore"].includes(mode));
const invocation = process.env.WINESNAP_PLATFORM_ID;
const names = recoveryNames(invocation);
const docker = `${process.env.LOCALAPPDATA}/Programs/DockerDesktop/resources/bin/docker.exe`;
const resources = [];
let network = false;
let phase = "engine";
let bundle;
const report = {
  project: recoveryProject,
  completed: false,
  productionTouched: false,
  hostedTestExport: false,
  fullPlatformRecoveryVerified: false,
  scope: "synthetic local PostgreSQL + real Supabase Auth/Storage; not a hosted export",
  cleanupCompleted: false,
};
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

function command(args, input, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      docker,
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      {
        timeout,
        maxBuffer: recoveryLimit,
        windowsHide: true,
        encoding: "buffer",
        env: environment,
      },
      (error, stdout) => (error ? reject(new Error("sandbox_command_failed")) : resolve(stdout)),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const json = async (args) => JSON.parse((await command(args)).toString());
async function sql(query) {
  return (
    await command(
      [
        "exec",
        "--interactive",
        names.database,
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
      `SET search_path=public,extensions;\n${query}`,
    )
  )
    .toString()
    .trim();
}
async function startContainer(name, image, user, extra, entrypoint) {
  // Register the name before create/start so partial failures are cleaned too.
  resources.push(name);
  await command([
    "create",
    "--name",
    name,
    "--label",
    `winesnap.scope=${recoveryScope}`,
    "--network",
    names.network,
    "--read-only",
    "--user",
    user,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "96",
    "--log-driver",
    "none",
    ...extra,
    ...(entrypoint ? ["--entrypoint", entrypoint] : []),
    image,
    ...(entrypoint === "node" ? ["--eval", "setInterval(()=>{},60000)"] : []),
  ]);
  await command(["start", name]);
  assertSandbox((await json(["inspect", name]))[0], names);
}
const httpCode = `
let input=''; for await(const chunk of process.stdin) input+=chunk;
const req=JSON.parse(input);
const url=new URL(req.url);
if(!/^winesnap-platform-[a-f0-9]{16}-(auth|storage)$/.test(url.hostname)) process.exit(2);
const response=await fetch(url,{method:req.method??'GET',headers:req.headers,
 body:req.base64?Buffer.from(req.base64,'base64'):req.body,redirect:'error',signal:AbortSignal.timeout(15000)});
const bytes=Buffer.from(await response.arrayBuffer());
if(bytes.length>8*1024*1024) process.exit(3);
console.log(JSON.stringify({status:response.status,base64:bytes.toString('base64')}));`;
async function request(service, path, options = {}) {
  assert.ok(["auth", "storage"].includes(service));
  const port = service === "auth" ? 9999 : 5000;
  const raw = await command(
    ["exec", "--interactive", names.probe, "node", "--input-type=module", "--eval", httpCode],
    JSON.stringify({ url: `http://${names[service]}:${port}${path}`, ...options }),
  );
  const result = JSON.parse(raw.toString());
  result.bytes = Buffer.from(result.base64, "base64");
  result.json = () => JSON.parse(result.bytes.toString());
  return result;
}
async function ready(service) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (service === "database") await sql("SELECT 1");
      else
        assert.equal(
          (await request(service, service === "auth" ? "/health" : "/status")).status,
          200,
        );
      return;
    } catch {
      if (attempt === 59) throw new Error("sandbox_service_not_ready");
      await new Promise((done) => setTimeout(done, 500));
    }
  }
}
async function startServices() {
  const dbUrl = (user) => `postgres://${user}:${bundle.dbPassword}@${names.database}:5432/postgres`;
  const vars = (values) =>
    Object.entries(values).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
  await startContainer(names.auth, bundle.images.auth, "1000:1000", [
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000",
    ...vars({
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_DATABASE_URL: dbUrl("supabase_auth_admin"),
      GOTRUE_DB_NAMESPACE: "auth",
      API_EXTERNAL_URL: `http://${names.auth}:9999`,
      GOTRUE_SITE_URL: "http://example.test",
      GOTRUE_JWT_SECRET: bundle.jwtSecret,
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_EXP: "3600",
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "true",
      GOTRUE_DISABLE_SIGNUP: "true",
      GOTRUE_LOG_LEVEL: "error",
    }),
  ]);
  await ready("auth");
  await startContainer(names.storage, bundle.images.storage, "1000:1000", [
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000",
    "--tmpfs",
    "/var/lib/storage:rw,nosuid,nodev,noexec,size=32m,uid=1000,gid=1000",
    ...vars({
      DATABASE_URL: dbUrl("supabase_storage_admin"),
      AUTH_JWT_SECRET: bundle.jwtSecret,
      ANON_KEY: recoveryToken(bundle.jwtSecret, "anon"),
      SERVICE_KEY: recoveryToken(bundle.jwtSecret, "service_role"),
      POSTGREST_URL: "http://127.0.0.1:9",
      STORAGE_BACKEND: "file",
      FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
      TENANT_ID: "recovery-test",
      REGION: "local",
      GLOBAL_S3_BUCKET: "recovery-test",
      FILE_SIZE_LIMIT: "1048576",
      ENABLE_IMAGE_TRANSFORMATION: "false",
      LOG_LEVEL: "error",
    }),
  ]);
  await ready("storage");
}
const bearer = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
const serviceHeaders = () => bearer(recoveryToken(bundle.jwtSecret, "service_role"));
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
async function catalogHash() {
  return sha256(
    await sql(`SELECT jsonb_build_object(
    'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY schemaname,tablename) FROM pg_tables t
      WHERE schemaname IN ('public','auth','storage')),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p
      WHERE schemaname IN ('public','auth','storage')),
    'grants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY table_schema,table_name,grantee,privilege_type)
      FROM information_schema.role_table_grants g WHERE table_schema IN ('public','auth','storage'))
  )::text`),
  );
}

async function reconcileNewerErasure() {
  phase = "restore_newer_erasure_ledger";
  const receipt = bundle.erasureReceipts[0];
  await sql(`INSERT INTO public.privacy_erasure_receipts(user_id,requested_at)
    VALUES(${literal(receipt.user_id)},${literal(receipt.requested_at)})
    ON CONFLICT (user_id) DO NOTHING;`);
  await sql(
    await readFile(
      new URL("../supabase/operations/reapply-restored-erasures.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(await sql(`SELECT public.privacy_account_active(${literal(receipt.user_id)})`), "f");
  assert.equal(
    await sql(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub"=${literal(receipt.user_id)};
    SELECT count(*) FROM public.wines; ROLLBACK;`),
    "0",
  );
  phase = "restore_erased_image_cleanup";
  const file = bundle.files[0];
  const removed = await request("storage", `/object/${file.bucket}`, {
    method: "DELETE",
    headers: serviceHeaders(),
    body: JSON.stringify({ prefixes: [file.path] }),
  });
  assert.equal(removed.status, 200);
  phase = "restore_erased_auth_cleanup";
  const deleted = await request("auth", `/admin/users/${receipt.user_id}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });
  assert.equal(deleted.status, 200);
  await sql(
    `UPDATE public.privacy_erasure_receipts SET completed_at=now() WHERE user_id=${literal(receipt.user_id)}`,
  );
  assert.equal(
    await sql(`SELECT count(*) FROM auth.users WHERE id=${literal(receipt.user_id)}`),
    "0",
  );
  assert.equal(
    await sql(`SELECT count(*) FROM public.wines WHERE user_id=${literal(receipt.user_id)}`),
    "0",
  );
  assert.equal(
    await sql(
      `SELECT count(*) FROM public.privacy_erasure_receipts WHERE user_id=${literal(receipt.user_id)} AND completed_at IS NOT NULL`,
    ),
    "1",
  );
  assert.ok(
    [400, 404].includes(
      (
        await request("storage", `/object/${file.bucket}/${file.path}`, {
          headers: serviceHeaders(),
        })
      ).status,
    ),
  );
  assert.equal(
    await sql(`SELECT count(*) FROM auth.users WHERE id=${literal(bundle.accounts[1].id)}`),
    "1",
  );
  report.newerErasureReconciled = true;
  report.erasedAccountAndImageRemoved = true;
}

async function verifyRestored() {
  phase = `${mode}_password_login`;
  const tokens = [];
  for (const account of bundle.accounts) {
    const response = await request("auth", "/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    assert.equal(response.status, 200);
    const session = response.json();
    assert.equal(session.user.id, account.id);
    assert.ok(session.access_token && session.refresh_token);
    tokens.push(session.access_token);
    const invalid = await request("auth", "/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: randomBytes(32).toString("hex") }),
    });
    assert.ok([400, 401, 422].includes(invalid.status));
  }
  report.passwordLogins = 2;
  report.invalidPasswordsRejected = 2;
  phase = `${mode}_database_rls`;
  const owner = bundle.accounts[0].id;
  const peer = bundle.accounts[1].id;
  // The actual restored policies run under authenticated, not a service bypass.
  for (const [id, expected] of [
    [owner, "1"],
    [peer, "0"],
  ]) {
    assert.equal(
      await sql(`BEGIN; SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub"=${literal(id)};
      SELECT count(*) FROM public.wines WHERE id=${literal(bundle.wineId)}; ROLLBACK;`),
      expected,
    );
  }
  report.ownerAndPeerRls = true;
  assert.equal(
    await sql(`SELECT share_id FROM public.wines WHERE id=${literal(bundle.wineId)}`),
    bundle.shareId,
  );
  report.legacySharePreserved = true;
  phase = `${mode}_storage_download`;
  const file = bundle.files[0];
  const path = `/object/${file.bucket}/${file.path}`;
  const download = await request("storage", path, { headers: serviceHeaders() });
  assert.equal(download.status, 200);
  assert.equal(sha256(download.bytes), file.sha256);
  phase = `${mode}_storage_access_denial`;
  for (const token of tokens) {
    const denied = await request("storage", `/object/authenticated/${file.bucket}/${file.path}`, {
      headers: bearer(token),
    });
    assert.ok([400, 401, 403, 404].includes(denied.status));
  }
  const anonymous = await request("storage", `/object/public/${file.bucket}/${file.path}`);
  assert.ok([400, 401, 403, 404].includes(anonymous.status));
  report.imageBytesVerified = 1;
  report.directLabelDownloadsBlocked = 3;
  phase = `${mode}_auth_hashes`;
  assert.equal(
    await sql("SELECT count(*) FROM auth.users WHERE encrypted_password LIKE '$2%'"),
    "2",
  );
  assert.equal(await sql("SELECT count(*) FROM auth.identities"), "2");
  report.passwordHashesAndIdentities = true;
  assert.equal(await sql("SELECT count(*) FROM public.privacy_erasure_receipts"), "1");
  report.retainedErasureReceipt = true;
}

try {
  const context = await json(["context", "inspect", "desktop-linux"]);
  assert.equal(context[0].Endpoints.docker.Host, "npipe:////./pipe/dockerDesktopLinuxEngine");
  phase = "images";
  const images = {};
  for (const [key, tag] of Object.entries(recoveryImages)) {
    const id = (await command(["image", "inspect", tag, "--format", "{{.Id}}"])).toString().trim();
    assert.match(id, /^sha256:[a-f0-9]{64}$/);
    images[key] = id;
  }
  if (mode === "restore") {
    phase = "validate_archive";
    const chunks = [];
    let size = 0;
    for await (const part of process.stdin) {
      size += part.length;
      assert.ok(size <= recoveryLimit);
      chunks.push(part);
    }
    bundle = validatePlatformBundle(JSON.parse(Buffer.concat(chunks).toString()));
    // Never execute an arbitrary image named by an imported archive.
    assert.deepEqual(bundle.images, images);
    chunks.length = 0;
  } else {
    bundle = {
      version: 1,
      kind: "winesnap-local-platform-fixture",
      project: recoveryProject,
      hostedTestExport: false,
      createdAt: new Date().toISOString(),
      images,
      jwtSecret: randomBytes(32).toString("hex"),
      dbPassword: randomBytes(32).toString("hex"),
    };
  }
  phase = "isolated_network";
  await command([
    "network",
    "create",
    "--internal",
    "--label",
    `winesnap.scope=${recoveryScope}`,
    names.network,
  ]);
  network = true;
  const net = (await json(["network", "inspect", names.network]))[0];
  assert.equal(net.Internal, true);
  assert.equal(net.Labels["winesnap.scope"], recoveryScope);
  phase = "isolated_database";
  await startContainer(names.database, images.database, "postgres", [
    "--tmpfs",
    "/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=256m,uid=999,gid=999,mode=0700",
    "--tmpfs",
    "/var/run/postgresql:rw,noexec,nosuid,nodev,size=1m,uid=999,gid=999,mode=0770",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=32m,uid=999,gid=999,mode=0700",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
  ]);
  await ready("database");
  await startContainer(names.probe, images.probe, "node", [], "node");
  if (mode === "create") {
    phase = "platform_roles";
    await sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD '${bundle.dbPassword}';
      CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE PASSWORD '${bundle.dbPassword}';
      GRANT anon,authenticated,service_role TO supabase_storage_admin;
      CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
      CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
      CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      GRANT USAGE ON SCHEMA public,auth,storage,extensions TO anon,authenticated,service_role,supabase_auth_admin,supabase_storage_admin;
      GRANT CREATE ON SCHEMA public TO supabase_auth_admin,supabase_storage_admin;
      ALTER ROLE supabase_auth_admin SET search_path=auth,public,extensions;
      ALTER ROLE supabase_storage_admin SET search_path=storage,public,extensions;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
    phase = "real_platform_services";
    await startServices();
    // GoTrue and Storage apply their own real platform migrations. No mock
    // auth.users or storage.objects definitions are loaded from the SQL bootstrap.
    phase = "application_migrations";
    const migrations = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      phase = `application_migration:${file}`;
      await sql(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    phase = "test_image_access_gate";
    await sql(
      await readFile(
        new URL("../supabase/operations/test-image-proxy-policy.sql", import.meta.url),
        "utf8",
      ),
    );
    phase = "synthetic_accounts";
    bundle.accounts = [];
    for (const who of ["owner", "peer"]) {
      const email = `recovery-${who}@example.test`;
      const password = randomBytes(32).toString("hex");
      const response = await request("auth", "/admin/users", {
        method: "POST",
        headers: serviceHeaders(),
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      assert.ok([200, 201].includes(response.status));
      bundle.accounts.push({ id: response.json().id, email, password });
    }
    bundle.wineId = randomUUID();
    bundle.shareId = `recovery+legacy/${invocation}`;
    const owner = bundle.accounts[0].id;
    await sql(`INSERT INTO public.wines(id,user_id,wine_name,is_public,share_id,image_url)
      VALUES('${bundle.wineId}','${owner}','Synthetic recovery wine',false,${literal(bundle.shareId)},'${owner}/recovery.png');
      INSERT INTO public.privacy_erasure_receipts(user_id,requested_at,completed_at)
      VALUES('${randomUUID()}',now(),now());`);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=",
      "base64",
    );
    bundle.files = [
      {
        bucket: "wine-labels",
        path: `${owner}/recovery.png`,
        type: "image/png",
        ...binaryPart(bytes),
      },
    ];
    phase = "synthetic_image_upload";
    const uploaded = await request("storage", `/object/wine-labels/${owner}/recovery.png`, {
      method: "POST",
      headers: { ...serviceHeaders(), "Content-Type": "image/png" },
      base64: bytes.toString("base64"),
    });
    assert.ok([200, 201].includes(uploaded.status));
    phase = "source_verification";
    await verifyRestored();
    // Stop all writers before one transaction-consistent archive plus object
    // byte capture. This can only stop our freshly named synthetic services.
    phase = "quiesce_fixture";
    await command(["stop", names.auth]);
    const downloaded = await request("storage", `/object/wine-labels/${owner}/recovery.png`, {
      headers: serviceHeaders(),
    });
    assert.equal(downloaded.status, 200);
    assert.equal(sha256(downloaded.bytes), bundle.files[0].sha256);
    await command(["stop", names.storage]);
    bundle.catalogHash = await catalogHash();
    phase = "full_logical_dump";
    bundle.database = binaryPart(
      await command([
        "exec",
        names.database,
        "pg_dump",
        "-U",
        "postgres",
        "--format=custom",
        "postgres",
      ]),
    );
    const roles = await command([
      "exec",
      names.database,
      "pg_dumpall",
      "-U",
      "postgres",
      "--roles-only",
      "--no-role-passwords",
    ]);
    bundle.roles = binaryPart(roles);
    // A receipt deliberately newer than the archive travels independently of
    // the SQL dump, as a real recovery must import its latest erasure ledger.
    phase = "newer_erasure_receipt";
    await sql(`SELECT public.request_account_erasure('${owner}')`);
    bundle.erasureReceipts = JSON.parse(
      await sql(`SELECT jsonb_agg(jsonb_build_object(
      'user_id',user_id,'requested_at',requested_at))::text FROM public.privacy_erasure_receipts WHERE user_id='${owner}'`),
    );
    validatePlatformBundle(bundle);
  } else {
    phase = "restore_roles";
    // A fresh initdb already contains postgres. Other role failures are fatal.
    const roles = checkBinaryPart(bundle.roles)
      .toString()
      .replace(/^CREATE ROLE postgres;\r?\n/m, "");
    await sql(roles);
    await sql(`ALTER ROLE supabase_auth_admin PASSWORD '${bundle.dbPassword}';
      ALTER ROLE supabase_storage_admin PASSWORD '${bundle.dbPassword}';`);
    phase = "restore_full_database";
    await command(
      [
        "exec",
        "--interactive",
        names.database,
        "pg_restore",
        "-U",
        "postgres",
        "--exit-on-error",
        "--single-transaction",
        "--dbname=postgres",
      ],
      checkBinaryPart(bundle.database),
    );
    phase = "restored_catalog_comparison";
    assert.equal(await catalogHash(), bundle.catalogHash);
    report.catalogGrantsAndPoliciesMatched = true;
    phase = "restored_platform_services";
    await startServices();
    phase = "restore_image_bytes";
    for (const file of bundle.files) {
      const uploaded = await request("storage", `/object/${file.bucket}/${file.path}`, {
        method: "POST",
        headers: { ...serviceHeaders(), "Content-Type": file.type, "x-upsert": "true" },
        base64: file.base64,
      });
      assert.ok([200, 201].includes(uploaded.status));
    }
    phase = "restored_verification";
    await verifyRestored();
    await reconcileNewerErasure();
  }
  report.completed = true;
  report.localPlatformRehearsalVerified = mode === "restore";
  report.databaseArchiveBytes =
    mode === "restore" ? checkBinaryPart(bundle.database).length : undefined;
  report.schemaSource =
    "pg_dump including real auth/storage; no regenerated destination migrations";
} catch {
  report.failure = "local_platform_recovery_failed";
  report.phase = phase;
  process.exitCode = 1;
} finally {
  let clean = true;
  for (const name of resources.reverse()) {
    try {
      const identity = (
        await command(["inspect", "--format", '{{index .Config.Labels "winesnap.scope"}}', name])
      )
        .toString()
        .trim();
      assert.equal(identity, recoveryScope);
      await command(["rm", "--force", name]);
    } catch {
      clean = false;
    }
  }
  if (network) {
    try {
      const net = (await json(["network", "inspect", names.network]))[0];
      assert.equal(net.Labels["winesnap.scope"], recoveryScope);
      assert.equal(net.Internal, true);
      await command(["network", "rm", names.network]);
    } catch {
      clean = false;
    }
  }
  report.cleanupCompleted = clean;
  if (!clean) {
    report.completed = false;
    process.exitCode = 1;
  }
  // The create output contains private material and is captured only by the
  // DPAPI wrapper. Never run create directly in an interactive terminal.
  console.log(
    JSON.stringify(
      mode === "create" && report.completed
        ? { bundle, report }
        : { ...report, checkedAt: new Date().toISOString() },
    ),
  );
}
