import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  authorizeMealPhotoStorage,
  createMealPhotoStorageHandler,
} from "../src/lib/mealPhotoStorage.server.ts";
import { syntheticPhoto } from "./lib/core-meal-photo-browser.mjs";
import { isolatedMealPhotoApi, isolatedPlanningBackend } from "./lib/isolated-planning-backend.mjs";
import { createPlanningDatabaseFixture } from "./lib/planning-database-browser.mjs";

assert.ok(process.platform === "win32" && process.argv.length === 3);
const tag = process.argv[2];
assert.match(tag, /^winesnap-planning-rehearsal:dev10-[a-f0-9]{7,40}$/);
const key = "sb_publishable_runtime_check_not_a_real_key";
const analysisPath = "/api/ai/analyze-meal-photo";
const photoPath = "/api/meal-photo";
const report = {
  checkedAt: new Date().toISOString(),
  synthetic: true,
  installedAppTouched: false,
  productionTouched: false,
  hostedTestTouched: false,
  externalAiCalled: false,
  analysisSimulated: true,
  phase: "image_and_browser_scope",
  passed: [],
  fixtureErrors: 0,
  externalRequests: 0,
  mutations: 0,
  pageErrors: 0,
  simulatedAnalysisRequests: 0,
  completed: false,
  cleanupCompleted: false,
};
const backend = isolatedPlanningBackend(report, { meals: true, mealPhotos: true });
const pass = (name) => {
  report.passed.push(name);
  console.log("PASS " + name);
};
const settleServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
let browser, proxy, sentinel;

