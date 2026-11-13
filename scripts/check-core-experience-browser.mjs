import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  IndependentRuntimeRequestError,
  waitForIndependentRuntime,
} from "./lib/independent-readiness.mjs";

// Synthetic source UI only. No installed backend, real account or provider credentials.
assert.equal(process.argv.length, 2);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist/independent-runtime");
const artifacts = join(root, "dist/core-experience");
const fixtureOrigin = "https://example.invalid";
const fixtureKey = "sb_publishable_runtime_check_not_a_real_key";
const wineId = "11111111-2222-4333-8444-555555555555";
const longName = "SyntheticBottleWithAVeryLongUnbrokenWineNameForLayoutVerification";
const aroma = "SyntheticLongUnbrokenAromaDescriptorForSmallScreenVerification";
const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="400"><rect x="25" y="2" width="30" height="80" fill="#d4ba7d"/><rect x="8" y="80" width="64" height="318" rx="8" fill="#355d45"/><rect x="10" y="160" width="60" height="120" fill="#f2f5f2"/><rect x="10" y="375" width="60" height="20" fill="#ce8f9f"/></svg>',
  );
const wine = {
  id: wineId,
  user_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  wine_name: longName,
  producer: "Synthetic fixture",
  vintage: 2023,
  image_url: image,
  country: "SyntheticCountryWithAnUnbrokenLongName",
  region: "SyntheticRegionWithAnUnbrokenLongName",
  grape_varieties: ["SyntheticGrapeVarietyWithAnUnbrokenLongName"],
  wine_type: "white",
  primary_notes: [aroma],
  secondary_notes: [],
  tertiary_notes: [],
  tasting_notes: [],
  body: 3,
  acidity: 3,
  fruit: 3,
  tannin: 1,
  description: "Synthetic UI fixture. No real account or wine data.",
};
const authKey = "sb-example-auth-token";
const fixtureOwner = wine.user_id;
const fixturePeer = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
function simulatedSession(id) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: id, role: "authenticated", aud: "authenticated", exp }),
    ).toString("base64url"),
    "synthetic-not-a-valid-signature",
  ].join(".");
  return {
    access_token: token,
    refresh_token: `synthetic-only-${id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: {
      id,
      role: "authenticated",
      aud: "authenticated",
      email: `${id}@example.invalid`,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}
const ownerSession = simulatedSession(fixtureOwner),
  peerSession = simulatedSession(fixturePeer);
const syntheticUsers = new Map([
  ["Bearer " + ownerSession.access_token, ownerSession.user],
  ["Bearer " + peerSession.access_token, peerSession.user],
]);
const report = {
  synthetic: true,
  fixtureDataMocked: true,
  realAccountUsed: false,
  installedAppTouched: false,
  productionTouched: false,
  completed: false,
  cleanupCompleted: false,
  externalRequests: 0,
  mutations: 0,
  authenticationSimulated: false,
  simulatedAiRequests: 0,
  pageErrors: 0,
  passed: [],
  phase: "artifact_guard",
};
let child,
  closed,
  browser,
  logs = "";
try {
  const assets = join(output, "public/assets");
  let fixtureSeen = false;
  for (const name of await readdir(assets)) {
    if (!name.endsWith(".js")) continue;
    const content = await readFile(join(assets, name), "utf8");
    assert.ok(!/https:\/\/[a-z0-9]+\.supabase\.co/i.test(content));
    assert.ok(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(content));
    fixtureSeen ||= content.includes(fixtureOrigin) && content.includes(fixtureKey);
  }
  assert.equal(fixtureSeen, true, "Build the isolated runtime-check artifact first.");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  assert.ok(![5212, 54323, 8026].includes(port));
  const base = `http://127.0.0.1:${port}`;
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "USERPROFILE", "HOME", "TEMP", "TMP"])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    SUPABASE_URL: fixtureOrigin,
    SUPABASE_PUBLISHABLE_KEY: fixtureKey,
  });
  child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(join(root, "scripts/independent-fetch-guard.mjs")).href,
      join(output, "server/index.mjs"),
    ],
    { cwd: output, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  closed = new Promise((resolve) => child.once("close", resolve));
  child.stdout.on("data", (value) => {
    logs = (logs + value).slice(-16000);
  });
  child.stderr.on("data", (value) => {
    logs = (logs + value).slice(-16000);
  });
  report.phase = "readiness";
  await waitForIndependentRuntime({
    checkProcess: () => assert.equal(child.exitCode, null),
    request: async (path, options, remaining) => {
      try {
        return {
          response: await fetch(base + path, {
            ...options,
            redirect: "error",
            signal: AbortSignal.timeout(Math.min(15000, remaining)),
          }),
        };
      } catch {
        throw new IndependentRuntimeRequestError("Synthetic runtime pending.");
      }
    },
  });
  const { chromium } = await import(
    pathToFileURL(
      join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
    ).href
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(() => localStorage.setItem("lang", "en"));
  let galleryFailed = false,
    delayNextGallery = false,
    releaseGallery;
  let galleryArrived = () => {};
  let currentGallery = [];
  let delayOwnerAi = false,
    releaseOwnerAi,
    ownerAiArrived = () => {};
  const aiRequests = { owner: 0, peer: 0 };
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === base && ["GET", "HEAD"].includes(request.method())) return route.continue();
    if (url.origin === base) {
      report.mutations++;
      return route.abort();
    }
    if (url.origin === fixtureOrigin && request.method() === "GET") {
      if (url.pathname === "/auth/v1/user") {
        const user = syntheticUsers.get(request.headers().authorization);
        return json(route, user ?? { error: "synthetic_unauthorized" }, user ? 200 : 401);
      }
      if (url.pathname === "/rest/v1/wine_photos") {
        if (galleryFailed) return json(route, { message: "synthetic_read_failure" }, 503);
        if (delayNextGallery) {
          delayNextGallery = false;
          galleryArrived();
          await new Promise((resolve) => {
            releaseGallery = resolve;
          });
          return json(route, [
            {
              id: "eeeeeeee-aaaa-4bbb-8ccc-dddddddddddd",
              wine_id: wineId,
              user_id: fixtureOwner,
              url: image + "#stale-gallery",
              storage_path: null,
              kind: "bottle",
              sort_order: 1,
            },
          ]);
        }
        return json(route, currentGallery);
      }
      return json(route, url.pathname === "/rest/v1/wines" ? [wine] : []);
    }
    if (
      url.origin === fixtureOrigin &&
      url.pathname === "/functions/v1/wine-suggestions" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON(),
        user = syntheticUsers.get(request.headers().authorization);
      assert.ok(user && body.wineId === wineId && body.language === "en");
      report.simulatedAiRequests++;
      const isOwner = user.id === fixtureOwner;
      aiRequests[isOwner ? "owner" : "peer"]++;
      if (isOwner && delayOwnerAi) {
        ownerAiArrived();
        await new Promise((resolve) => {
          releaseOwnerAi = resolve;
        });
      }
      const suggestion = {
        producer: "Synthetic",
        wine_name: isOwner ? "Delayed owner-only suggestion" : "Current peer-only suggestion",
        vintage: 2023,
        country: "QA",
        region: "QA",
        wine_type: "white",
        identity_verified: true,
        source_url: "https://example.invalid/catalog/fixture",
        match_score: 70,
        match_confidence: "low",
        match_evidence: [],
        reason: "Synthetic fixture only",
      };
      // The old request may already be cancelled by the real source AbortController.
      try {
        await json(route, { suggestions: [suggestion] });
      } catch {
        if (!isOwner) throw new Error("Current synthetic response failed");
      }
      return;
    }
    if (url.origin === fixtureOrigin && request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": base,
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    if (url.origin === fixtureOrigin) report.mutations++;
    else report.externalRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  const styleFixture = () =>
    page.evaluate(() => {
      document.documentElement.classList.add("pilot-ui");
      document.documentElement.style.fontSize = "125%";
    });
  page.setDefaultTimeout(30000);
  page.on("pageerror", () => report.pageErrors++);
  await mkdir(artifacts, { recursive: true });
  report.phase = "wine_detail";
  await page.goto(base + "/wine/" + wineId, { waitUntil: "domcontentloaded" });
  const title = page.getByRole("heading", { level: 1, name: longName + " 2023", exact: true });
  await title.waitFor();
  // The same shipped stylesheet, with the selected dark palette, without enabling backend features.
  await styleFixture();
  await page.getByRole("tab", { name: "AI Suggestions", exact: true }).click();
  await page.getByText(aroma, { exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    report.phase = `layout-${width}`;
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "125%";
    });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    );
    for (const target of [title, page.getByText(aroma, { exact: true })])
      assert.equal(await target.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
    const bottle = title.locator("../..").locator("img");
    await bottle.waitFor();
    await bottle.evaluate((el) => el.decode());
    assert.equal(
      await bottle.evaluate(
        (el) =>
          el.complete &&
          el.naturalHeight > el.naturalWidth &&
          getComputedStyle(el).objectFit === "contain",
      ),
      true,
    );
    await page.screenshot({
      path: join(artifacts, `wine-detail-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    report.passed.push(`contained-image-and-long-labels-${width}`);
  }
  report.phase = "private_sharing";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Share", exact: true }).isDisabled(), true);
  await page
    .getByText(
      "Public sharing is unavailable in this private installation. Your wine remains unchanged.",
      { exact: true },
    )
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "More", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  report.passed.push("private-share-disabled-and-keyboard-return");
  report.phase = "read_only_gallery";
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  const viewPhoto = page.getByRole("button", { name: "View wine photo", exact: true });
  await viewPhoto.waitFor();
  assert.equal(await page.getByText("Add photo", { exact: true }).count(), 0);
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: "Delete wine", exact: true }).count(), 0);
  report.passed.push("read-only-gallery-no-upload");
  report.phase = "read_only_lightbox";
  await viewPhoto.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("img").evaluate((el) => el.decode());
  assert.equal(
    await dialog
      .locator("img")
      .evaluate(
        (el) => el.complete && el.naturalHeight > 0 && getComputedStyle(el).objectFit === "contain",
      ),
    true,
  );
  await page.screenshot({ path: join(artifacts, "wine-photo-390.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  assert.equal(await viewPhoto.evaluate((el) => el === document.activeElement), true);
  report.passed.push("read-only-photo-keyboard-return");
  report.phase = "gallery_read_failure";
  galleryFailed = true;
  await page.reload();
  await title.waitFor();
  await styleFixture();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByText("Photos could not be loaded. This does not mean the gallery is empty.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByText("No extra photos yet.", { exact: true }).count(), 0);
  await page.screenshot({
    path: join(artifacts, "gallery-error-390.png"),
    fullPage: true,
    animations: "disabled",
  });
  galleryFailed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByText("Photos could not be loaded. This does not mean the gallery is empty.", {
      exact: true,
    })
    .waitFor({ state: "hidden" });
  report.passed.push("gallery-read-error-is-not-empty-and-retry");
  report.phase = "gallery_read_generation";
  delayNextGallery = true;
  const firstRead = new Promise((resolve) => {
    galleryArrived = resolve;
  });
  await page.reload();
  await title.waitFor();
  await styleFixture();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await firstRead;
  currentGallery = [
    {
      id: "ffffffff-aaaa-4bbb-8ccc-dddddddddddd",
      wine_id: wineId,
      user_id: fixtureOwner,
      url: image + "#current-gallery",
      storage_path: null,
      kind: "bottle",
      sort_order: 2,
    },
  ];
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator('img[src$="#current-gallery"]').waitFor();
  const oldRead = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/rest/v1/wine_photos",
  );
  releaseGallery();
  await (await oldRead).finished();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.locator('img[src$="#stale-gallery"]').count(), 0);
  assert.equal(await page.locator('img[src$="#current-gallery"]').count(), 1);
  report.passed.push("late-gallery-read-does-not-replace-a-newer-read");
  currentGallery = [];
  report.authenticationSimulated = true;
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: authKey, session: ownerSession },
  );
  const switchAccount = (session) =>
    page.evaluate(
      ({ key, session }) => {
        localStorage.setItem(key, JSON.stringify(session));
        const channel = new BroadcastChannel(key);
        channel.postMessage({ event: "SIGNED_IN", session });
        channel.close();
      },
      { key: authKey, session },
    );
  report.phase = "pending_photo_account_change";
  await page.reload();
  await title.waitFor();
  await styleFixture();
  const ownerControl = page.getByRole("button", { name: "Delete wine", exact: true });
  await ownerControl.waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.locator('input[type="file"]').waitFor({ state: "attached" });
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 180;
    const draw = canvas.getContext("2d");
    draw.fillStyle = "#355d45";
    draw.fillRect(10, 0, 40, 180);
    draw.fillStyle = "#f2f5f2";
    draw.fillRect(10, 70, 40, 60);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-only.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.getByText("Adjust label", { exact: true }).waitFor();
  await page.locator('img[src^="blob:"]').evaluate((element) => element.decode());
  await switchAccount(peerSession);
  await page.getByText("Adjust label", { exact: true }).waitFor({ state: "hidden" });
  await page.waitForFunction(() => !document.querySelector('input[type="file"]'));
  await ownerControl.waitFor({ state: "hidden" });
  report.passed.push("pending-photo-clears-on-account-change");
  report.phase = "late_ai_account_change";
  await switchAccount(ownerSession);
  await ownerControl.waitFor({ state: "attached" });
  delayOwnerAi = true;
  const firstAi = new Promise((resolve) => {
    ownerAiArrived = resolve;
  });
  await page.getByRole("button", { name: "AI Picks", exact: true }).click();
  await firstAi;
  await switchAccount(peerSession);
  await ownerControl.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button[aria-pressed="true"]')].some(
      (button) => button.textContent === "Aromas",
    ),
  );
  assert.equal(aiRequests.peer, 0);
  await page.getByRole("button", { name: "AI Picks", exact: true }).click();
  await page.getByText("Current peer-only suggestion", { exact: true }).waitFor();
  releaseOwnerAi();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.getByText("Delayed owner-only suggestion", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Current peer-only suggestion", { exact: true }).count(), 1);
  assert.deepEqual(aiRequests, { owner: 1, peer: 1 });
  report.passed.push("late-ai-answer-isolated-and-no-automatic-new-account-request");
  assert.equal(report.externalRequests, 0);
  assert.equal(report.mutations, 0);
  assert.equal(report.pageErrors, 0);
  assert.equal(logs.includes("INDEPENDENT_CHECK_OUTBOUND_FETCH_BLOCKED"), false);
  report.completed = true;
} catch (error) {
  report.failure = "synthetic_core_experience_not_accepted";
  report.errorType = error.name === "AssertionError" ? "AssertionError" : "Error";
} finally {
  await browser?.close().catch(() => undefined);
  if (child && child.exitCode === null) child.kill();
  if (closed) await closed;
  report.cleanupCompleted = !child || child.exitCode !== null || child.signalCode !== null;
}
await mkdir(artifacts, { recursive: true });
await writeFile(join(artifacts, "status.json"), JSON.stringify(report));
console.log(JSON.stringify(report));
if (!report.completed || !report.cleanupCompleted) process.exitCode = 1;
