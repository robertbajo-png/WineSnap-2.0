import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist/independent-runtime");
const canary = "independent-check-private-canary-must-not-be-public";
const fixtureUrl = "https://example.invalid";
const fixtureKey = "sb_publishable_runtime_check_not_a_real_key";

async function filesAt(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesAt(path)));
    else files.push(path);
  }
  return files;
}

// Refuse to exercise an operator-configured artifact. Build the synthetic mode first.
const browserFiles = (await filesAt(resolve(output, "public"))).filter((path) =>
  /\.(js|css|html|json|map)$/.test(path),
);
let fixtureSeen = false;
for (const path of browserFiles) {
  const content = await readFile(path, "utf8");
  assert(!content.includes(canary), "Private build-time canary found in public output");
  assert(
    !content.includes("production-should-not-be-used.invalid"),
    "Inherited public environment was not isolated",
  );
  // The Supabase SDK itself contains the bare prefix as validation code.
  assert(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(content), "Secret key value found in public output");
  assert(
    !/https:\/\/[a-z0-9]+\.supabase\.co/i.test(content),
    "A hosted Supabase project URL is present; use build:independent:check",
  );
  fixtureSeen ||= content.includes(fixtureUrl) && content.includes(fixtureKey);
}
assert(fixtureSeen, "Not the synthetic runtime-check build; refusing to run");

async function checkServer(configuredCron, artifact) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((done, reject) =>
    reservation.close((error) => (error ? reject(error) : done())),
  );
  const base = `http://127.0.0.1:${port}`;
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    NODE_ENV: "production",
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    HOST: "127.0.0.1",
    PORT: String(port),
    SUPABASE_URL: fixtureUrl,
    SUPABASE_PUBLISHABLE_KEY: fixtureKey,
    SUPABASE_SERVICE_ROLE_KEY: canary,
    OPENAI_API_KEY: canary,
    GEMINI_API_KEY: canary,
  });
  if (configuredCron) env.CRON_SECRET = canary;
  let logs = "";
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve(root, "scripts/independent-fetch-guard.mjs")).href,
      resolve(artifact, "server/index.mjs"),
    ],
    {
      cwd: artifact,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let spawnError;
  child.on("error", (error) => {
    spawnError = error;
  });
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const closed = new Promise((done) => child.once("close", done));
  const request = async (path, options) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.text();
    assert(!body.includes(canary), `Private runtime canary exposed at ${path}`);
    return { response, body };
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      assert(child.exitCode === null, `Server exited before readiness: ${logs}`);
      try {
        const { response } = await request("/manifest.webmanifest");
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* Wait for the listener, without contacting another origin. */
      }
      await delay(250);
    }
    assert(ready, `Server did not start: ${logs}`);
    // Liveness only: no DB/provider calls and no environment or user information.
    const health = await request("/api/health");
    assert.equal(health.response.status, 200);
    assert.deepEqual(JSON.parse(health.body), { status: "ok" });
    assert.equal(health.response.headers.get("cache-control"), "no-store");
    const localAi = await request("/api/ai/analyze-wine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(
      localAi.response.status,
      503,
      "Test-only AI must stay disabled outside its explicit runtime",
    );
    assert.equal(localAi.response.headers.get("cache-control"), "no-store");

    if (!configuredCron) {
      for (const path of ["/", "/login", "/privacy", "/scan", "/cellar", "/ask"]) {
        const { response, body } = await request(path);
        assert.equal(response.status, 200, `SSR failed at ${path}`);
        assert.match(body, /<html/);
        assert.match(body, /<script/);
      }
      const { response: missing } = await request("/independent-check-not-a-real-route");
      assert.equal(missing.status, 404);
      const { body: home } = await request("/");
      const assets = [
        ...new Set([...home.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map((hit) => hit[1])),
      ].filter((path) => path.startsWith("/"));
      assert(assets.length >= 2, "Expected local JS and CSS references");
      for (const asset of assets) {
        const { response, body } = await request(asset);
        assert.equal(response.status, 200, `Missing asset ${asset}`);
        assert(body.length > 0);
      }
      for (const path of ["/sw.js", "/offline.html", "/icon-512.png"]) {
        const { response } = await request(path);
        assert.equal(response.status, 200, `Missing public file ${path}`);
      }
      for (const name of [
        "refresh-cellar-values",
        "refresh-wishlist-prices",
        "match-systembolaget",
      ]) {
        const { response, body } = await request(`/api/public/hooks/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        assert.equal(response.status, 401, `Unauthenticated request not denied at ${name}`);
        assert.equal(JSON.parse(body).error, "Unauthorized");
      }
    }
    const { response, body } = await request("/api/public/hooks/check-wishlist-prices", {
      method: "POST",
    });
    assert.equal(response.status, configuredCron ? 401 : 503);
    assert.equal(
      JSON.parse(body).error,
      configuredCron ? "Unauthorized" : "Scheduler not configured",
    );
    assert(
      !logs.includes("INDEPENDENT_CHECK_OUTBOUND_FETCH_BLOCKED"),
      "The server attempted an outbound fetch",
    );
    console.log(
      `PASS Node runtime: ${configuredCron ? "configured cron rejects missing secret" : "six SSR routes, 404, static assets, three auth guards and unconfigured cron"}`,
    );
  } finally {
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
    await closed;
  }
}

// Exercise the deployable artifact outside the checkout, without its node_modules.
const temporaryRoot = resolve(tmpdir());
const artifact = await mkdtemp(resolve(temporaryRoot, "winesnap-runtime-check-"));
try {
  await cp(output, artifact, { recursive: true });
  await checkServer(false, artifact);
  await checkServer(true, artifact);
} finally {
  assert(
    dirname(artifact) === temporaryRoot && basename(artifact).startsWith("winesnap-runtime-check-"),
  );
  await rm(artifact, { recursive: true, force: true });
}
console.log(
  "Independent smoke checks passed. No login, AI calls, database writes or deployments were performed.",
);