try {
  const image = await backend.candidateImage(tag, { mealPhoto: true });
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  report.candidateImage = image;
  const { chromium } = await import(
    pathToFileURL(
      join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
    ).href
  );
  let denied = 0;
  proxy = createServer((_request, response) => {
    denied++;
    response.writeHead(403, { "x-fixture": "network-denied", Connection: "close" });
    response.end();
  });
  proxy.on("connect", (_request, socket) => socket.destroy());
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  sentinel = createServer((_request, response) => response.end("Direct network is forbidden."));
  sentinel.listen(0, "127.0.0.1");
  await once(sentinel, "listening");
  const port = sentinel.address().port;
  assert.ok(![5212, 54323, 8026].includes(port));
  const base = "http://127.0.0.1:" + port;
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:" + proxy.address().port, bypass: "<-loopback>" },
  });
  const canary = await browser.newPage();
  for (const host of ["localhost", "127.0.0.1"]) {
    const response = await canary.goto(`http://${host}:${port}/canary`);
    assert.equal(response.status(), 403);
    assert.equal(await response.headerValue("x-fixture"), "network-denied");
  }
  await canary.close();
  await settleServer(sentinel);
  sentinel = undefined;
  assert.equal(denied, 2);
  pass("browser_loopback_backstop");
  report.phase = "isolated_auth_rest_storage";
  await backend.boot();
  assert.equal(report.isolatedMigrationsApplied, 42);
  await backend.replaceRehearsalWeb(image);
  const fixture = await createPlanningDatabaseFixture({
    backend,
    base,
    origin: "http://127.0.0.1:54323",
    key,
    report,
    pantry: true,
    mealPhotos: true,
    relayWeb: backend.requestWeb,
  });
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: backend.mealPhotoFixtureFetch() },
  };
  const anon = createClient(isolatedMealPhotoApi, backend.anon, options);
  const admin = createClient(isolatedMealPhotoApi, backend.serviceRole, options);
  const storage = createMealPhotoStorageHandler({
    enabled: () => true,
    authorize: (token) => authorizeMealPhotoStorage(token, anon, async () => admin),
  });
  const rows = async (account) => {
    assert.ok(account.token);
    const response = await fixture.rest(account, "/kitchen_photo_meals?select=*");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.every((row) => row.user_id === account.id));
    return result;
  };
  async function openPhoto(account) {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      try {
        if (url.origin !== base || ![analysisPath, photoPath].includes(url.pathname))
          return await fixture.route(route);
        const method = request.method();
        const headers = request.headers();
        const token = headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
        assert.equal(fixture.browserOwner(token), account.id);
        const body = request.postDataBuffer() ?? undefined;
        if (url.pathname === analysisPath) {
          assert.equal(method, "POST");
          assert.equal(url.search, "");
          assert.equal(headers["content-type"], "application/octet-stream");
          assert.deepEqual(
            [headers["x-meal-photo-width"], headers["x-meal-photo-height"]],
            ["1024", "768"],
          );
          assert.equal(body?.length, 1024 * 768 * 3);
          assert.deepEqual([...body.subarray(0, 3)], [52, 45, 40]);
          report.simulatedAnalysisRequests++;
          if (report.simulatedAnalysisRequests === 1)
            return await route.fulfill({ status: 502, json: { error: "meal_photo_provider" } });
          return await route.fulfill({
            status: 200,
            json: {
              items: [
                { name: "Ris", confidence: "medium", portion: { minGrams: 80, maxGrams: 140 } },
                { name: "Grönkål", confidence: "low", portion: null },
              ],
            },
          });
        }
        const response = await storage(new Request(url, { method, headers, body }));
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      } catch {
        report.fixtureErrors++;
        if (/^\/(?:api|auth|rest)\/[a-z_/-]+$/i.test(url.pathname))
          report.lastFailedRoute = request.method() + " " + url.pathname;
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.on("pageerror", () => report.pageErrors++);
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await page.waitForURL(
      (url) => url.origin === base && ["/", "/onboarding"].includes(url.pathname),
    );
    assert.ok(account.token);
    await page.goto(base + "/kitchen", { waitUntil: "domcontentloaded" });
    await page.getByRole("combobox", { name: "Fler vyer i köket" }).selectOption("meal-photo");
    const panel = page.getByRole("region", { name: "Måltidsfoto" });
    await panel.getByRole("button", { name: "Välj bild" }).waitFor();
    return panel;
  }

  report.phase = "browser_auth_and_review";
  const { owner, peer } = fixture;
  const panel = await openPhoto(owner);
  const file = await syntheticPhoto(await panel.page());
  const choose = () => panel.locator('input[type="file"]').setInputFiles(file);
  const analyze = () => panel.getByRole("button", { name: "Analysera bild" }).click();
  const confirm = () => panel.getByRole("button", { name: "Bekräfta underlaget" }).click();
  const discard = () => panel.getByRole("button", { name: "Kasta bilden" }).click();
  await choose();
  await panel.getByRole("link", { name: "OpenAI:s datahantering" }).waitFor();
  assert.equal(report.simulatedAnalysisRequests, 0);
  await analyze();
  await panel.getByRole("alert").filter({ hasText: "inget användbart svar" }).waitFor();
  await analyze();
  await panel.getByText(/80–140 g \(från bild\)/).waitFor();
  await panel.getByRole("textbox", { name: "Livsmedel 1", exact: true }).fill("Matvete");
  assert.equal(await panel.getByText(/80–140 g/).count(), 0);
  await panel.getByLabel("Egen mängd (g)").first().fill("160");
  await confirm();
  await panel.getByText("160 g (angivet manuellt)").waitFor();
  await panel.getByText("Okänd mängd", { exact: true }).waitFor();
  assert.deepEqual(await rows(owner), []);
  await discard();
  await panel.getByRole("button", { name: "Välj bild" }).waitFor();
  assert.deepEqual(await rows(owner), []);
  pass("real_login_and_discard_writes_nothing");

  report.phase = "browser_explicit_private_save";
  await choose();
  await analyze();
  await confirm();
  const keep = panel.getByRole("checkbox", { name: "Behåll bilden privat med måltiden" });
  assert.equal(await keep.isChecked(), false);
  await keep.check();
  await panel.getByRole("button", { name: "Spara måltid" }).click();
  await panel.getByText("Måltiden och bilden har sparats privat.").waitFor();
  const values = await rows(owner);
  assert.equal(values.length, 1);
  const [{ id, photo_state, photo_sha256 }] = values;
  assert.equal(photo_state, "ready");
  const history = panel.getByRole("region", { name: "Sparade fotomåltider" });
  await history.getByRole("button", { name: "Visa bild" }).click();
  const photo = history.getByRole("img", { name: "Sparad måltidsbild" });
  assert.match(await photo.getAttribute("src"), /^blob:/);
  assert.deepEqual(
    await photo.evaluate(async (img) => {
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }),
    [1024, 768],
  );
  const bucket = admin.storage.from("meal-photos");
  const path = owner.id + "/" + id + ".png";
  const stored = await bucket.download(path);
  assert.equal(stored.error, null);
  const hash = createHash("sha256")
    .update(Buffer.from(await stored.data.arrayBuffer()))
    .digest("hex");
  assert.equal(hash, photo_sha256);
  pass("explicit_save_and_private_storage_bytes");

  report.phase = "peer_isolation_and_browser_removal";
  await openPhoto(peer);
  assert.deepEqual(await rows(peer), []);
  const peerAccess = await storage(
    new Request(base + photoPath + "?id=" + id, {
      headers: { Authorization: "Bearer " + peer.token },
    }),
  );
  assert.equal(peerAccess.status, 404);
  assert.equal(report.realFixtureLogins, 2);
  pass("other_real_session_cannot_read_row_or_image");
  await history.getByRole("button", { name: "Ta bort bild", exact: true }).click();
  await history.getByRole("button", { name: "Bekräfta borttagning" }).click();
  await history.getByText("Bilden är borttagen.").waitFor();
  const after = await rows(owner);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, id);
  assert.equal(after[0].photo_state, "removed");
  assert.equal(after[0].photo_sha256, null);
  const deleted = await bucket.download(path);
  assert.ok(["404", "not_found", "NoSuchKey"].includes(String(deleted.error?.statusCode)));
  pass("browser_removal_deletes_private_object_and_keeps_meal");
  assert.equal(report.simulatedAnalysisRequests, 3);
  assert.equal(
    report.fixtureErrors + report.pageErrors + report.externalRequests + report.mutations,
    0,
  );
  assert.equal(denied, 2);
  report.completed = true;
} catch (error) {
  if (typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code))
    report.failureCode = error.code;
} finally {
  const results = await Promise.allSettled([
    browser?.close(),
    proxy && settleServer(proxy),
    sentinel && settleServer(sentinel),
    backend.close(),
  ]);
  report.cleanupCompleted = results.every(
    ({ status, value }) => status === "fulfilled" && value !== false,
  );
}
const directory = new URL("../dist/core-meal-photo/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL(`browser-real-backend-${report.checkedAt.replace(/[:.]/g, "-")}.json`, directory),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (!report.completed || !report.cleanupCompleted) process.exitCode = 1;
