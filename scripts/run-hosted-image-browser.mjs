import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createPortServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  escapeImageTestHtml as html,
  imageBrowserEnvironment,
  imageControlRequestAllowed,
  imageTestOrigin as origin,
} from "./lib/image-browser-session.mjs";

assert.equal(process.argv.length, 2, "This session accepts no connection arguments");
const publicKey = process.env.WINESNAP_TEST_PUBLISHABLE_KEY;
const secretKey = process.env.WINESNAP_TEST_SECRET_KEY;
assert.ok(publicKey?.startsWith("sb_publishable_") && secretKey?.startsWith("sb_secret_"));
const root = fileURLToPath(new URL("../", import.meta.url));
const reportFile = new URL("../dist/hosted-image-browser-session.json", import.meta.url);
const testFetch = (input, init) => {
  assert.equal(new URL(input instanceof Request ? input.url : String(input)).origin, origin);
  return fetch(input, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
};
const admin = createClient(origin, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: testFetch },
});
const ok = ({ data, error }) => {
  if (error) throw new Error("test_api_failure");
  return data;
};
const users = [];
const nonce = randomUUID();
const state = {
  project: "pzniyupmgwvlldvztzqh",
  phase: "starting",
  setupCompleted: false,
  cleanupFailures: 0,
};
let app;
let server;
let controlOrigin;
let finishing;
let timer;
let wine;

