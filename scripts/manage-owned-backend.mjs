import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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
import { selectOwnedPilotUi } from "./lib/owned-pilot-ui.mjs";
import { selectOwnedTextAi, textAiRollbackTag } from "./lib/owned-text-ai.mjs";
import { finishOwnedInput } from "./lib/owned-process-input.mjs";
import { inspectOwnedContainers } from "./lib/owned-installed-state.mjs";
import { readOwnedOperations } from "./lib/owned-operations.mjs";
import { ownedConnectorName } from "./lib/owned-tunnel.mjs";
import {
  assessPlanningLedger,
  planningLedgerQuery,
  planningMigration,
  planningRollbackTag,
  requirePlanningUpdate,
} from "./lib/owned-planning-preflight.mjs";
import {
  assessPantryLedger,
  guardOwnedPantryBatch,
  pantryBackupPattern,
  pantryLedgerQuery,
  pantryMigrationBatch,
  pantryMigrationTransaction,
  pantryRollbackTag,
  pantryWebLabel,
  requirePantryPaused,
  requirePantryRecovery,
  requirePantryUpdate,
} from "./lib/owned-pantry-preflight.mjs";
import {
  nutritionRollbackTag,
  nutritionWebLabel,
  replaceNutritionWeb,
  requireNutritionLedger,
} from "./lib/owned-nutrition-delivery.mjs";
import {
  mealPhotoMigrationBatch,
  refuseOrdinaryMealPhotoMigration,
} from "./lib/owned-meal-photo-delivery.mjs";

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
    "NutritionUpdate",
    "TextAiUpdate",
    "NutritionAccept",
    "NutritionCleanup",
    "Accept",
    "ScanAccept",
    "Features",
    "FeaturesAi",
    "Offline",
    "PilotAccept",
    "PlanningAccept",
    "PantryAccept",
    "PantryCleanup",
    "PilotJourneys",
    "PilotDemo",
    "PilotDemoAccept",
    "PilotDemoCleanup",
    "BrowserPrepare",
    "BrowserInspect",
    "BrowserConflict",
    "BrowserMemory",
    "BrowserCleanup",
    "Maintain",
  ].includes(action),
);
assert.equal(process.argv.length, 3);
const planningUpdate = process.env.WINESNAP_OWNED_REQUIRE_PLANNING_MIGRATION === "1";
const pantryBackup = process.env.WINESNAP_OWNED_PANTRY_BACKUP;
const pantryUpdate = pantryBackup !== undefined;
const pantryAcceptance = ["PantryAccept", "PantryCleanup"].includes(action);
const nutritionUpdate = action === "NutritionUpdate";
const nutritionAcceptance = ["NutritionAccept", "NutritionCleanup"].includes(action);
const nutritionBackup = process.env.WINESNAP_OWNED_NUTRITION_BACKUP;
const textAiUpdate = action === "TextAiUpdate";
const textAiBackup = process.env.WINESNAP_OWNED_AI_TEXT_BACKUP;
assert.equal(nutritionBackup !== undefined, nutritionUpdate);
if (nutritionUpdate) assert.match(nutritionBackup, pantryBackupPattern);
assert.equal(textAiBackup !== undefined, textAiUpdate);
if (textAiUpdate) assert.match(textAiBackup, pantryBackupPattern);
if (pantryUpdate) {
  assert.match(pantryBackup, pantryBackupPattern);
  assert.equal(planningUpdate, false);
}
if (planningUpdate || pantryUpdate) {
  assert.equal(action, "Update");
  assert.ok(
    !process.env.WINESNAP_OWNED_PUBLIC_ORIGIN &&
      !process.env.WINESNAP_OWNED_ORIGIN_RESET &&
      !process.env.WINESNAP_OWNED_PILOT_UI,
  );
}
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
    finishOwnedInput(child.stdin, input);
  });
