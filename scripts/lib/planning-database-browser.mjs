import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createHandler as exportHandler } from "../../supabase/functions/privacy-export/handler.ts";

const authPaths = new Set(["/token", "/user", "/logout"]);
const tables = new Set([
  "/profiles",
  "/user_roles",
  "/wines",
  "/kitchen_recipes",
  "/kitchen_recipe_versions",
  "/cooking_sessions",
  "/cooking_feedback",
  "/kitchen_week_plans",
  "/restaurant_scans",
  "/taste_profile",
  "/wishlist",
]);
const rpcs = new Set([
  "/rpc/kitchen_access",
  "/rpc/kitchen_save_week_plan",
  "/rpc/kitchen_save_session",
  "/rpc/kitchen_save_recipe",
  "/rpc/privacy_me_active",
]);
const headers = (token) => ({
  authorization: "Bearer " + token,
  "content-type": "application/json",
});

export async function createPlanningDatabaseFixture({
  backend,
  base,
  origin,
  key,
  report,
  relayWeb,
  pantry = false,
}) {
  assert.equal(origin, "http://127.0.0.1:54323");
  assert.equal(key, "sb_publishable_runtime_check_not_a_real_key");
  const frontend = new URL(base);
  assert.equal(frontend.hostname, "127.0.0.1");
  assert.ok(!["", "5212", "54323", "8026"].includes(frontend.port));
  const owner = await backend.createAccount("owner");
  const peer = await backend.createAccount("peer");
  const accounts = [owner, peer];
  const tokens = new Map();
  const writes = [];
  let latePlan;
  function armLatePlan() {
    assert.equal(latePlan, undefined);
    const arrive = Promise.withResolvers(),
      release = Promise.withResolvers(),
      done = Promise.withResolvers();
    latePlan = { arrive, release, done };
    return { arrived: arrive.promise, finish: () => release.resolve(), done: done.promise };
  }
  const rest = (account, path, body) =>
    backend.request("rest", path, {
      method: body === undefined ? "GET" : "POST",
      headers: headers(account?.token ?? backend.anon),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  async function recipe(account, title, record, ingredient = { name: "Testtomat", amount: 200 }) {
    const version = randomUUID();
    const r = await rest(account, "/rpc/kitchen_save_recipe", {
      _recipe_id: record?.recipeId ?? randomUUID(),
      _version_id: version,
      _expected_revision: record?.revision ?? 0,
      _document: {
        title,
        description: "Disposable fixture",
        servings: 2,
        totalMinutes: 20,
        image: "none",
        notes: "",
        sourceNote: "",
        ingredients: [
          { id: randomUUID(), name: ingredient.name, amount: ingredient.amount, unit: "g" },
        ],
        steps: [
          { id: randomUUID(), title: "Teststeg", text: "Syntetisk data", timerSeconds: null },
        ],
      },
    });
    assert.equal(r.status, 200);
    const value = await r.json();
    assert.equal(value.id, version);
    assert.equal(value.user_id, account.id);
    return { id: version, recipeId: value.recipe_id, revision: value.revision, title };
  }
  async function exportAccount(account) {
    // Run the repository's export handler, using the real Supabase SDK over the isolated relay.
    const url = "http://winesnap-export-fixture.invalid";
    const admin = createClient(url, backend.serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const target = new URL(request.url);
          assert.equal(target.origin, url);
          const match = target.pathname.match(/^\/(auth|rest)\/v1(\/.*)$/);
          assert.ok(match);
          return backend.request(match[1], match[2] + target.search, {
            method: request.method,
            headers: Object.fromEntries(request.headers),
            body: request.body ? await request.text() : undefined,
          });
        },
      },
    });
    const run = exportHandler({ env: () => undefined, admin: () => admin });
    return run(
      new Request(url + "/privacy-export", { method: "POST", headers: headers(account.token) }),
    );
  }
  return {
    owner,
    peer,
    writes,
    rest,
    recipe,
    exportAccount,
    armLatePlan,
    async refreshFixtureLogin(account) {
      assert.ok(accounts.includes(account));
      const r = await backend.request("auth", "/token?grant_type=password", {
        method: "POST",
        headers: headers(backend.anon),
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      assert.equal(r.status, 200);
      const session = await r.json();
      assert.equal(session.user.id, account.id);
      account.token = session.access_token;
    },
    releaseLatePlan() {
      latePlan?.release.resolve();
    },
    async route(route, useLegacyBrowserKey = false) {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      assert.ok(!useLegacyBrowserKey || relayWeb);
      const pageOrigin = useLegacyBrowserKey ? "http://localhost:5212" : base;
      if (
        url.origin === pageOrigin &&
        ["GET", "HEAD"].includes(method) &&
        !url.pathname.startsWith("/api/")
      ) {
        if (relayWeb) {
          const response = await relayWeb(url.pathname + url.search, method);
          // Never send a server redirect out of the fixture origin.
          if (response.headers.location) {
            const next = new URL(response.headers.location, pageOrigin);
            assert.equal(next.origin, pageOrigin);
          }
          return route.fulfill(response);
        }
        return route.continue();
      }
      if (url.origin !== origin) {
        if (url.origin === pageOrigin) report.mutations++;
        else report.externalRequests++;
        return route.abort();
      }
      const cors = { "access-control-allow-origin": pageOrigin };
      if (method === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
        });
      const incoming = request.headers();
      const browserKey = incoming.apikey;
      assert.ok(
        browserKey === key ||
          (relayWeb &&
            useLegacyBrowserKey &&
            /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(browserKey ?? "")),
      );
      const match = url.pathname.match(/^\/(auth|rest)\/v1(\/.*)$/);
      assert.ok(match);
      const [, service, path] = match;
      const login = service === "auth" && method === "POST" && path === "/token";
      const bearer = incoming.authorization?.slice("Bearer ".length);
      const token = bearer === browserKey ? key : bearer;
      assert.ok(token === key || tokens.has(token));
      assert.ok(
        service === "auth"
          ? authPaths.has(path) &&
              (login || token !== key) &&
              (path === "/user" ? method === "GET" : method === "POST")
          : (method === "GET" && (tables.has(path) || (pantry && path === "/kitchen_pantry"))) ||
              (method === "POST" &&
                token !== key &&
                (rpcs.has(path) || (pantry && path === "/rpc/kitchen_save_pantry_item"))),
      );
      let account;
      if (login) {
        assert.equal(url.search, "?grant_type=password");
        const body = request.postDataJSON();
        account = accounts.find(
          (candidate) => candidate.email === body.email && candidate.password === body.password,
        );
        assert.ok(account);
      }
      const outbound = Object.fromEntries(
        Object.entries(incoming).filter(([name]) =>
          ["accept", "prefer", "range", "range-unit", "content-type"].includes(name),
        ),
      );
      outbound.authorization = "Bearer " + (token === key ? backend.anon : token);
      const response = await backend.request(service, path + url.search, {
        method,
        headers: outbound,
        body: request.postData() ?? undefined,
      });
      if (login) {
        assert.equal(response.status, 200);
        const session = await response.clone().json();
        assert.equal(session.user.id, account.id);
        assert.ok(typeof session.access_token === "string");
        account.token = session.access_token;
        tokens.set(account.token, account);
        report.realFixtureLogins = (report.realFixtureLogins ?? 0) + 1;
      }
      if (["/rpc/kitchen_save_week_plan", "/rpc/kitchen_save_session"].includes(path)) {
        const body = request.postDataJSON();
        writes.push({
          path,
          account: tokens.get(token).id,
          status: response.status,
          revision: body._expected_revision,
        });
      }
      report.isolatedHttpRequests = (report.isolatedHttpRequests ?? 0) + 1;
      const reply = () =>
        response.arrayBuffer().then((bytes) =>
          route.fulfill({
            status: response.status,
            headers: { ...Object.fromEntries(response.headers), ...cors },
            body: Buffer.from(bytes),
          }),
        );
      if (
        latePlan &&
        path === "/kitchen_week_plans" &&
        method === "GET" &&
        tokens.get(token) === owner
      ) {
        const held = latePlan;
        held.arrive.resolve();
        await held.release.promise;
        latePlan = undefined;
        try {
          await reply();
        } catch {
          /* The old browser request can be cancelled. */
        } finally {
          held.done.resolve();
        }
        return;
      }
      return reply();
    },
  };
}

