import assert from "node:assert/strict";
import { mkdir, writeFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ownedInternetOrigin } from "./lib/owned-internet.mjs";

assert.deepEqual(process.argv.slice(2), ["--check-approved-owned-host"]);
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
const report = {
  project: "winesnap-owned-local",
  origin: ownedInternetOrigin,
  completed: false,
  productionTouched: false,
  authenticatedAcceptance: false,
  checks: 0,
};
let phase = "anonymous_denial";
async function request(path, options = {}) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  const response = await fetch(ownedInternetOrigin + path, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  assert.notEqual(response.headers.get("cf-cache-status"), "HIT");
  const body = await response.text();
  assert.ok(body.length < 1024 * 1024);
  return { response, body };
}
try {
  for (const path of [
    "/",
    "/login",
    "/cellar",
    "/kitchen",
    "/api/health",
    "/api/wine-image",
    "/api/privacy/export-data",
    "/backend/auth/v1/health",
    "/backend/rest/v1/",
    "/backend/storage/v1/status",
  ]) {
    phase = "denial:" + path;
    const { response } = await request(path);
    assert.equal(response.status, 302);
    assert.ok(response.headers.get("location")?.startsWith(ownedInternetOrigin + "/gate"));
    report.checks++;
  }
  phase = "forged_session";
  assert.equal(
    (
      await request("/api/health", {
        headers: {
          Cookie: "__Secure-winesnap_gate=forged",
          "Remote-User": "robert",
          Authorization: "Bearer forged",
        },
      })
    ).response.status,
    302,
  );
  report.checks++;
  phase = "unauthenticated_scan";
  assert.equal(
    (
      await request("/api/ai/analyze-wine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).response.status,
    302,
  );
  report.checks++;
  for (const path of [
    "/backend/auth/v1/admin/users",
    "/backend/mail/api/v1/messages",
    "/api/public/hooks/check-wishlist-prices",
    "/api/privacy/privacy-maintenance",
  ]) {
    phase = "admin_denial:" + path;
    assert.equal((await request(path)).response.status, 404);
    report.checks++;
  }
  phase = "origin_isolation";
  assert.equal(
    (
      await request("/gate/api/health", {
        headers: { Origin: "https://untrusted.example.invalid" },
      })
    ).response.status,
    403,
  );
  report.checks++;
  phase = "gate_and_static_assets";
  const gate = await request("/gate/");
  assert.equal(gate.response.status, 200);
  const assets = [
    ...new Set(
      [...gate.body.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map((hit) => hit[1]),
    ),
  ].slice(0, 8);
  assert.ok(assets.length >= 2);
  for (const asset of assets) {
    const url = new URL(asset, ownedInternetOrigin + "/gate/");
    assert.equal(url.origin, ownedInternetOrigin);
    assert.ok(url.pathname.startsWith("/gate/"));
    const result = await request(url.pathname);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.length > 0);
    report.checks++;
  }
  report.tlsValidated = true;
  report.completed = true;
} catch {
  report.failure = "owned_public_denial_not_accepted";
  report.phase = phase;
} finally {
  report.checkedAt = new Date().toISOString();
  const directory = fileURLToPath(new URL("../dist/owned-public/", import.meta.url));
  await mkdir(directory, { recursive: true });
  assert.ok(!(await lstat(directory)).isSymbolicLink());
  await writeFile(
    new URL("../dist/owned-public/anonymous-status.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.completed) process.exitCode = 1;
}