async function saveReport() {
  await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
  await writeFile(
    reportFile,
    JSON.stringify({ ...state, checkedAt: new Date().toISOString() }, null, 2),
  );
}
async function availablePort() {
  const probe = createPortServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
async function cleanup() {
  let failures = 0;
  for (const user of users) {
    try {
      for (let batch = 0; batch < 5; batch++) {
        const objects = ok(
          await admin.rpc("privacy_account_storage_objects", { _user_id: user.id, _limit: 200 }),
        );
        assert.ok(Array.isArray(objects));
        if (!objects.length) break;
        for (const object of objects) {
          assert.equal(object.bucket_id, "wine-labels");
          assert.ok(object.name.startsWith(`${user.id}/`));
        }
        ok(await admin.storage.from("wine-labels").remove(objects.map((object) => object.name)));
      }
      assert.equal(
        ok(await admin.rpc("privacy_account_storage_objects", { _user_id: user.id, _limit: 1 }))
          .length,
        0,
      );
      ok(await admin.from("wine_photos").delete().eq("user_id", user.id));
      ok(await admin.from("wines").delete().eq("user_id", user.id));
      ok(await admin.auth.admin.deleteUser(user.id));
      ok(await admin.from("privacy_erasure_receipts").delete().eq("user_id", user.id));
      user.password = "";
    } catch {
      failures++;
    }
  }
  state.cleanupFailures = failures;
  return failures === 0;
}
async function finish() {
  if (finishing) return finishing;
  finishing = (async () => {
    clearTimeout(timer);
    const clean = await cleanup();
    state.phase = clean ? "cleaned" : "cleanup_failed";
    await saveReport();
    app?.kill("SIGTERM");
    server?.close();
    console.log(JSON.stringify({ phase: state.phase, cleanupFailures: state.cleanupFailures }));
    if (!clean) process.exitCode = 1;
  })();
  return finishing;
}
function page() {
  const form = (action, label) =>
    `<form method="post" action="/${action}"><input type="hidden" name="nonce" value="${nonce}"><button>${label}</button></form>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WineSnap image test operator</title><style>body{font:16px system-ui;max-width:850px;margin:32px auto;padding:0 20px;background:#fff;color:#202020}a{display:block;margin:12px 0}details{margin:24px 0}label{display:block;margin:12px 0}input{font:inherit;width:min(100%,620px)}button{font:inherit;padding:12px;margin:8px 0}code{overflow-wrap:anywhere}</style><h1>WineSnap-test image session</h1><p>Project: pzniyupmgwvlldvztzqh. Local test only. Phase: ${html(state.phase)}</p><a href="${state.appUrl}/login" target="_blank" rel="noreferrer">Open actual WineSnap login</a><a href="${state.wineUrl}" target="_blank" rel="noreferrer">Open synthetic owner wine</a><a href="${state.shareUrl}" target="_blank" rel="noreferrer">Open synthetic share</a><details><summary>Show temporary test sign-ins</summary>${users.map((user, i) => `<section><h2>${i ? "Peer" : "Owner"}</h2><label>${i ? "Peer" : "Owner"} email<input readonly value="${html(user.email)}"></label><label>${i ? "Peer" : "Owner"} password<input readonly value="${html(user.password)}"></label></section>`).join("")}</details>${form("share", "Make synthetic wine public")}${form("unshare", "Make synthetic wine private")}${form("erase", "Request synthetic owner erasure")}${form("finish", "Finish test and clean fixtures")}</html>`;
}

try {
  const appPort = await availablePort();
  state.appUrl = `http://127.0.0.1:${appPort}`;
  await saveReport();
  app = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "vite.independent.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(appPort),
      "--strictPort",
    ],
    {
      cwd: root,
      env: imageBrowserEnvironment(process.env, publicKey),
      stdio: "ignore",
      windowsHide: true,
    },
  );
  app.on("error", () => {
    state.phase = "app_failed";
    void finish();
  });
  let ready = false;
  const startupDeadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < startupDeadline) {
    if (app.exitCode !== null) throw new Error("app_start_failed");
    try {
      const response = await fetch(`${state.appUrl}/login`, { signal: AbortSignal.timeout(30000) });
      const htmlReady = response.ok;
      await response.body?.cancel();
      if (htmlReady) {
        const client = await fetch(`${state.appUrl}/@id/virtual:tanstack-start-client-entry`, {
          signal: AbortSignal.timeout(30000),
        });
        ready = client.ok && /javascript/.test(client.headers.get("content-type") ?? "");
        await client.body?.cancel();
        if (ready) break;
      }
    } catch {
      /* Wait for the same local dev server to become ready. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "app_start_timeout");
  for (let i = 0; i < 2; i++) {
    const email = `winesnap-browser-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    users.push({ id: user.id, email, password });
    ok(
      await admin
        .from("profiles")
        .update({
          display_name: i ? "Synthetic peer" : "Synthetic owner",
          onboarded_at: new Date().toISOString(),
        })
        .eq("id", user.id),
    );
  }
  const owner = users[0];
  const path = `${owner.id}/${randomUUID()}.jpg`;
  const picture = await readFile(new URL("../src/assets/hero-bottle.jpg", import.meta.url));
  ok(
    await admin.storage
      .from("wine-labels")
      .upload(path, picture, { contentType: "image/jpeg", cacheControl: "0" }),
  );
  wine = ok(
    await admin
      .from("wines")
      .insert({
        user_id: owner.id,
        wine_name: "Synthetic image access test",
        producer: "WineSnap test fixture",
        vintage: 2023,
        wine_type: "red",
        image_url: path,
        is_public: false,
        country: "France",
        region: "Synthetic region",
        primary_notes: ["blackberry", "oak"],
        description: "Disposable browser-test fixture. Not a wine identification.",
      })
      .select("id,share_id")
      .single(),
  );
  ok(
    await admin.from("wine_photos").insert({
      user_id: owner.id,
      wine_id: wine.id,
      storage_path: path,
      url: path,
      kind: "label",
      sort_order: 0,
    }),
  );
  state.wineUrl = `${state.appUrl}/wine/${wine.id}`;
  state.shareUrl = `${state.appUrl}/w/${encodeURIComponent(wine.share_id)}`;
  state.phase = "private";
  server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.headers.host !== new URL(controlOrigin).host) {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "GET" && request.url === "/") {
      response.setHeader(
        "Set-Cookie",
        `winesnap_image_test=${nonce}; HttpOnly; SameSite=Strict; Path=/`,
      );
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(page());
      return;
    }
    if (
      request.method !== "POST" ||
      !["/share", "/unshare", "/erase", "/finish"].includes(request.url)
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 1024) throw new Error("body_too_large");
      }
      if (
        !imageControlRequestAllowed(
          request,
          controlOrigin,
          nonce,
          new URLSearchParams(body).get("nonce"),
        )
      ) {
        response.writeHead(403).end();
        return;
      }
      if (request.url === "/finish") {
        response.end("Cleaning disposable test fixtures.");
        await finish();
        return;
      }
      if (request.url === "/erase") {
        ok(await admin.rpc("request_account_erasure", { _user_id: owner.id }));
        state.phase = "erasure_requested";
      } else {
        assert.notEqual(state.phase, "erasure_requested");
        const shared = request.url === "/share";
        ok(
          await admin
            .from("wines")
            .update({ is_public: shared })
            .eq("id", wine.id)
            .eq("user_id", owner.id),
        );
        state.phase = shared ? "shared" : "private";
      }
      await saveReport();
      response.writeHead(303, { Location: "/" }).end();
    } catch {
      response.writeHead(503).end("Test action failed. No diagnostic secrets are returned.");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  controlOrigin = `http://127.0.0.1:${server.address().port}`;
  state.controlUrl = controlOrigin;
  state.setupCompleted = true;
  await saveReport();
  console.log(
    JSON.stringify({
      project: state.project,
      appUrl: state.appUrl,
      controlUrl: controlOrigin,
      phase: state.phase,
    }),
  );
  console.log(
    "Keep this window open during the browser checks. Ctrl+C cleans the disposable fixtures.",
  );
  timer = setTimeout(() => void finish(), 30 * 60 * 1000);
  process.once("SIGINT", () => void finish());
  process.once("SIGTERM", () => void finish());
  app.once("exit", () => {
    if (!finishing) void finish();
  });
} catch (error) {
  state.setupFailed = true;
  state.failureCode = ["app_start_failed", "app_start_timeout", "test_api_failure"].includes(
    error?.message,
  )
    ? error.message
    : "unexpected_setup_failure";
  if (typeof app?.exitCode === "number") state.appExitCode = app.exitCode;
  state.phase = "setup_failed";
  await finish();
  process.exitCode = 1;
}
