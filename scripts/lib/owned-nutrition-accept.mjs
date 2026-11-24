import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ownedApi, ownedApp, ownedToken, validateOwnedKeys } from "./owned-backend.mjs";
import {
  assertFixtureOwner,
  ownedBrowserFixture,
  ownedBrowserPassword,
} from "./owned-browser-fixture.mjs";
import { pantryBrowserRequest } from "./owned-pantry-accept.mjs";
import { acceptRecipeNutrition } from "./recipe-nutrition-browser.mjs";

const recipeSave = "/rest/v1/rpc/kitchen_save_recipe";
const rpcs = new Set([
  recipeSave,
  "/rest/v1/rpc/kitchen_save_week_plan",
  "/rest/v1/rpc/kitchen_access",
  "/rest/v1/rpc/meals_access",
  "/rest/v1/rpc/privacy_me_active",
]);

export function nutritionBrowserRequest(value, method) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "blocked";
  }
  if (method === "OPTIONS") {
    const decisions = ["GET", "POST"].map((verb) => nutritionBrowserRequest(value, verb));
    return decisions.some((decision) => ["api", "login"].includes(decision))
      ? "preflight"
      : "blocked";
  }
  if (url.origin === ownedApi && method === "POST" && url.pathname.startsWith("/rest/")) {
    return !url.username && !url.password && !url.search && rpcs.has(url.pathname)
      ? "api"
      : "blocked";
  }
  return pantryBrowserRequest(value, method);
}