export async function acceptPlanningDatabase({
  page,
  base,
  fixture,
  backend,
  report,
  smoke,
  pantry,
  capture,
}) {
  const { owner, peer, rest, recipe, writes } = fixture;
  const status = (text) => page.getByText(text, { exact: true }).waitFor();
  const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
  const go = (path) => page.goto(base + path, { waitUntil: "domcontentloaded" });
  const login = async (account) => {
    // Do not fill server-rendered inputs before React has hydrated the controlled form.
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    assert.ok((await page.locator("#email").inputValue()) === account.email);
    assert.ok((await page.locator("#password").inputValue()) === account.password);
    await button("Logga in").click();
    await page.waitForURL(base + "/");
  };
  const logout = async () => {
    await go("/me");
    await button("Logga ut").click();
    await button("Logga ut").waitFor({ state: "hidden" });
  };
  const open = async () => {
    if (page.url() === base + "/kitchen#plan") {
      await page.reload({ waitUntil: "domcontentloaded" });
    } else {
      await go("/kitchen#plan");
    }
    await button("Måltider").waitFor();
  };
  const meal = async (selection, servings) => {
    await button(/^Lägg till måltid/)
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Lägg till måltid", exact: true });
    await dialog.getByRole("combobox").nth(1).selectOption(selection.id);
    await page.getByLabel("Portioner", { exact: true }).fill(String(servings));
    await button("Klar").click();
  };
  const save = async () => {
    await button("Spara vecka").click();
    await status("Veckoplanen sparades.");
  };
  const manual = async (name) => {
    await button("Inköpslista").click();
    await button("Lägg till vara").click();
    await page.getByLabel("Vara", { exact: true }).fill(name);
    await button("Klar").click();
  };
  const plans = (account) => rest(account, "/kitchen_week_plans?select=*");
  const ownerItem = "Syntetisk egen inköpsrad";
  const peerItem = "Syntetisk annan inköpsrad";
  report.phase = "browser_owner_login_and_week";
  await login(owner);
  if (pantry) {
    const { acceptPantryStock } = await import("./pantry-database-browser.mjs");
    await acceptPantryStock({ page, base, fixture, report, capture });
    return;
  }
  report.phase = "browser_owner_first_save";
  const version = await recipe(owner, "Syntetiskt första recept");
  if (smoke) {
    const { acceptPlanningSmoke } = await import("./owned-planning-smoke.mjs");
    await acceptPlanningSmoke({
      page,
      base,
      fixture: { userId: owner.id, versionId: version.id, ingredientGrams: 200, steps: 1 },
      phase: (name) => {
        report.phase = name;
      },
      pass: (name) => report.passed.push(name),
      capture,
    });
    return;
  }
  await open();
  await meal(version, 3);
  await manual(ownerItem);
  await status("300 g");
  assert.equal(writes.length, 0);
  await save();
  const [initial] = await (await plans(owner)).json();
  assert.equal(initial.revision, 1);
  assert.equal(initial.document.meals[0].recipeVersionId, version.id);
  assert.equal(initial.document.manualItems[0].item.name, ownerItem);
  report.phase = "browser_reload_pinned_version";
  await recipe(owner, "Syntetisk ny receptversion", version);
  await open();
  await status(version.title);
  report.passed.push("real-login-and-explicit-plan-saves-pinned-version");

  report.phase = "browser_real_revision_conflict";
  await manual("Syntetisk konflikt i utkastet");
  const competing = await rest(owner, "/rpc/kitchen_save_week_plan", {
    _week_start: initial.week_start,
    _expected_revision: 1,
    _request_id: randomUUID(),
    _document: { ...initial.document, manualItems: [] },
  });
  assert.equal(competing.status, 200);
  await button("Spara vecka").click();
  await status("Veckoplanen har ändrats");
  assert.equal(writes.at(-1)?.status, 409);
  await button("Hämta sparad plan").click();
  await button("Behåll mitt utkast").click();
  assert.equal(writes.length, 2);
  await save();
  assert.equal(writes.at(-1)?.revision, 2);
  await button("Måltider").click();
  await button("Starta planerad matlagning").click();
  await page.waitForURL("**/kitchen#cook");
  const [cooked] = await (
    await rest(owner, "/cooking_sessions?select=recipe_version_id,state")
  ).json();
  assert.equal(cooked.recipe_version_id, version.id);
  assert.equal(cooked.state.servings, 3);
  report.passed.push("real-revision-conflict-and-cook-use-saved-version");

  report.phase = "browser_account_switch_late_read";
  const late = fixture.armLatePlan();
  try {
    await go("/kitchen#plan");
    await page.reload({ waitUntil: "domcontentloaded" });
    let timer;
    try {
      await Promise.race([
        late.arrived,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("late_plan_not_arrived")), 45000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    await logout();
    await login(peer);
    await open();
    assert.equal(await page.getByText(version.title, { exact: true }).count(), 0);
    assert.deepEqual(await (await plans(peer)).json(), []);
    const anonymous = await plans(null);
    assert.ok([401, 403].includes(anonymous.status));
  } finally {
    late.finish();
  }
  await late.done;
  assert.equal(await page.getByText(version.title, { exact: true }).count(), 0);
  report.passed.push("real-rls-and-late-owner-read-stay-isolated-after-switch");

  report.phase = "browser_peer_plan_and_real_export";
  const peerRecipe = await recipe(peer, "Syntetiskt fristående recept");
  await open();
  await meal(peerRecipe, 2);
  await manual(peerItem);
  await save();
  await fixture.refreshFixtureLogin(owner);
  const exported = await fixture.exportAccount(owner);
  assert.equal(exported.status, 200);
  const { tables: exportedTables } = await exported.json();
  assert.equal(exportedTables.kitchen_week_plans.length, 1);
  assert.equal(exportedTables.kitchen_week_plans[0].user_id, owner.id);
  assert.ok(
    exportedTables.kitchen_week_plans[0].document.manualItems.some(
      ({ item }) => item.name === ownerItem,
    ),
  );
  assert.ok(!JSON.stringify(exportedTables.kitchen_week_plans).includes(peerItem));
  report.passed.push("privacy-export-handler-reads-only-own-plan-from-postgrest");

  report.phase = "restore_disposable_full_database";
  report.restoredRelationsVerified = await backend.recover();
  report.passed.push("pg-dump-restores-plan-rows-and-catalog-into-empty-database");

  report.phase = "missing_pinned_version";
  await recipe(peer, "Syntetisk ny version för andra kontot", peerRecipe);
  await backend.discardFixtureVersion(peer.id, peerRecipe.id);
  await open();
  await status("Receptversionen saknas");
  assert.equal(await button("Starta planerad matlagning").isDisabled(), true);
  await button("Inköpslista").click();
  await status(peerItem);
  assert.equal(await page.getByText("200 g", { exact: true }).count(), 0);
  report.passed.push("missing-version-never-substitutes-or-blocks-manual-list");

  report.phase = "real_erasure_and_cascade";
  const erasure = await backend.admin("/rpc/request_account_erasure", {
    method: "POST",
    body: JSON.stringify({ _user_id: owner.id }),
  });
  assert.ok([200, 204].includes(erasure.status));
  assert.deepEqual(await (await plans(owner)).json(), []);
  const removed = await backend.removeAccount(owner.id);
  assert.ok([200, 204].includes(removed.status));
  const remaining = await backend.admin("/kitchen_week_plans?select=user_id");
  assert.equal(remaining.status, 200);
  assert.deepEqual(await remaining.json(), [{ user_id: peer.id }]);
  assert.equal((await (await plans(peer)).json()).length, 1);
  report.passed.push("pending-erasure-hides-plan-and-auth-deletion-cascades-only-owner");
}
