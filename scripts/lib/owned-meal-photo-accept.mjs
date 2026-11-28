import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ownedApi, ownedApp, ownedToken, validateOwnedKeys } from "./owned-backend.mjs";
import {
  assertFixtureOwner,
  ownedBrowserFixture,
  ownedBrowserPassword,
} from "./owned-browser-fixture.mjs";
import { syntheticPhoto } from "./core-meal-photo-browser.mjs";
import { pantryBrowserRequest } from "./owned-pantry-accept.mjs";

const analysisPath = "/api/ai/analyze-meal-photo";
const photoPath = "/api/meal-photo";
const rowPath = "/rest/v1/kitchen_photo_meals";
const savePath = "/rest/v1/rpc/kitchen_save_photo_meal";
const saveColumns = "id,user_id,created_at,items,keep_photo,photo_state,photo_sha256";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const accessRpcs = new Set(["kitchen_access", "meals_access", "privacy_me_active"]);
const fixtureOptions = { planningOnly: true, cleanupMealPhotos: true };
const estimate = {
  items: [
    { name: "Ris", confidence: "medium", portion: { minGrams: 80, maxGrams: 140 } },
    { name: "Grönkål", confidence: "low", portion: null },
  ],
};
const corrected = [
  { name: "Matvete", portion: { source: "manual", grams: 160 } },
  { name: "Grönkål", portion: null },
];

export function mealPhotoBrowserRequest(value, method) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "blocked";
  }
  if (url.username || url.password || url.hash) return "blocked";
  if (url.origin === ownedApp && url.pathname === analysisPath)
    return !url.search && method === "POST" ? "estimate" : "blocked";
  if (url.origin === ownedApp && url.pathname === photoPath) {
    return ["GET", "POST", "DELETE"].includes(method) &&
      uuid.test(url.searchParams.get("id") ?? "") &&
      [...url.searchParams].length === 1
      ? "photo"
      : "blocked";
  }
  if (url.origin === ownedApi) {
    if (["OPTIONS", "GET", "POST"].includes(method)) {
      if (method === "OPTIONS" && [rowPath, savePath].includes(url.pathname))
        return mealPhotoBrowserRequest(value, url.pathname === rowPath ? "GET" : "POST") === "api"
          ? "preflight"
          : "blocked";
      if (
        (method === "GET" && url.pathname === rowPath) ||
        (method === "POST" &&
          url.pathname === savePath &&
          (!url.search ||
            ([...url.searchParams].length === 1 && url.searchParams.get("select") === saveColumns)))
      )
        return "api";
    }
    if (
      url.pathname.startsWith("/rest/v1/rpc/") &&
      (!accessRpcs.has(url.pathname.slice(13)) || url.search)
    )
      return "blocked";
  }
  return pantryBrowserRequest(value, method);
}

export async function cleanupOwnedMealPhotoFixtures(keys, fixtures) {
  let cleaned = true;
  for (const fixture of fixtures.filter(Boolean)) {
    try {
      const result = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, fixtureOptions);
      assert.ok(result.cleanupCompleted || result.alreadyClean);
    } catch {
      cleaned = false;
    }
  }
  return cleaned;
}