function nutritionFixture(session, anon, relay = fetch) {
  const current = session.user.id;
  const request = (path, { method = "GET", body } = {}) =>
    relay(ownedApi + path, {
      method,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  return {
    owner: current,
    async recipe(owner, title, _household, ingredient) {
      assert.equal(owner, current);
      assert.equal(_household, undefined);
      const id = randomUUID(),
        recipeId = randomUUID();
      const response = await request(recipeSave, {
        method: "POST",
        body: {
          _recipe_id: recipeId,
          _version_id: id,
          _expected_revision: 0,
          _document: {
            title,
            description: "Syntetiskt prov av portionsberakning och receptversioner.",
            servings: 2,
            totalMinutes: 15,
            image: "none",
            sourceNote: "Local synthetic nutrition QA",
            notes: "",
            ingredients: [{ id: randomUUID(), ...ingredient, unit: "g" }],
            steps: [
              {
                id: randomUUID(),
                title: "Teststeg",
                text: "Syntetiskt matlagningssteg.",
                timerSeconds: null,
              },
            ],
          },
        },
      });
      assert.equal(response.status, 200);
      return { id, recipeId };
    },
    async rest(owner, path) {
      assert.equal(owner, current);
      assert.match(path, /^\/kitchen_(?:recipe_versions|week_plans)\?/);
      const url = new URL(ownedApi + "/rest/v1" + path);
      url.searchParams.set("user_id", `eq.${current}`);
      const response = await request(url.pathname + url.search);
      assert.equal(response.status, 200);
      const rows = await response.clone().json();
      assert.ok(Array.isArray(rows) && rows.every((row) => row.user_id === current));
      return response;
    },
  };
}

export function acceptInstalledNutrition(keys, options) {
  return runAcceptance(keys, options);
}

const rehearsalApi = "http://127.0.0.1:54323";

export function rehearseNutritionAcceptance(keys, options, rehearsal) {
  const base = new URL(rehearsal.base);
  assert.match(base.origin, /^http:\/\/127\.0\.0\.1:\d{4,5}$/);
  assert.equal(base.href, base.origin + "/");
  assert.ok(![ownedApp, ownedApi, rehearsalApi, "http://127.0.0.1:8026"].includes(base.origin));
  assert.equal(typeof rehearsal.relay, "function");
  assert.equal(typeof rehearsal.relayWeb, "function");
  assert.equal(typeof rehearsal.browser?.newContext, "function");
  return runAcceptance(keys, options, rehearsal);
}

async function runAcceptance(keys, { previous, remember, artifactDirectory, progress }, rehearsal) {
  validateOwnedKeys(keys);
  assert.equal(typeof remember, "function");
  assert.equal(typeof progress, "function");
  const options = { planningOnly: true, relay: rehearsal?.relay };
  const base = rehearsal?.base ?? ownedApp;
  const anon = ownedToken(keys, "anon");
  const report = {
    completed: false,
    cleanupCompleted: false,
    realAccountsChanged: false,
    productionTouched: false,
    hostedTestTouched: false,
    phase: "nutrition_prepare",
    passed: [],
    blockedRequests: 0,
    pageErrors: 0,
  };
  await mkdir(artifactDirectory, { recursive: true });
  const directory = await lstat(artifactDirectory);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  let created, session, browser, context;
  try {
    if (previous) await ownedBrowserFixture(keys, "absent", previous, undefined, options);
    await ownedBrowserFixture(
      keys,
      "prepare",
      undefined,
      async (fixture) => {
        created = fixture;
        await remember(fixture);
      },
      options,
    );
    const password = ownedBrowserPassword(keys, created.run);
    if (!rehearsal) {
      const { chromium } = await import(
        pathToFileURL(
          join(
            process.env.USERPROFILE,
            ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
          ),
        ).href
      );
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-background-networking"],
      });
    }
    context = await (rehearsal?.browser ?? browser).newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addInitScript(() => localStorage.setItem("lang", "sv"));
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        const url = new URL(request.url());
        const path = url.pathname + url.search;
        const method = request.method();
        const mapped =
          !rehearsal || url.username || url.password
            ? url.href
            : url.origin === base
              ? ownedApp + path
              : url.origin === rehearsalApi
                ? ownedApi + path
                : "invalid";
        const decision = nutritionBrowserRequest(mapped, method);
        if (decision === "web") {
          if (!rehearsal) return route.continue();
          const response = await rehearsal.relayWeb(path, method);
          if (response.headers.location)
            assert.equal(new URL(response.headers.location, base).origin, base);
          return await route.fulfill(response);
        }
        const cors = { "access-control-allow-origin": base };
        if (decision === "preflight") {
          if (!rehearsal) return route.continue();
          return await route.fulfill({
            status: 204,
            headers: {
              ...cors,
              "access-control-allow-headers": "*",
              "access-control-allow-methods": "GET,POST,OPTIONS",
            },
          });
        }
        async function forward(incoming, token = anon) {
          if (!rehearsal) {
            const response = await route.fetch({ maxRedirects: 0 });
            return {
              status: response.status(),
              json: () => response.json(),
              reply: () => route.fulfill({ response }),
            };
          }
          assert.equal(url.origin, rehearsalApi);
          assert.equal(incoming.apikey, "sb_publishable_runtime_check_not_a_real_key");
          const headers = Object.fromEntries(
            Object.entries(incoming).filter(([name]) =>
              ["accept", "prefer", "range", "range-unit", "content-type"].includes(name),
            ),
          );
          const response = await rehearsal.relay(ownedApi + path, {
            method,
            headers: { ...headers, apikey: anon, authorization: `Bearer ${token}` },
            body: request.postData() ?? undefined,
          });
          report.isolatedBrowserRequests = (report.isolatedBrowserRequests ?? 0) + 1;
          return {
            status: response.status,
            json: () => response.clone().json(),
            reply: async () =>
              route.fulfill({
                status: response.status,
                headers: { ...Object.fromEntries(response.headers), ...cors },
                body: Buffer.from(await response.arrayBuffer()),
              }),
          };
        }
        if (decision === "login" && !session) {
          const body = request.postDataJSON();
          if (body?.email === created.email && body?.password === password) {
            report.fixtureLoginRequestSent = true;
            const response = await forward(await request.allHeaders());
            if (response.status === 200) {
              const result = await response.json();
              assertFixtureOwner(result.user, created);
              assert.match(result.access_token, /^[A-Za-z0-9_.-]+$/);
              session = { user: result.user, access_token: result.access_token };
              report.fixtureLoginTokenVerified = true;
              return await response.reply();
            }
          }
        } else if (decision === "api" && session) {
          const incoming = await request.allHeaders();
          if (incoming.authorization === `Bearer ${session.access_token}`) {
            const response = await forward(incoming, session.access_token);
            if (response.status < 300 || response.status >= 400) return await response.reply();
          }
        }
      } catch {
        /* Never report request headers or authentication bodies. */
      }
      report.blockedRequests++;
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on("pageerror", () => report.pageErrors++);
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (url.origin === (rehearsal ? rehearsalApi : ownedApi) && url.pathname === "/auth/v1/token")
        report.fixtureLoginNetworkFailed = true;
    });
    const phase = (name) => {
      report.phase = "nutrition_fixture_login_" + name;
      progress(report.phase);
    };
    phase("document");
    const loginPage = await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
    assert.equal(loginPage?.status(), 200);
    phase("interactive");
    // The server-rendered inputs can be visible before the form handles events.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Inget konto? Skapa ett", exact: true }).click();
    await page.locator("#name").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Har du redan konto? Logga in", exact: true }).click();
    await page.locator("#name").waitFor({ state: "detached" });
    phase("form");
    const emailField = page.locator("#email");
    const passwordField = page.locator("#password");
    await emailField.fill(created.email);
    await passwordField.fill(password);
    assert.ok((await emailField.inputValue()) === created.email);
    assert.ok((await passwordField.inputValue()) === password);
    assert.ok(await emailField.evaluate((input) => input.form?.checkValidity()));
    phase("submit");
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    phase("landing");
    await page.waitForURL(base + "/");
    assert.ok(session);
    report.fixtureBrowserLoginVerified = true;
    await acceptRecipeNutrition({
      page,
      base,
      fixture: nutritionFixture(session, anon, rehearsal?.relay),
      report,
      progress,
      async capture(name, width) {
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({
          path: join(artifactDirectory, `${name}-${width}.png`),
          animations: "disabled",
        });
      },
    });
    assert.equal(report.blockedRequests, 0);
    assert.equal(report.pageErrors, 0);
    report.completed = true;
  } catch (error) {
    report.failure = "owned_nutrition_acceptance_failed";
    report.errorType = ["AssertionError", "TimeoutError"].includes(error.name)
      ? error.name
      : "Error";
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (created) {
      try {
        const cleaned = await ownedBrowserFixture(keys, "cleanup", created, undefined, options);
        report.cleanupCompleted = Boolean(cleaned.cleanupCompleted || cleaned.alreadyClean);
      } catch {
        report.cleanupCompleted = false;
      }
    }
    if (!report.cleanupCompleted) report.completed = false;
    await writeFile(join(artifactDirectory, "status.json"), JSON.stringify(report));
  }
  return report;
}