const json = async (args) => JSON.parse((await command(args)).toString());
async function readMigrationSources() {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const sources = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort())
    sources.push({ name, source: await readFile(new URL(name, directory), "utf8") });
  return sources;
}
async function installedServices() {
  const started = performance.now();
  report.serviceInspectionBatches = (report.serviceInspectionBatches ?? 0) + 1;
  try {
    return await inspectOwnedContainers(json, keys.installationId);
  } finally {
    report.serviceInspectionMs =
      (report.serviceInspectionMs ?? 0) + Math.round(performance.now() - started);
  }
}
async function readPausedPantryState() {
  const observation = await readOwnedOperations(join(homedir(), "WineSnapOwned"));
  const runningConnector = (
    await command(["ps", "--filter", `name=^/${ownedConnectorName}$`, "--format", "{{.Names}}"])
  )
    .toString()
    .trim();
  requirePantryPaused(observation, runningConnector);
  return observation;
}
async function pantryDeliveryChecks(priorImage) {
  const observation = await readPausedPantryState();
  requirePantryRecovery(observation, pantryBackup);
  assert.equal(
    (await command(["image", "inspect", pantryRollbackTag(priorImage), "--format", "{{.Id}}"]))
      .toString()
      .trim(),
    priorImage,
    "The exact previous web image must be retained",
  );
}
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
    pilotUiLabel,
    pantryLabel,
    nutritionLabel,
    textAi,
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
    ...(pilotUiLabel ? ["--label", `winesnap.pilot-ui=${pilotUiLabel}`] : []),
    ...(pantryLabel ? ["--label", `winesnap.pantry=${pantryLabel}`] : []),
    ...(nutritionLabel ? ["--label", `winesnap.recipe-nutrition=${nutritionLabel}`] : []),
    ...(textAi ? ["--label", "winesnap.ai-text-provider=" + textAi.provider] : []),
    ...(textAi?.model ? ["--label", "winesnap.ai-text-model=" + textAi.model] : []),
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
  const deviceOwnerId = process.env.WINESNAP_OWNED_DEVICE_OWNER_ID;
  if (deviceOwnerId) assert.match(deviceOwnerId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
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
  const deviceBinding = {
    version: 1,
    project: ownedProject,
    hostname: "winesnap.boleoai.se",
    enabled: Boolean(deviceOwnerId),
    ownerId: deviceOwnerId ?? null,
  };
  const deviceCode = `import{writeFile,rename,lstat}from'node:fs/promises';
    let s='';for await(const c of process.stdin){s+=c;if(s.length>4096)throw Error();}
    const p='/tmp/winesnap-ai';const f=await lstat(p);
    if(f.isSymbolicLink()||f.uid!==process.getuid()||(f.mode&63))throw Error();
    await writeFile(p+'/device-pending.json',s,{mode:384});await rename(p+'/device-pending.json',p+'/device-access.json');`;
  await command(
    ["exec", "--interactive", name("web"), "node", "--input-type=module", "--eval", deviceCode],
    JSON.stringify(deviceBinding),
  );
}
async function verify({ syncWebKeys = true } = {}) {
  for (const value of (await installedServices()).values()) {
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
  if (syncWebKeys) await installWebKeys();
  report.database = true;
  report.auth = true;
  report.storage = true;
  report.application = true;
  report.emailDelivery = "local-inbox-only";
}

async function buildOwnedWeb({ originSettings, pilotUi, pantryEnabled, tag, webOnly = false }) {
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
    VITE_PANTRY_ENABLED: pantryEnabled ? "true" : "false",
    VITE_RECIPE_NUTRITION_ENABLED: "true",
    VITE_PILOT_UI_ENABLED: pilotUi.enabled ? "true" : "false",
    VITE_PRIVACY_CONTROLS_ENABLED: "true",
    VITE_PRIVACY_OPERATIONS_VERIFIED: "true",
    VITE_PRIVACY_SUPPLIERS_VERIFIED: "false",
  };
  await command(
    [
      "build",
      ...(webOnly ? ["--pull=false", "--target", "runtime"] : []),
      "--tag",
      tag,
      ...Object.entries(flags).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]),
      "--file",
      "Dockerfile",
      ".",
    ],
    undefined,
    {},
    600000,
  );
}

