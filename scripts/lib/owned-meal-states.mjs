import assert from "node:assert/strict";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import {
  assertFixtureOwner,
  ownedMealSessionId,
  validateBrowserFixture,
} from "./owned-browser-fixture.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const names = {
  household: "Local QA household",
  renamed: "Local QA renamed household",
  owner: "Local QA owner",
  adult: "Local QA adult",
  child: "Local QA child",
  late: "Local QA late profile",
  accountProfile: "Local QA account profile",
  accountMeal: "Local QA account meal",
  meal: "Local QA meal",
  draft: "Local QA draft meal",
  server: "Local QA server meal",
};
const ownerTables = new Set([
  "wines",
  "cooking_sessions",
  "cooking_feedback",
  "kitchen_recipes",
  "kitchen_recipe_versions",
  "meal_wine_links",
]);
const familyTables = new Set([
  "kitchen_households",
  "kitchen_household_members",
  "kitchen_household_invites",
  "kitchen_diners",
]);
const patterns = [
  "kitchen_*",
  "cooking_sessions*",
  "cooking_feedback*",
  "wines*",
  "meal_wine_links*",
  "rpc/kitchen_*",
].map((path) => ownedApi + "/rest/v1/" + path);
async function bounded(promise, ms = 30000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("owned_meal_probe_timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Tokens stay inside this closure. Every forwarded request uses normal fixture Auth/RLS.
export function createOwnedMealProbe(context, fixture) {
  validateBrowserFixture(fixture);
  const sessionId = ownedMealSessionId(fixture),
    ids = {};
  const faults = new Set();
  const heldReplies = [];
  const verifiedPeerPages = new WeakSet();
  const result = {
    clientWriteRequests: 0,
    forwardedRpcRequests: 0,
    committedWrites: 0,
    injectedServerEdits: 0,
    injectedReadErrors: 0,
    inspectionReads: 0,
    authChecks: 0,
    peerReadRequests: 0,
    accountSwitches: 0,
    releasedReplies: 0,
    blockedSwitchWrites: 0,
    blockedStaleReads: 0,
    fixtureErrors: 0,
    memoryKitchenAccessSeen: 0,
    memoryKitchenAccessVerified: 0,
    memoryKitchenAccessForwarded: 0,
    memoryKitchenAccessGuardErrors: 0,
  };
  let mode = "",
    latch,
    failed = false,
    closed = false,
    peerFixture = null,
    switched = false,
    expectedPeerPages = [],
    lastHeaders = null;
  async function verify(request) {
    let response;
    try {
      assert.equal(closed, false);
      const { authorization, apikey } = request.headers();
      assert.ok(
        typeof authorization === "string" &&
          authorization.startsWith("Bearer ") &&
          authorization.length <= 8192,
      );
      assert.ok(typeof apikey === "string" && apikey.length > 0 && apikey.length <= 8192);
      response = await context.request.get(ownedApi + "/auth/v1/user", {
        headers: { authorization, apikey },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 15000,
      });
      assert.equal(response.status(), 200);
      const user = await response.json();
      const reader = user?.id === fixture.userId && !switched ? fixture : peerFixture;
      assert.ok(reader);
      assertFixtureOwner(user, reader);
      assert.equal(closed, false);
      result.authChecks++;
      lastHeaders = { authorization, apikey };
      return reader;
    } catch {
      throw new Error("owned_meal_fixture_identity_failed");
    } finally {
      await response?.dispose?.();
    }
  }
  function newId(id) {
    assert.match(id, uuid);
    assert.ok(![...Object.values(fixture), ...Object.values(ids), sessionId].includes(id));
    return id;
  }
  function validateWrite(table, body, step) {
    if (["meal-lost", "meal-conflict", "meal-account-late"].includes(step)) {
      assert.equal(table, "rpc/kitchen_meal_save");
      const id = step === "meal-conflict" ? ids.meal : newId(body._id);
      assert.deepEqual(body, {
        _id: id,
        _revision: step === "meal-lost" ? 0 : step === "meal-conflict" ? 1 : 2,
        _input: {
          sessionId,
          wineId: fixture.wineId,
          wineRating: 4,
          pairingRating: 3,
          note:
            step === "meal-lost"
              ? names.meal
              : step === "meal-conflict"
                ? names.draft
                : names.accountMeal,
        },
      });
      if (step !== "meal-conflict") ids.meal = id;
      return;
    }
    assert.equal(table, "rpc/kitchen_family_change");
    if (step === "household-lost") {
      const id = newId(body._id);
      assert.deepEqual(body, {
        _action: "create_household",
        _id: id,
        _revision: 0,
        _data: { name: names.household, displayName: names.owner, adultConfirmed: true },
      });
      ids.household = id;
    } else if (step === "rename-late") {
      assert.ok(ids.household);
      assert.deepEqual(body, {
        _action: "rename_household",
        _id: ids.household,
        _revision: 1,
        _data: { name: names.renamed },
      });
    } else {
      assert.ok(
        ["adult-read-error", "child", "profile-late", "profile-account-late"].includes(step),
      );
      const id = newId(body._id),
        key =
          step === "adult-read-error"
            ? "adult"
            : step === "child"
              ? "child"
              : step === "profile-late"
                ? "late"
                : "accountProfile";
      assert.deepEqual(body, {
        _action: "save_diner",
        _id: id,
        _revision: 0,
        _data: {
          document: {
            name: names[key],
            kind: key === "child" ? "child" : "adult",
            preferences: [],
          },
          householdId: null,
          shared: false,
        },
      });
      ids[key] = id;
    }
  }
  async function forward(route, override) {
    result.forwardedRpcRequests++;
    assert.ok(result.forwardedRpcRequests <= 8);
    return route.fetch({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15000,
      ...(override ? { postData: override } : {}),
    });
  }
  function committed(response) {
    assert.ok([200, 204].includes(response.status()));
    result.committedWrites++;
    assert.ok(result.committedWrites <= 7);
  }
  const handler = async (route) => {
    let held,
      memoryKitchenAccess = false;
    try {
      assert.equal(failed, false);
      assert.equal(closed, false);
      const request = route.request(),
        url = new URL(request.url()),
        table = url.pathname.slice("/rest/v1/".length);
      assert.equal(url.origin, ownedApi);
      assert.ok(url.pathname.startsWith("/rest/v1/"));
      if (request.method() === "OPTIONS") return await route.fallback();
      memoryKitchenAccess =
        !!peerFixture &&
        request.method() === "POST" &&
        table === "rpc/kitchen_access" &&
        request.frame().page()?.url?.() === ownedApp + "/kitchen#memory";
      if (memoryKitchenAccess) result.memoryKitchenAccessSeen++;
      if (peerFixture && request.method() !== "GET" && table !== "rpc/kitchen_access") {
        result.blockedSwitchWrites++;
        throw new Error("owned_meal_switch_write_blocked");
      }
      if (
        switched &&
        request.method() === "GET" &&
        (url.searchParams.get("user_id") === "eq." + fixture.userId ||
          Object.values(ids).some((id) => url.searchParams.get("id") === "eq." + id))
      ) {
        result.blockedStaleReads++;
        throw new Error("owned_meal_stale_read_blocked");
      }
      const reader = await verify(request);
      if (memoryKitchenAccess) result.memoryKitchenAccessVerified++;
      assert.equal(closed, false);
      if (request.method() === "GET") {
        assert.ok(ownerTables.has(table) || familyTables.has(table));
        if (ownerTables.has(table))
          assert.equal(url.searchParams.get("user_id"), "eq." + reader.userId);
        const exact = url.searchParams.get("id");
        if (exact && ["kitchen_households", "kitchen_diners", "meal_wine_links"].includes(table)) {
          assert.equal(url.searchParams.get("user_id"), "eq." + fixture.userId);
          assert.ok(Object.values(ids).some((id) => exact === "eq." + id));
          result.inspectionReads++;
        }
        if (reader === peerFixture) {
          const sourcePage = request.frame().page();
          assert.ok(sourcePage && typeof sourcePage === "object");
          verifiedPeerPages.add(sourcePage);
          result.peerReadRequests++;
        }
        if (
          (faults.has("household-inspect") &&
            table === "kitchen_households" &&
            exact === "eq." + ids.household) ||
          (faults.has("diners-list") && table === "kitchen_diners" && !exact) ||
          (faults.has("meals-list") && table === "meal_wine_links" && !exact)
        ) {
          result.injectedReadErrors++;
          assert.ok(result.injectedReadErrors <= 32);
          return await route.fulfill({
            status: 400,
            contentType: "application/json",
            headers: { "access-control-allow-origin": ownedApp },
            body: JSON.stringify({ code: "synthetic_meal_read_failure" }),
          });
        }
        return await route.fallback();
      }
      assert.equal(request.method(), "POST");
      if (table === "rpc/kitchen_access") {
        await route.fallback();
        if (memoryKitchenAccess) result.memoryKitchenAccessForwarded++;
        return;
      }
      assert.equal(peerFixture, null);
      assert.ok(["rpc/kitchen_family_change", "rpc/kitchen_meal_save"].includes(table));
      assert.equal(url.search, "");
      assert.notEqual(mode, "");
      const step = mode,
        body = request.postDataJSON();
      validateWrite(table, body, step);
      mode = "";
      result.clientWriteRequests++;
      assert.ok(result.clientWriteRequests <= 7);
      if (
        ["rename-late", "profile-late", "profile-account-late", "meal-account-late"].includes(step)
      ) {
        held = latch;
        held.started = true;
      }
      if (step === "meal-conflict") {
        committed(
          await forward(route, { ...body, _input: { ...body._input, note: names.server } }),
        );
        result.injectedServerEdits++;
        const rejected = await forward(route);
        assert.equal(rejected.status(), 409);
        return await route.fulfill({ response: rejected });
      }
      const response = await forward(route);
      committed(response);
      if (held) held.committed = true;
      if (["household-lost", "meal-lost"].includes(step)) return await route.abort("failed");
      if (step === "adult-read-error") faults.add("diners-list");
      if (held) {
        held.arrived.resolve();
        await held.release.promise;
      }
      try {
        await route.fulfill({ response });
      } catch {
        assert.ok(held && request.failure());
      }
    } catch {
      if (memoryKitchenAccess) result.memoryKitchenAccessGuardErrors++;
      failed = true;
      result.fixtureErrors++;
      await route.abort().catch(() => {});
    } finally {
      held?.done.resolve();
    }
  };
  return {
    handler,
    sessionId,
    snapshot: () => ({ ...result }),
    arm(step) {
      assert.equal(failed, false);
      assert.equal(closed, false);
      assert.equal(peerFixture, null);
      assert.equal(mode, "");
      assert.ok(
        [
          "household-lost",
          "rename-late",
          "adult-read-error",
          "child",
          "meal-lost",
          "meal-conflict",
          "profile-late",
          "profile-account-late",
          "meal-account-late",
        ].includes(step),
      );
      if (
        ["rename-late", "profile-late", "profile-account-late", "meal-account-late"].includes(step)
      ) {
        assert.ok(heldReplies.length < 2);
        latch = {
          step,
          arrived: deferred(),
          release: deferred(),
          done: deferred(),
          started: false,
          committed: false,
          released: false,
        };
        heldReplies.push(latch);
      }
      mode = step;
    },
    fault(name, enabled) {
      assert.ok(["household-inspect", "diners-list", "meals-list"].includes(name));
      assert.equal(typeof enabled, "boolean");
      if (enabled) faults.add(name);
      else faults.delete(name);
    },
    waitHeld: () => bounded(latch.arrived.promise),
    async waitReleased() {
      for (const held of heldReplies) if (held.started) await bounded(held.done.promise);
    },
    release() {
      for (const held of heldReplies) {
        if (!held.released) result.releasedReplies++;
        held.released = true;
        held.release.resolve();
      }
    },
    beginAccountSwitch(other, pages) {
      validateBrowserFixture(other);
      assert.notEqual(other.userId, fixture.userId);
      assert.notEqual(other.run, fixture.run);
      assert.notEqual(other.email, fixture.email);
      assert.equal(failed, false);
      assert.equal(closed, false);
      assert.equal(peerFixture, null);
      assert.equal(mode, "");
      assert.equal(heldReplies.length, 2);
      assert.deepEqual(heldReplies.map((held) => held.step).sort(), [
        "meal-account-late",
        "profile-account-late",
      ]);
      assert.ok(heldReplies.every((held) => held.committed && !held.released));
      assert.ok(Array.isArray(pages) && pages.length === 2 && pages[0] !== pages[1]);
      assert.ok(pages.every((page) => page && typeof page === "object"));
      expectedPeerPages = [...pages];
      peerFixture = other;
      result.accountSwitches++;
    },
    completeAccountSwitch() {
      assert.equal(failed, false);
      assert.equal(closed, false);
      assert.ok(peerFixture && !switched);
      assert.ok(expectedPeerPages.every((page) => verifiedPeerPages.has(page)));
      assert.ok(heldReplies.every((held) => held.committed && !held.released));
      switched = true;
    },
    async close() {
      closed = true;
      lastHeaders = null;
      for (const held of heldReplies) held.release.resolve();
      for (const held of heldReplies) if (held.started) await bounded(held.done.promise);
    },
    async assertForeignReads(other) {
      assert.equal(closed, false);
      validateBrowserFixture(other);
      assert.ok(!peerFixture || switched);
      const current = switched ? peerFixture : fixture;
      assert.notEqual(other.userId, current.userId);
      assert.ok(lastHeaders);
      assert.equal(await verify({ headers: () => lastHeaders }), current);
      for (const table of ["kitchen_households", "kitchen_diners", "meal_wine_links"]) {
        const url = new URL(ownedApi + "/rest/v1/" + table);
        url.searchParams.set("select", "id");
        url.searchParams.set("user_id", "eq." + other.userId);
        const response = await context.request.get(url.href, {
          headers: lastHeaders,
          maxRedirects: 0,
          maxRetries: 0,
          timeout: 15000,
        });
        try {
          assert.equal(closed, false);
          assert.equal(response.status(), 200);
          const rows = await response.json();
          assert.ok(Array.isArray(rows));
          assert.equal(rows.length, 0);
        } finally {
          await response.dispose();
        }
      }
    },
  };
}

export async function withOwnedMealProbe({ page, context, fixture }, run) {
  validateBrowserFixture(fixture);
  assert.equal(new URL(page.url()).origin, ownedApp);
  const probe = createOwnedMealProbe(context, fixture),
    registered = [];
  try {
    for (const pattern of patterns) {
      await context.route(pattern, probe.handler);
      registered.push(pattern);
    }
    return await run(probe);
  } finally {
    let failed = false;
    try {
      await probe.close();
    } catch {
      failed = true;
    }
    for (const pattern of registered) {
      try {
        await context.unroute(pattern, probe.handler);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("owned_meal_route_cleanup_failed");
  }
}

// Preparation is a tagged-fixture operation supplied by the existing private wrapper.
export async function acceptOwnedMealStates({
  page,
  context,
  fixture,
  prepare,
  phase,
  pass,
  capture,
}) {
  validateBrowserFixture(fixture);
  assert.equal(new URL(page.url()).origin, ownedApp);
  assert.equal(typeof prepare, "function");
  const prepared = await prepare();
  assert.equal(prepared.completed, true);
  assert.equal(prepared.activeSessionUnchanged, true);
  assert.equal(prepared.mealSessionId, ownedMealSessionId(fixture));
  return withOwnedMealProbe({ page, context, fixture }, async (probe) => {
    phase("meals_installed_household_lost_reply");
    await page.goto(ownedApp + "/kitchen#family", { waitUntil: "domcontentloaded" });
    // The new completed fixture must enter the parent cooking-history cache.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Ditt smeknamn", { exact: true }).fill(names.owner);
    await page.getByLabel("Hush\u00e5llets namn", { exact: true }).fill(names.household);
    await page
      .getByRole("checkbox", {
        name: "Jag \u00e4r vuxen och vill delta i detta hush\u00e5ll",
        exact: true,
      })
      .check();
    probe.arm("household-lost");
    probe.fault("household-inspect", true);
    await page
      .getByRole("button", { name: "Skapa hush\u00e5ll", exact: true })
      .evaluate((button) => {
        button.form.requestSubmit();
        button.form.requestSubmit();
      });
    await page.getByText("Svaret saknas.", { exact: false }).waitFor();
    assert.equal(probe.snapshot().clientWriteRequests, 1);
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await capture("meal-family-pending", width);
    }
    probe.fault("household-inspect", false);
    await page.getByRole("button", { name: "Kontrollera sparandet", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByText("Du \u00e4ger hush\u00e5llet.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Kontrollera sparandet", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(probe.snapshot().clientWriteRequests, 1);
    pass("meals_installed_household_lost_reply_reconciles_without_duplicate");

    phase("meals_installed_pending_rename");
    const rename = page.getByRole("form", { name: "\u00c4ndra hush\u00e5llets namn", exact: true });
    await rename.getByRole("textbox").fill(names.renamed);
    probe.arm("rename-late");
    await rename.getByRole("button", { name: "Spara hush\u00e5llets namn", exact: true }).click();
    await probe.waitHeld();
    assert.equal(await rename.getByRole("textbox").isDisabled(), true);
    assert.equal(
      await rename
        .getByRole("button", { name: "Avbryt namn\u00e4ndring", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await rename
        .getByRole("button", { name: "Spara hush\u00e5llets namn", exact: true })
        .isDisabled(),
      true,
    );
    probe.release();
    await probe.waitReleased();
    await page.getByText("Sparat.", { exact: true }).waitFor();
    assert.equal(await rename.getByRole("textbox").inputValue(), names.renamed);
    pass("meals_installed_pending_rename_locks_captured_draft");

    phase("meals_installed_saved_profile_read_failure");
    await page.getByRole("button", { name: "Ny profil", exact: true }).click();
    await page.getByLabel("Namn eller smeknamn", { exact: true }).fill(names.adult);
    probe.arm("adult-read-error");
    await page.getByRole("button", { name: "Spara profil", exact: true }).click();
    await page.getByText("Sparat. Listan kunde inte l\u00e4sas om.", { exact: false }).waitFor();
    probe.fault("diners-list", false);
    await page.getByRole("button", { name: "H\u00e4mta aktuella uppgifter", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByText(names.adult, { exact: true }).waitFor();
    assert.equal(probe.snapshot().clientWriteRequests, 3);
    pass("meals_installed_saved_profile_read_retry_does_not_repeat_write");
    await page.getByRole("button", { name: "Ny profil", exact: true }).click();
    await page.getByLabel("Namn eller smeknamn", { exact: true }).fill(names.child);
    await page.locator(".meal-editor select").first().selectOption("child");
    probe.arm("child");
    await page.getByRole("button", { name: "Spara profil", exact: true }).click();
    await page.getByText(names.child, { exact: true }).waitFor();

    const views = page.getByRole("combobox", { name: "Fler vyer i k\u00f6ket", exact: true });
    await views.selectOption("pairings");
    const adult = page.getByRole("checkbox", { name: names.adult, exact: true });
    const child = page.getByRole("checkbox", { name: names.child + " (barn)", exact: true });
    const optIn = page.getByRole("checkbox", {
      name: "Visa vinf\u00f6rslag till vuxna fr\u00e5n min vink\u00e4llare",
      exact: true,
    });
    phase("meals_installed_pairing_audience");
    await adult.check();
    await optIn.check();
    await child.check();
    await adult.uncheck();
    assert.equal(await optIn.isDisabled(), true);
    assert.equal(await optIn.isChecked(), false);
    await child.uncheck();
    assert.equal(await optIn.isChecked(), false);
    pass("meals_installed_child_selection_never_restores_hidden_wine_opt_in");
    await adult.check();
    await optIn.check();
    await page.getByRole("radio", { name: "Fr\u00e5n vinet", exact: true }).check();
    const wine = page.getByRole("combobox", {
      name: "Vin fr\u00e5n din k\u00e4llare",
      exact: true,
    });
    assert.equal(await wine.inputValue(), "");
    await wine.selectOption(fixture.wineId);
    await page.locator(".meal-results").waitFor();
    pass("meals_installed_pairing_uses_explicit_fixture_bottle");
    await page.getByRole("radio", { name: "Fr\u00e5n maten", exact: true }).check();
    await page
      .getByRole("combobox", { name: "R\u00e4tt", exact: true })
      .selectOption(fixture.versionId);
    const bottle = page.locator(`.meal-results a[href^="/wine/${fixture.wineId}"]`);
    await bottle.waitFor();
    const destination = new URL(await bottle.getAttribute("href"), ownedApp);
    assert.equal(destination.origin, ownedApp);
    assert.equal(destination.pathname, "/wine/" + fixture.wineId);
    assert.equal(destination.hash.split("?")[0], "#kitchen");
    const params = new URLSearchParams(destination.hash.split("?")[1]);
    assert.equal(params.get("recipe"), fixture.versionId);
    assert.equal(params.get("view"), "recipes");
    assert.equal(params.has("session"), false);
    assert.equal(params.has("fromCook"), false);
    pass("meals_installed_pairing_return_pins_recipe_without_unrelated_session");
    probe.fault("diners-list", true);
    await page
      .getByRole("button", { name: "H\u00e4mta mat- och vinuppgifter", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Uppgifterna kunde inte h\u00e4mtas" })
      .waitFor();
    assert.equal(await adult.count(), 0);
    probe.fault("diners-list", false);
    await page
      .getByRole("button", { name: "H\u00e4mta mat- och vinuppgifter", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await adult.waitFor();
    assert.equal(await optIn.isChecked(), false);
    assert.equal(probe.snapshot().clientWriteRequests, 4);
    pass("meals_installed_pairing_read_recovery_requires_new_wine_opt_in");

    phase("meals_installed_lost_meal_reply");
    await views.selectOption("meals");
    await page.getByRole("button", { name: "Registrera", exact: true }).click();
    const editor = page.locator(".meal-editor");
    await editor.locator("select").nth(0).selectOption(probe.sessionId);
    await editor.locator("select").nth(1).selectOption(fixture.wineId);
    await editor.locator("select").nth(2).selectOption("4");
    await editor.locator("select").nth(3).selectOption("3");
    await editor.locator("textarea").fill(names.meal);
    probe.arm("meal-lost");
    await editor
      .getByRole("button", { name: "Spara m\u00e5ltid", exact: true })
      .evaluate((button) => {
        button.form.requestSubmit();
        button.form.requestSubmit();
      });
    await editor.waitFor({ state: "hidden" });
    await page.getByText("M\u00e5ltiden sparades.", { exact: false }).waitFor();
    assert.equal(probe.snapshot().clientWriteRequests, 5);
    pass("meals_installed_lost_meal_insert_is_reconciled_once");

    phase("meals_installed_real_revision_conflict");
    await page.getByRole("button", { name: "Redigera m\u00e5ltid", exact: true }).click();
    await editor.locator("textarea").fill(names.draft);
    probe.arm("meal-conflict");
    await editor.getByRole("button", { name: "Spara m\u00e5ltid", exact: true }).click();
    await page.getByText("Uppgifterna har \u00e4ndrats.", { exact: false }).waitFor();
    assert.equal(await editor.locator("textarea").inputValue(), names.draft);
    probe.fault("meals-list", true);
    await page.getByRole("button", { name: "H\u00e4mta aktuella uppgifter", exact: true }).click();
    await page.getByText("Uppgifterna kunde inte l\u00e4sas om.", { exact: false }).waitFor();
    probe.fault("meals-list", false);
    await page.getByRole("button", { name: "H\u00e4mta aktuella uppgifter", exact: true }).focus();
    await page.keyboard.press("Enter");
    await editor.locator("textarea").waitFor();
    assert.equal(await editor.locator("textarea").inputValue(), names.draft);
    await page.getByText(names.server, { exact: true }).waitFor();
    assert.equal(probe.snapshot().clientWriteRequests, 6);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("meal-revision-conflict", 390);
    await editor.getByRole("button", { name: "Avbryt", exact: true }).click();
    await page.getByRole("button", { name: "Redigera m\u00e5ltid", exact: true }).click();
    assert.equal(await editor.locator("textarea").inputValue(), names.server);
    await editor.getByRole("button", { name: "Avbryt", exact: true }).click();
    pass("meals_installed_real_conflict_keeps_draft_and_only_reloads_current_row");

    phase("meals_installed_late_family_reply");
    await views.selectOption("family");
    await page.getByRole("button", { name: "Ny profil", exact: true }).click();
    await page.getByLabel("Namn eller smeknamn", { exact: true }).fill(names.late);
    probe.arm("profile-late");
    await page.getByRole("button", { name: "Spara profil", exact: true }).click();
    await probe.waitHeld();
    const inspections = probe.snapshot().inspectionReads;
    await views.selectOption("meals");
    await page.getByRole("heading", { name: "M\u00e5ltider & vin", exact: true }).waitFor();
    probe.release();
    await probe.waitReleased();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(await page.getByText("Sparat.", { exact: true }).count(), 0);
    const result = probe.snapshot();
    assert.equal(result.inspectionReads, inspections);
    assert.equal(result.clientWriteRequests, 7);
    assert.equal(result.forwardedRpcRequests, 8);
    assert.equal(result.committedWrites, 7);
    assert.equal(result.injectedServerEdits, 1);
    assert.ok(result.injectedReadErrors >= 4);
    assert.equal(result.fixtureErrors, 0);
    pass("meals_installed_late_family_reply_cannot_update_another_view");
    return { completed: true, liveProvider: false, ...result };
  });
}

export async function acceptOwnedMealPeerIsolation({
  page,
  context,
  fixture,
  otherFixture,
  phase,
  pass,
}) {
  validateBrowserFixture(otherFixture);
  return withOwnedMealProbe({ page, context, fixture }, async (probe) => {
    phase("meals_installed_peer_isolation");
    await page.goto(ownedApp + "/kitchen#family", { waitUntil: "domcontentloaded" });
    await page.getByText("Inga matprofiler \u00e4nnu.", { exact: true }).waitFor();
    await page.goto(ownedApp + "/kitchen#meals", { waitUntil: "domcontentloaded" });
    await page.getByText("Inga kombinationer registrerade \u00e4nnu.", { exact: true }).waitFor();
    await page.goto(ownedApp + "/kitchen#pairings", { waitUntil: "domcontentloaded" });
    await page.getByText("Inga matprofiler valda.", { exact: false }).waitFor();
    for (const name of Object.values(names))
      assert.equal(await page.getByText(name, { exact: true }).count(), 0);
    await probe.assertForeignReads(otherFixture);
    assert.equal(probe.snapshot().clientWriteRequests, 0);
    assert.equal(probe.snapshot().fixtureErrors, 0);
    pass("meals_installed_peer_cannot_read_owner_households_profiles_or_meals");
    return { completed: true, privateTablesDenied: 3 };
  });
}