export async function acceptOwnedMealPhotos(keys, { manifests, progress }) {
  validateOwnedKeys(keys);
  assert.equal(manifests.length, 2);
  assert.equal(typeof progress, "function");
  const anon = ownedToken(keys, "anon");
  const admin = createClient(ownedApi, ownedToken(keys, "service_role"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch(input, options) {
        assert.equal(new URL(input instanceof Request ? input.url : input).origin, ownedApi);
        return fetch(input, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
      },
    },
  });
  const fixtureRows = [];
  const report = {
    completed: false,
    cleanupCompleted: false,
    phase: "fixture",
    pausedTunnelRequired: true,
    browserAnalysisSimulated: true,
    simulatedRequests: 0,
    realSyntheticProviderCalls: 0,
    realAccountsChanged: false,
    blockedRequests: 0,
    pageErrors: 0,
    passed: [],
  };
  const stage = (name) => {
    report.phase = name;
    progress("meal_photo_accept_" + name);
  };
  const pass = (name) => report.passed.push(name);
  const inFlight = new Set();
  let stopping = false;
  const local = (origin, path, init = {}) => {
    assert.ok(!stopping && [ownedApi, ownedApp].includes(origin));
    assert.ok(path.startsWith("/") && !path.startsWith("//"));
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const request = fetch(url, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
    inFlight.add(request);
    const finished = () => inFlight.delete(request);
    void request.then(finished, finished);
    return request;
  };
  const tokenHeaders = (session) => ({
    apikey: anon,
    authorization: "Bearer " + session.access_token,
  });
  const rows = async (session) => {
    const response = await local(ownedApi, rowPath + "?select=*", {
      headers: tokenHeaders(session),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(Array.isArray(result) && result.every((item) => item.user_id === session.user.id));
    return result;
  };
  const readPhoto = (session, id) => {
    assert.match(id, uuid);
    return local(ownedApp, photoPath + "?id=" + id, {
      headers: { authorization: tokenHeaders(session).authorization },
    });
  };
  let browser, proxy;
  try {
    for (const manifest of manifests) {
      if (manifest.fixture)
        await ownedBrowserFixture(keys, "absent", manifest.fixture, undefined, fixtureOptions);
      await ownedBrowserFixture(
        keys,
        "prepare",
        undefined,
        async (fixture) => {
          fixtureRows.push(fixture);
          await manifest.remember(fixture);
        },
        fixtureOptions,
      );
    }
    stage("browser_backstop");
    const { chromium } = await import(
      pathToFileURL(
        join(
          process.env.USERPROFILE,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
        ),
      ).href
    );
    proxy = createServer((_request, response) => {
      response.writeHead(403, { "x-fixture": "network-denied", Connection: "close" });
      response.end();
    });
    proxy.on("connect", (_request, socket) => socket.destroy());
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-background-networking"],
      proxy: { server: "http://127.0.0.1:" + proxy.address().port, bypass: "<-loopback>" },
    });
    const canary = await browser.newPage();
    const denied = await canary.goto(ownedApp + "/api/health");
    assert.equal(denied.status(), 403);
    assert.equal(await denied.headerValue("x-fixture"), "network-denied");
    await canary.close();
    report.browserBackstopVerified = true;

    async function openPhoto(fixture) {
      const password = ownedBrowserPassword(keys, fixture.run);
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(() => localStorage.setItem("lang", "sv"));
      let session, savedId;
      await context.route("**/*", async (route) => {
        const request = route.request();
        try {
          const url = new URL(request.url());
          const method = request.method();
          const decision = mealPhotoBrowserRequest(url.href, method);
          const cors = { "access-control-allow-origin": ownedApp };
          if (decision === "preflight")
            return await route.fulfill({
              status: 204,
              headers: {
                ...cors,
                "access-control-allow-headers":
                  "authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,x-supabase-api-version,range,range-unit",
                "access-control-allow-methods": "GET,POST,OPTIONS",
              },
            });
          if (decision === "login") {
            const body = request.postDataJSON();
            assert.ok(!session && body?.email === fixture.email && body?.password === password);
          } else if (["api", "photo", "estimate"].includes(decision)) {
            assert.ok(session);
            assert.equal(request.headers().authorization, tokenHeaders(session).authorization);
          } else {
            assert.equal(decision, "web");
          }
          const incoming = request.headers();
          const headers = Object.fromEntries(
            Object.entries(incoming).filter(([name]) =>
              [
                "accept",
                "content-type",
                "prefer",
                "range",
                "range-unit",
                "x-meal-photo-width",
                "x-meal-photo-height",
              ].includes(name),
            ),
          );
          const body = request.postDataBuffer() ?? undefined;
          if (decision === "estimate" || (decision === "photo" && method === "POST")) {
            assert.equal(fixture, fixtureRows[0]);
            assert.equal(headers["content-type"], "application/octet-stream");
            assert.deepEqual(
              [headers["x-meal-photo-width"], headers["x-meal-photo-height"]],
              ["1024", "768"],
            );
            assert.equal(body?.length, 1024 * 768 * 3);
            assert.deepEqual([...body.subarray(0, 3)], [52, 45, 40]);
          }
          if (decision === "estimate") {
            report.simulatedRequests++;
            return await route.fulfill(
              report.simulatedRequests === 1
                ? { status: 502, json: { error: "meal_photo_provider" } }
                : { status: 200, json: estimate },
            );
          }
          if (url.pathname === savePath && decision === "api") {
            assert.equal(fixture, fixtureRows[0]);
            const payload = request.postDataJSON();
            assert.ok(!savedId && uuid.test(payload?._id ?? ""));
            assert.equal(payload._keep_photo, true);
            assert.deepEqual(payload._items, corrected);
            savedId = payload._id;
          }
          if (decision === "photo") {
            assert.equal(fixture, fixtureRows[0]);
            assert.equal(url.searchParams.get("id"), savedId);
          }
          if (decision !== "web") {
            if (url.origin === ownedApi) headers.apikey = anon;
            headers.authorization =
              decision === "login" ? "Bearer " + anon : tokenHeaders(session).authorization;
          }
          const response = await local(url.origin, url.pathname + url.search, {
            method,
            headers,
            body,
          });
          if (decision === "login") {
            assert.equal(response.status, 200);
            const value = await response.clone().json();
            assertFixtureOwner(value.user, fixture);
            assert.match(value.access_token, /^[A-Za-z0-9_.-]+$/);
            session = { user: value.user, access_token: value.access_token };
          }
          const reply = { ...cors };
          for (const name of ["content-type", "range-unit", "content-range"]) {
            if (response.headers.has(name)) reply[name] = response.headers.get(name);
          }
          await route.fulfill({
            status: response.status,
            headers: reply,
            body: Buffer.from(await response.arrayBuffer()),
          });
        } catch {
          report.blockedRequests++;
          const path = new URL(request.url()).pathname;
          if (/^\/(?:api|auth|rest)\/[a-z0-9_/-]+$/i.test(path))
            report.lastBlockedRoute = request.method() + " " + path;
          await route.abort().catch(() => {});
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(40000);
      page.on("pageerror", () => report.pageErrors++);
      report.browserStep = "login_document";
      await page.goto(ownedApp + "/login", { waitUntil: "networkidle" });
      await page.locator("#email").fill(fixture.email);
      await page.locator("#password").fill(password);
      report.browserStep = "login_submit";
      await page.getByRole("button", { name: "Logga in", exact: true }).click();
      await page.waitForURL(
        (url) => url.origin === ownedApp && ["/", "/onboarding"].includes(url.pathname),
      );
      assert.ok(session);
      report.browserStep = "kitchen_panel";
      await page.goto(ownedApp + "/kitchen", { waitUntil: "domcontentloaded" });
      await page.getByRole("combobox", { name: "Fler vyer i köket" }).selectOption("meal-photo");
      const panel = page.getByRole("region", { name: "Måltidsfoto" });
      await panel.getByRole("button", { name: "Välj bild" }).waitFor();
      return { panel, page, session };
    }

    stage("review_and_discard");
    const { panel, page, session } = await openPhoto(fixtureRows[0]);
    const file = await syntheticPhoto(page);
    const pick = () => panel.locator('input[type="file"]').setInputFiles(file);
    const analyze = () => panel.getByRole("button", { name: "Analysera bild" }).click();
    const review = async () => {
      await panel.getByText(/80–140 g \(från bild\)/).waitFor();
      await panel.getByRole("textbox", { name: "Livsmedel 1", exact: true }).fill("Matvete");
      assert.equal(await panel.getByText(/80–140 g/).count(), 0);
      await panel.getByLabel("Egen mängd (g)").first().fill("160");
      await panel.getByRole("button", { name: "Bekräfta underlaget" }).click();
      await panel.getByText("160 g (angivet manuellt)").waitFor();
      await panel.getByText("Okänd mängd", { exact: true }).waitFor();
    };
    await pick();
    await panel.getByRole("link", { name: "OpenAI:s datahantering" }).waitFor();
    assert.equal(report.simulatedRequests, 0);
    await analyze();
    await panel.getByRole("alert").filter({ hasText: "inget användbart svar" }).waitFor();
    await analyze();
    await review();
    assert.deepEqual(await rows(session), []);
    await panel.getByRole("button", { name: "Kasta bilden" }).click();
    await panel.getByRole("button", { name: "Välj bild" }).waitFor();
    assert.deepEqual(await rows(session), []);
    pass("review_correction_and_discard_do_not_write");

    stage("save_and_owner_isolation");
    await pick();
    await analyze();
    await review();
    const keep = panel.getByRole("checkbox", { name: "Behåll bilden privat med måltiden" });
    assert.equal(await keep.isChecked(), false);
    await keep.check();
    report.browserStep = "submit_meal_and_attachment";
    await panel.getByRole("button", { name: "Spara måltid" }).click();
    await panel.getByText("Måltiden och bilden har sparats privat.").waitFor();
    const values = await rows(session);
    assert.equal(values.length, 1);
    const [meal] = values;
    assert.equal(meal.photo_state, "ready");
    assert.deepEqual(meal.items, corrected);
    report.browserStep = "read_retained_image";
    const history = panel.getByRole("region", { name: "Sparade fotomåltider" });
    await history.getByRole("button", { name: "Visa bild" }).click();
    const image = history.getByRole("img", { name: "Sparad måltidsbild" });
    assert.match(await image.getAttribute("src"), /^blob:/);
    assert.deepEqual(
      await image.evaluate(async (element) => {
        await element.decode();
        return [element.naturalWidth, element.naturalHeight];
      }),
      [1024, 768],
    );
    const served = await readPhoto(session, meal.id);
    assert.equal(served.status, 200);
    const digest = createHash("sha256")
      .update(Buffer.from(await served.arrayBuffer()))
      .digest("hex");
    assert.equal(digest, meal.photo_sha256);
    const { session: peer } = await openPhoto(fixtureRows[1]);
    assert.deepEqual(await rows(peer), []);
    assert.equal((await readPhoto(peer, meal.id)).status, 404);
    pass("installed_owner_only_photo_and_persisted_correction");

    stage("private_account_export");
    const exportAccount = async (scope) => {
      const response = await local(ownedApp, "/api/privacy/privacy-export", {
        method: "POST",
        headers: {
          authorization: tokenHeaders(scope).authorization,
          "content-type": "application/json",
        },
        body: "{}",
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.format, "WineSnap user export v2");
      assert.equal(data.account.id, scope.user.id);
      return data;
    };
    const ownExport = await exportAccount(session);
    assert.equal(ownExport.tables.kitchen_photo_meals.length, 1);
    assert.equal(ownExport.tables.kitchen_photo_meals[0].id, meal.id);
    assert.deepEqual(ownExport.files, [
      {
        bucket: "meal-photos",
        path: session.user.id + "/" + meal.id + ".png",
        mealId: meal.id,
      },
    ]);
    const peerExport = await exportAccount(peer);
    assert.deepEqual(peerExport.tables.kitchen_photo_meals, []);
    assert.deepEqual(peerExport.files, []);
    pass("installed_export_has_owner_manifest_not_a_signed_image_link");

    stage("delete_image_keep_meal");
    await history.getByRole("button", { name: "Ta bort bild", exact: true }).click();
    await history.getByRole("button", { name: "Bekräfta borttagning" }).click();
    await history.getByText("Bilden är borttagen.").waitFor();
    const remaining = await rows(session);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, meal.id);
    assert.equal(remaining[0].photo_state, "removed");
    assert.equal(remaining[0].photo_sha256, null);
    assert.equal((await readPhoto(session, meal.id)).status, 404);
    const objects = await admin.storage.from("meal-photos").list(session.user.id, { limit: 2 });
    assert.equal(objects.error, null);
    assert.deepEqual(objects.data, []);
    pass("installed_delete_removes_object_but_not_meal");

    stage("live_synthetic_provider");
    const { mealPhotoFixture, gradeMealPhoto } = await import("./meal-photo-quality-fixtures.ts");
    const { pixels, width, height } = mealPhotoFixture("no-scale");
    report.realSyntheticProviderCalls++;
    const actual = await local(ownedApp, analysisPath, {
      method: "POST",
      headers: {
        authorization: tokenHeaders(session).authorization,
        "content-type": "application/octet-stream",
        "x-meal-photo-width": String(width),
        "x-meal-photo-height": String(height),
        "x-meal-photo-language": "sv",
      },
      body: pixels,
    });
    report.liveAnalysisHttp = actual.status;
    assert.equal(actual.status, 200);
    const analysis = gradeMealPhoto("no-scale", await actual.json());
    report.liveSyntheticUnmeasuredAmountPassed = analysis.passed;
    assert.ok(analysis.passed);
    assert.equal((await rows(session)).length, 1);
    pass("installed_provider_preserves_unknown_portion");
    assert.equal(report.simulatedRequests, 3);
    assert.equal(report.pageErrors + report.blockedRequests, 0);
    report.completed = true;
  } catch (error) {
    report.errorType = ["AssertionError", "TimeoutError"].includes(error.name)
      ? error.name
      : "Error";
  } finally {
    stopping = true;
    const results = await Promise.allSettled([
      browser?.close(),
      proxy &&
        new Promise((resolve, reject) => {
          proxy.close((error) => (error ? reject(error) : resolve()));
          proxy.closeAllConnections();
        }),
    ]);
    await Promise.allSettled([...inFlight]);
    const fixturesCleaned = await cleanupOwnedMealPhotoFixtures(keys, fixtureRows);
    report.cleanupCompleted =
      fixturesCleaned && results.every(({ status }) => status === "fulfilled");
  }
  return report;
}