async function startOwnedWeb(
  image,
  { originSettings, pilotUi, pantryEnabled, nutritionLabel, textAi },
) {
  await start("web", image, {
    user: "node",
    publicOrigin: originSettings.origin,
    pilotUiLabel: pilotUi.label,
    pantryLabel: pantryEnabled ? pantryWebLabel : undefined,
    nutritionLabel,
    textAi,
    memory: "768m",
    port: "5212:3000",
    env: {
      SUPABASE_URL: "http://winesnap-owned-gateway:8080",
      SUPABASE_PUBLISHABLE_KEY: ownedToken(keys, "anon"),
      WINESNAP_OWNED_BACKEND_ENABLED: "true",
      WINESNAP_LOCAL_AI_ENABLED: "true",
      WINESNAP_LOCAL_TEXT_PROVIDER: textAi.provider,
      ...(textAi.model ? { WINESNAP_LOCAL_TEXT_MODEL: textAi.model } : {}),
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

function installedTextAi(web) {
  return {
    installed: web?.Config.Labels["winesnap.ai-text-provider"],
    installedModel: web?.Config.Labels["winesnap.ai-text-model"],
  };
}

async function updateGuardedWeb(previous, { originSettings, pilotUi, textAi }) {
  assert.equal(previous?.Config.Labels["winesnap.pantry"], pantryWebLabel);
  const previousNutrition = previous.Config.Labels["winesnap.recipe-nutrition"];
  assert.equal(previousNutrition, textAiUpdate ? nutritionWebLabel : undefined);
  assert.ok(previous.State.Running);
  const previousTextAi = selectOwnedTextAi({ action: "Verify", ...installedTextAi(previous) });
  const phasePrefix = textAiUpdate ? "text_ai" : "nutrition";
  const reportPrefix = textAiUpdate ? "textAi" : "nutrition";
  const backup = textAiUpdate ? textAiBackup : nutritionBackup;
  const rollbackTag = textAiUpdate ? textAiRollbackTag : nutritionRollbackTag;
  if (textAiUpdate) assert.ok(keys[textAi.provider], "Selected provider credential is missing");
  const sources = await readMigrationSources();
  async function verifyLedger() {
    report[reportPrefix + "Ledger"] = requireNutritionLedger(
      sources,
      JSON.parse(await sql(pantryLedgerQuery)),
      keys.installationId,
    );
  }
  async function backendSnapshot() {
    return [...(await installedServices())]
      .filter(([service]) => service !== name("web"))
      .map(([service, container]) => {
        assert.ok(container.State.Running);
        return [service, container.Id, container.Image, container.State.StartedAt];
      });
  }
  const imageId = async (tag) =>
    (await command(["image", "inspect", tag, "--format", "{{.Id}}"])).toString().trim();
  const backend = await backendSnapshot();
  const guard = async () => {
    requirePantryRecovery(await readPausedPantryState(), backup);
    assert.equal(await imageId(rollbackTag(previous.Image)), previous.Image);
    assert.equal(await imageId("winesnap-owned:local"), previous.Image);
    assert.deepEqual(await backendSnapshot(), backend);
    await verifyLedger();
  };
  await guard();
  phase = phasePrefix + "_build";
  const candidateTag = textAiUpdate
    ? "winesnap-owned:text-ai-candidate"
    : "winesnap-owned:nutrition-candidate";
  await buildOwnedWeb({
    originSettings,
    pilotUi,
    pantryEnabled: true,
    tag: candidateTag,
    webOnly: true,
  });
  const candidate = await imageId(candidateTag);
  phase = phasePrefix + "_pre_replacement_guard";
  await replaceNutritionWeb({
    previous,
    candidate,
    allowSameImage: textAiUpdate,
    guard,
    readWeb: () => existing("web"),
    removeWeb: async (id) => {
      if (!recovering) phase = phasePrefix + "_web_replacement";
      await command(["rm", "--force", id]);
    },
    startWeb: (image, stageLabel) =>
      startOwnedWeb(image, {
        originSettings,
        pilotUi,
        pantryEnabled: true,
        nutritionLabel: stageLabel ?? previousNutrition,
        textAi: stageLabel ? textAi : previousTextAi,
      }),
    verifyWeb: async (image, stageLabel) => {
      if (!recovering) phase = phasePrefix + "_web_verification";
      const web = await existing("web");
      assert.equal(web?.Image, image);
      assert.ok(web.State.Running);
      assert.equal(web.Config.Labels["winesnap.recipe-nutrition"], stageLabel ?? previousNutrition);
      assert.equal(web.Config.Labels["winesnap.pantry"], pantryWebLabel);
      assert.deepEqual(
        selectOwnedTextAi({ action: "Verify", ...installedTextAi(web) }),
        stageLabel ? textAi : previousTextAi,
      );
      await verify();
      assert.deepEqual(await backendSnapshot(), backend);
      await verifyLedger();
      await readPausedPantryState();
    },
    tagWeb: (image) => command(["image", "tag", image, "winesnap-owned:local"]),
    recovery(verified) {
      recovering = true;
      phase = phasePrefix + "_web_rollback";
      report[reportPrefix + "RollbackVerified"] = verified;
    },
  });
  report[reportPrefix + "WebUpdated"] = true;
  report[reportPrefix + "ServicesUnchanged"] = true;
  report.publicTunnelPausedVerified = true;
}

async function openOwnedKitchenManifest(file) {
  assert.match(file, /^(?:pantry-browser-(?:owner|peer)|nutrition-browser-owner)-fixture\.json$/);
  const path = join(homedir(), "WineSnapOwned", file);
  const { validateBrowserFixture } = await import("./lib/owned-browser-fixture.mjs");
  let fixture;
  try {
    const info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 16384);
    fixture = validateBrowserFixture(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    fixture,
    remember: (value) =>
      writeFile(path, JSON.stringify(validateBrowserFixture(value)), {
        flag: fixture ? "w" : "wx",
        mode: 0o600,
      }),
  };
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
    (await command(["version", "--format", "{{.Server.Os}}"], undefined, {}, 30000))
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
  const installedPantry = installedWeb?.Config.Labels["winesnap.pantry"];
  assert.ok(installedPantry === undefined || installedPantry === pantryWebLabel);
  const installedNutrition = installedWeb?.Config.Labels["winesnap.recipe-nutrition"];
  assert.ok(installedNutrition === undefined || installedNutrition === nutritionWebLabel);
  const textAi = selectOwnedTextAi({
    action,
    requested: process.env.WINESNAP_OWNED_AI_TEXT_PROVIDER,
    model: process.env.WINESNAP_OWNED_AI_TEXT_MODEL,
    ...installedTextAi(installedWeb),
  });
  report.textAiProvider = textAi.provider;
  report.textAiModel = textAi.model ?? null;
  const pilotUi = selectOwnedPilotUi({
    requested: process.env.WINESNAP_OWNED_PILOT_UI,
    installed: installedWeb?.Config.Labels["winesnap.pilot-ui"] ?? "",
    action,
  });
  report.pilotUi = pilotUi.label;
  const originSettings = selectOwnedPublicOrigin({
    requested: process.env.WINESNAP_OWNED_PUBLIC_ORIGIN,
    reset: process.env.WINESNAP_OWNED_ORIGIN_RESET,
    installed: installedWeb?.Config.Labels["winesnap.public-origin"] ?? "",
    action,
  });
  report.browserPublicOrigin = originSettings.origin || null;
  report.loopbackPortsOnly = true;
  report.localOnly = !originSettings.origin;
  if (nutritionUpdate || textAiUpdate) {
    phase = textAiUpdate ? "text_ai_delivery_guard" : "nutrition_delivery_guard";
    await updateGuardedWeb(installedWeb, { originSettings, pilotUi, textAi });
  }
  if (action === "Resume") {
    phase = "resume_existing_installation";
    // Require every exact installed container before starting any of them.
    const containers = await installedServices();
    for (const service of ownedResumeOrder) {
      const value = containers.get(name(service));
      if (!value.State.Running) await command(["start", value.Id]);
    }
    await wait(() => verify());
    report.resumedExistingInstallation = true;
  }
  if (action === "Start" || action === "Update") {
    let planningSources, unguardedSources;
    let guardedPantrySources, previousPantryImage;
    if (planningUpdate) {
      phase = "planning_update_guard";
      const services = await installedServices();
      assert.ok(ownedResumeOrder.every((service) => services.get(name(service))?.State.Running));
      const priorImage = services.get(name("web")).Image;
      assert.equal(
        (
          await command([
            "image",
            "inspect",
            planningRollbackTag(priorImage),
            "--format",
            "{{.Id}}",
          ])
        )
          .toString()
          .trim(),
        priorImage,
        "The exact rollback image must be retained",
      );
      planningSources = await readMigrationSources();
      requirePlanningUpdate(
        planningSources,
        JSON.parse(await sql(planningLedgerQuery)),
        keys.installationId,
      );
    }
    if (pantryUpdate) {
      phase = "pantry_update_guard";
      const services = await installedServices();
      assert.ok(ownedResumeOrder.every((service) => services.get(name(service))?.State.Running));
      const web = services.get(name("web"));
      assert.equal(web.Id, installedWeb?.Id);
      assert.equal(installedPantry, undefined);
      previousPantryImage = web.Image;
      await pantryDeliveryChecks(previousPantryImage);
      guardedPantrySources = await readMigrationSources();
      requirePantryUpdate(
        guardedPantrySources,
        JSON.parse(await sql(pantryLedgerQuery)),
        keys.installationId,
      );
    }
    if (action === "Update" && installedWeb && !planningUpdate && !pantryUpdate) {
      phase = "refuse_unguarded_schema_update";
      assert.ok((await existing("db"))?.State.Running);
      unguardedSources = await readMigrationSources();
      const ledger = JSON.parse(await sql(pantryLedgerQuery));
      assert.equal(ledger.installation, keys.installationId);
      const pending = planOwnedMigrations(unguardedSources, ledger.applied);
      guardOwnedPantryBatch(pending, ledger.applied.length, false);
      refuseOrdinaryMealPhotoMigration([...pending, ...ledger.applied]);
    }
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
    const availableSources =
      planningSources ?? guardedPantrySources ?? unguardedSources ?? (await readMigrationSources());
    const sources =
      action === "Start"
        ? availableSources.filter(({ name }) => !mealPhotoMigrationBatch.includes(name))
        : availableSources;
    const ledger =
      planningUpdate || pantryUpdate
        ? JSON.parse(await sql(pantryUpdate ? pantryLedgerQuery : planningLedgerQuery))
        : undefined;
    if (planningUpdate) requirePlanningUpdate(sources, ledger, keys.installationId);
    const applied =
      ledger?.applied ??
      JSON.parse(
        await sql(
          "SELECT COALESCE(json_agg(json_build_object('name',name,'sha256',sha256) ORDER BY name),'[]'::json) FROM winesnap_local.migrations",
        ),
      );
    const pending = planOwnedMigrations(sources, applied);
    guardOwnedPantryBatch(pending, applied.length, pantryUpdate);
    refuseOrdinaryMealPhotoMigration(pending);
    if (pantryUpdate) {
      requirePantryUpdate(sources, ledger, keys.installationId);
      await pantryDeliveryChecks(previousPantryImage);
      phase = "atomic_pantry_migration_batch";
      await sql(pantryMigrationTransaction(pending));
      assert.equal(
        assessPantryLedger(sources, JSON.parse(await sql(pantryLedgerQuery)), keys.installationId)
          .scope,
        "already_applied",
      );
    } else {
      for (const item of pending) {
        phase = `migration:${item.name}`;
        await sql(
          `BEGIN;\n${item.source}\nINSERT INTO winesnap_local.migrations(name,sha256) VALUES(${literal(item.name)},'${item.sha256}'); COMMIT;`,
        );
      }
    }
    report.migrations = { previouslyApplied: applied.length, newlyApplied: pending.length };
    if (planningUpdate) report.migrations.appliedPlanningMigration = pending[0].name;
    if (pantryUpdate) report.migrations.appliedPantryMigrations = [...pantryMigrationBatch];
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
    if (pending.length) {
      phase = "rest_schema_reload";
      // Update can keep the existing PostgREST service and its cached schema.
      await sql("NOTIFY pgrst, 'reload schema';");
      if (pending.some(({ name }) => name === planningMigration)) {
        await wait(async () => {
          const response = await request("/rest/v1/kitchen_week_plans?limit=0");
          const result = await response.json();
          assert.ok([401, 403].includes(response.status));
          assert.equal(result.code, "42501");
        });
        report.planningRestSchemaVerified = true;
      }
      if (pantryUpdate) {
        for (const table of ["kitchen_pantry", "kitchen_pantry_consumption"]) {
          await wait(async () => {
            const response = await request(`/rest/v1/${table}?limit=0`);
            const result = await response.json();
            assert.ok([401, 403].includes(response.status));
            assert.equal(result.code, "42501");
          });
        }
        report.pantryRestSchemaVerified = true;
      }
    }
    phase = "web_build";
    const web = await existing("web");
    const pantryEnabled = pantryUpdate || installedPantry === pantryWebLabel;
    if (!web || action === "Update") {
      await buildOwnedWeb({ originSettings, pilotUi, pantryEnabled, tag: "winesnap-owned:local" });
      if (pantryUpdate) {
        phase = "pantry_pre_replacement_guard";
        assert.equal((await existing("web"))?.Image, previousPantryImage);
        await pantryDeliveryChecks(previousPantryImage);
      }
      if (web) await command(["rm", "--force", name("web")]);
    }
    const webImage = (
      await command(["image", "inspect", "winesnap-owned:local", "--format", "{{.Id}}"])
    )
      .toString()
      .trim();
    phase = "web_start";
    await startOwnedWeb(webImage, {
      originSettings,
      pilotUi,
      pantryEnabled,
      nutritionLabel: installedNutrition,
      textAi,
    });
  }
  if (!nutritionUpdate && !textAiUpdate) {
    phase = "verification";
    await verify({ syncWebKeys: !pantryAcceptance && !nutritionAcceptance });
  }
  if (nutritionAcceptance) {
    phase = "nutrition_acceptance_guard";
    await readPausedPantryState();
    assert.equal(installedPantry, pantryWebLabel);
    if (action === "NutritionAccept") {
      assert.equal(installedWeb?.Config.Labels["winesnap.recipe-nutrition"], nutritionWebLabel);
    }
    report.nutritionLedger = requireNutritionLedger(
      await readMigrationSources(),
      JSON.parse(await sql(pantryLedgerQuery)),
      keys.installationId,
    );
    const { fixture, remember } = await openOwnedKitchenManifest(
      "nutrition-browser-owner-fixture.json",
    );
    if (action === "NutritionCleanup") {
      phase = "nutrition_cleanup";
      if (fixture) {
        const { ownedBrowserFixture } = await import("./lib/owned-browser-fixture.mjs");
        const cleaned = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, {
          planningOnly: true,
        });
        assert.ok(cleaned.cleanupCompleted || cleaned.alreadyClean);
      }
      report.nutritionCleanupVerified = true;
    } else {
      const { acceptInstalledNutrition } = await import("./lib/owned-nutrition-accept.mjs");
      phase = "nutrition_prepare";
      report.nutritionAcceptance = await acceptInstalledNutrition(keys, {
        previous: fixture,
        remember,
        artifactDirectory: fileURLToPath(
          new URL("../dist/owned-nutrition-accept", import.meta.url),
        ),
        progress(step) {
          assert.match(step, /^nutrition_[a-z_]+$/);
          phase = step;
        },
      });
      assert.ok(
        report.nutritionAcceptance.completed && report.nutritionAcceptance.cleanupCompleted,
      );
    }
    await readPausedPantryState();
    report.publicTunnelPausedVerified = true;
  }
  if (pantryAcceptance) {
    phase = "pantry_acceptance_ledger";
    await readPausedPantryState();
    if (action === "PantryAccept") assert.equal(installedPantry, pantryWebLabel);
    const ledger = assessPantryLedger(
      await readMigrationSources(),
      JSON.parse(await sql(pantryLedgerQuery)),
      keys.installationId,
    );
    assert.equal(ledger.scope, "already_applied");
    report.pantryLedger = ledger;
    const { ownedBrowserFixture } = await import("./lib/owned-browser-fixture.mjs");
    const readManifest = (name) => openOwnedKitchenManifest(`pantry-browser-${name}-fixture.json`);
    phase = "pantry_acceptance_manifests";
    const own = await readManifest("owner"),
      peer = await readManifest("peer");
    if (own.fixture && peer.fixture) assert.notEqual(own.fixture.userId, peer.fixture.userId);
    if (action === "PantryCleanup") {
      phase = "pantry_cleanup";
      for (const { fixture } of [peer, own])
        if (fixture) {
          const result = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, {
            pantryOnly: true,
          });
          assert.ok(result.cleanupCompleted || result.alreadyClean);
        }
      report.pantryCleanupVerified = true;
    } else {
      const { acceptInstalledPantry } = await import("./lib/owned-pantry-accept.mjs");
      phase = "pantry_prepare";
      report.pantryAcceptance = await acceptInstalledPantry(keys, {
        previous: own.fixture,
        previousPeer: peer.fixture,
        remember: own.remember,
        rememberPeer: peer.remember,
        artifactDirectory: fileURLToPath(new URL("../dist/owned-pantry-accept", import.meta.url)),
        progress(step) {
          assert.match(step, /^pantry_[a-z_]+$/);
          phase = step;
        },
      });
      assert.equal(report.pantryAcceptance.completed, true);
      assert.equal(report.pantryAcceptance.cleanupCompleted, true);
    }
    await readPausedPantryState();
    report.publicTunnelPausedVerified = true;
  }
  if (action === "RestartApp") {
    phase = "restart_owned_application";
    await existing("web");
    await command(["restart", name("web")]);
    await wait(() => verify());
    report.restartedApplication = true;
  }
  if (["PilotDemo", "PilotDemoAccept", "PilotDemoCleanup"].includes(action)) {
    assert.equal(pilotUi.enabled, true);
    const { showOwnedPilotDemo } = await import("./lib/owned-pilot-demo.mjs");
    const { validateBrowserFixture } = await import("./lib/owned-browser-fixture.mjs");
    const manifest = join(process.env.USERPROFILE, "WineSnapOwned", "pilot-demo-fixture.json");
    let previous;
    try {
      const info = await lstat(manifest);
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 16384);
      previous = validateBrowserFixture(JSON.parse(await readFile(manifest, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (action === "PilotDemoCleanup") {
      const { ownedBrowserFixture } = await import("./lib/owned-browser-fixture.mjs");
      report.demo = previous
        ? await ownedBrowserFixture(keys, "cleanup", previous, undefined, {
            demo: true,
            cleanupImages: true,
          })
        : { completed: true, alreadyClean: true };
    } else
      report.demo = await showOwnedPilotDemo(keys, {
        acceptance: action === "PilotDemoAccept",
        fixture: previous,
        remember: (value) =>
          writeFile(manifest, JSON.stringify(validateBrowserFixture(value)), {
            flag: previous ? "w" : "wx",
            mode: 0o600,
          }),
        artifactDirectory: fileURLToPath(
          new URL(
            action === "PilotDemoAccept" ? "../dist/owned-demo-accept" : "../dist/owned-demo",
            import.meta.url,
          ),
        ),
      });
    assert.equal(report.demo.completed, true);
    assert.equal(Boolean(report.demo.cleanupCompleted || report.demo.alreadyClean), true);
  }
  if (
    action.startsWith("Browser") ||
    ["Offline", "PilotAccept", "PlanningAccept", "PilotJourneys"].includes(action)
  ) {
    const planningOnly = action === "PlanningAccept";
    if (planningOnly) {
      phase = "planning_acceptance_ledger";
      const ledger = assessPlanningLedger(
        await readMigrationSources(),
        JSON.parse(await sql(planningLedgerQuery)),
        keys.installationId,
      );
      assert.equal(ledger.scope, "already_applied");
      report.planningLedger = ledger;
    }
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
    if (
      ["BrowserPrepare", "Offline", "PilotAccept", "PlanningAccept", "PilotJourneys"].includes(
        action,
      ) &&
      fixture
    ) {
      // Refuse to overwrite a live fixture's cleanup manifest.
      const existing = planningOnly
        ? await ownedBrowserFixture(keys, "absent", fixture, undefined, { planningOnly })
        : await ownedBrowserFixture(keys, "absent", fixture);
      assert.equal(existing.alreadyClean, true);
      if (planningOnly) report.previousPlanningFixtureCleanupVerified = true;
    }
    const remember = async (created) => {
      // The private directory/operation lock belongs to the Windows wrapper.
      // Keep this cleanup manifest independent of success/failure reports.
      await writeFile(manifestPath, JSON.stringify(validateBrowserFixture(created)), {
        flag: fixture ? "w" : "wx",
        mode: 0o600,
      });
    };
    const peerPath = join(process.env.USERPROFILE, "WineSnapOwned", "browser-peer-fixture.json");
    let peerFixture;
    if (["PilotAccept", "PilotJourneys", "BrowserCleanup"].includes(action)) {
      try {
        const info = await lstat(peerPath);
        assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 16384);
        peerFixture = validateBrowserFixture(JSON.parse(await readFile(peerPath, "utf8")));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (["PilotAccept", "PlanningAccept", "PilotJourneys"].includes(action)) {
      assert.equal(pilotUi.enabled, true, "Pilot acceptance requires the installed dark UI");
      const { acceptOwnedPilotUi } = await import("./lib/owned-pilot-browser.mjs");
      const accountIsolationOnly =
        action === "PilotAccept" && process.env.WINESNAP_OWNED_ACCOUNT_ISOLATION_ONLY === "1";
      const pilotArtifacts = accountIsolationOnly
        ? "../dist/owned-pilot-account"
        : "../dist/owned-pilot-ui";
      report.pilotAcceptance = await acceptOwnedPilotUi(keys, {
        fixture,
        remember,
        liveJourneys: action === "PilotJourneys",
        kitchenRecoveryOnly:
          action === "PilotAccept" && process.env.WINESNAP_OWNED_KITCHEN_RECOVERY_ONLY === "1",
        accountIsolationOnly,
        planningOnly,
        replayApprovedImage: process.env.WINESNAP_OWNED_REPLAY_APPROVED_IMAGE === "1",
        peerFixture,
        rememberPeer: (value) =>
          writeFile(peerPath, JSON.stringify(validateBrowserFixture(value)), {
            flag: peerFixture ? "w" : "wx",
            mode: 0o600,
          }),
        artifactDirectory: fileURLToPath(
          new URL(planningOnly ? "../dist/owned-planning-accept" : pilotArtifacts, import.meta.url),
        ),
        progress(step) {
          assert.match(step, /^[a-z_]+$/);
          phase = `pilot_${step}`;
        },
      });
      assert.equal(report.pilotAcceptance.completed, true);
      if (planningOnly) assert.equal(report.pilotAcceptance.cleanupCompleted, true);
    } else if (action === "Offline") {
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
      if (action === "BrowserCleanup" && peerFixture)
        await ownedBrowserFixture(keys, "cleanup", peerFixture);
      report.browser = await ownedBrowserFixture(
        keys,
        action.slice(7).toLowerCase(),
        fixture,
        remember,
        { cleanupImages: action === "BrowserCleanup" },
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
  if (["Accept", "ScanAccept"].includes(action)) {
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
      action === "ScanAccept"
        ? {
            scanImage: join(
              process.env.USERPROFILE,
              "Projects",
              "New project",
              "legacy-winesnap-assets",
              "54456874_400.webp",
            ),
          }
        : {},
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
