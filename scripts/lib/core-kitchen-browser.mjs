import assert from "node:assert/strict";
import { join } from "node:path";

// This fixture never forwards a request, including to the installed loopback API.
export function createCoreKitchenFixture({ origin, key, owner, users, report, base }) {
  assert.equal(origin, "http://127.0.0.1:54323");
  assert.equal(key, "sb_publishable_runtime_check_not_a_real_key");
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const recipeTitle = "SyntheticRecipeWithALongUnbrokenNameForSmallScreenVerification";
  const stepTitle = "SyntheticCookingStepWithALongUnbrokenTitleForLayoutVerification";
  const memoryValue = "syntheticseasoningwithalongunbrokennameforlayoutverification";
  const childName = "SyntheticChildWithALongUnbrokenName";
  const wineName = "SyntheticPrivateWineForKitchenChecks";
  const stamp = "2026-11-01T12:00:00Z";
  const version = {
    id: id(1),
    recipe_id: id(2),
    user_id: owner,
    revision: 1,
    created_at: stamp,
    document: {
      title: recipeTitle,
      description: "Synthetic recipe fixture. No real owner data.",
      servings: 2,
      totalMinutes: 20,
      image: "salad",
      sourceNote: "Synthetic fixture",
      notes: "",
      ingredients: [
        { id: id(3), name: "SyntheticIngredientWithALongUnbrokenName", amount: 100, unit: "g" },
      ],
      steps: [
        {
          id: id(4),
          title: stepTitle,
          text: "Synthetic cooking instruction. No food-safety claim.",
          timerSeconds: 60,
        },
        {
          id: id(5),
          title: "Synthetic final step",
          text: "Synthetic fixture only.",
          timerSeconds: null,
        },
      ],
    },
  };
  const active = {
    id: id(6),
    user_id: owner,
    recipe_version_id: version.id,
    revision: 1,
    last_request_id: id(7),
    updated_at: stamp,
    state: {
      status: "paused",
      activeStep: 0,
      servings: 2,
      checkedIngredientIds: [],
      timers: [
        {
          id: id(8),
          name: "SyntheticLongTimerNameForSmallScreens",
          durationMs: 60000,
          deadlineMs: null,
          pausedMs: 60000,
          resumeOnSession: true,
        },
      ],
    },
  };
  const wine = {
    id: id(9),
    user_id: owner,
    wine_name: wineName,
    vintage: 2023,
    producer: "Synthetic",
    wine_type: "white",
    quantity: 1,
    consumed_at: null,
    image_url: null,
    body: 4,
    acidity: 7,
    tannin: 1,
    sweetness: 1,
    grape_varieties: [],
    region: null,
    country: null,
  };
  const signal = {
    id: id(10),
    user_id: owner,
    source_kind: "statement",
    source_key: "synthetic-statement",
    source_feedback_id: null,
    attribute: "ingredient",
    value: memoryValue,
    direction: 1,
    source_excerpt: "Synthetic evidence, not a real preference.",
    source_title: "Synthetic source",
    confidence: 1,
    status: "confirmed",
    revision: 1,
    created_at: stamp,
  };
  const diners = [
    { name: "SyntheticAdult", kind: "adult", preferences: [] },
    { name: childName, kind: "child", preferences: [] },
  ].map((document, i) => ({
    id: id(11 + i),
    user_id: owner,
    household_id: null,
    shared: false,
    document,
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  }));
  const failedTables = new Set();
  const completed = {
    ...active,
    id: id(60),
    state: { ...active.state, status: "completed", timers: [] },
  };
  let exerciseMeals = false,
    scenario = "",
    failInspection = false,
    failList = false;
  let heldResponse,
    arrived = () => {};
  let householdRows = [],
    memberRows = [],
    mealRows = [];
  let writeCount = 0,
    commits = 0,
    inspectionCount = 0;
  const delays = new Map();
  const readArrivals = new Map();
  let pairingDiners = null;
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  const emptyTables = new Set([
    "profiles",
    "cooking_feedback",
    "food_memory_state",
    "chef_conversations",
    "chef_messages",
    "kitchen_households",
    "kitchen_household_members",
    "kitchen_household_invites",
    "meal_wine_links",
  ]);
  const tables = new Set([
    ...emptyTables,
    "wines",
    "kitchen_recipes",
    "kitchen_recipe_versions",
    "cooking_sessions",
    "food_signals",
    "kitchen_diners",
  ]);
  return {
    recipeTitle,
    stepTitle,
    memoryValue,
    childName,
    wineName,
    failedTables,
    changePairingDiners(mode) {
      assert.ok(["original", "remove-adult", "adult-becomes-child"].includes(mode));
      pairingDiners =
        mode === "original"
          ? null
          : diners
              .filter((d) => mode !== "remove-adult" || d.id !== id(11))
              .map((d) =>
                mode === "adult-becomes-child" && d.id === id(11)
                  ? { ...d, revision: 2, document: { ...d.document, kind: "child" } }
                  : d,
              );
    },
    nextRead(table) {
      assert.ok(tables.has(table));
      assert.equal(readArrivals.has(table), false);
      return new Promise((resolve) => readArrivals.set(table, resolve));
    },
    beginMealChecks() {
      exerciseMeals = true;
    },
    armMealScenario(value) {
      assert.ok(
        [
          "household-lost",
          "rename-late",
          "profile-read-error",
          "meal-lost",
          "meal-conflict",
          "profile-late",
        ].includes(value),
      );
      assert.equal(scenario, "");
      scenario = value;
    },
    failInspection(value) {
      failInspection = value;
    },
    failList(value) {
      failList = value;
    },
    nextLateWrite() {
      return new Promise((resolve) => {
        arrived = resolve;
      });
    },
    releaseWrite() {
      heldResponse?.();
      heldResponse = undefined;
    },
    conflictMeal() {
      assert.equal(mealRows.length, 1);
      mealRows[0] = { ...mealRows[0], revision: 2, note: "Synthetic server edit" };
    },
    conflictHousehold() {
      assert.equal(householdRows.length, 1);
      householdRows[0] = {
        ...householdRows[0],
        revision: 3,
        name: "Synthetic server household",
      };
    },
    counts() {
      return { writeCount, commits, inspectionCount };
    },
    delay(table) {
      assert.ok(tables.has(table));
      let release;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      delays.set(table, promise);
      return () => {
        delays.delete(table);
        release();
      };
    },
    async route(route) {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin === base &&
        ["GET", "HEAD"].includes(request.method()) &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (url.origin !== origin) {
        if (url.origin === base) report.mutations++;
        else report.externalRequests++;
        return route.abort();
      }
      if (request.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": base,
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
        });
      assert.equal(request.headers().apikey, key);
      const user = users.get(request.headers().authorization);
      assert.ok(user);
      report.simulatedReadRequests = (report.simulatedReadRequests ?? 0) + 1;
      if (url.pathname === "/auth/v1/user" && request.method() === "GET") return json(route, user);
      if (
        request.method() === "POST" &&
        ["kitchen_access", "chef_access", "meals_access"].some(
          (gate) => url.pathname === "/rest/v1/rpc/" + gate,
        )
      )
        return json(route, true);
      const table = url.pathname.slice("/rest/v1/".length);
      if (
        exerciseMeals &&
        request.method() === "POST" &&
        ["rpc/kitchen_family_change", "rpc/kitchen_meal_save"].includes(table)
      ) {
        assert.equal(user.id, owner);
        const body = request.postDataJSON(),
          mode = scenario;
        assert.notEqual(mode, "");
        assert.match(body._id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
        scenario = "";
        report.simulatedWrites++;
        writeCount++;
        if (mode === "household-lost") {
          assert.equal(table, "rpc/kitchen_family_change");
          assert.deepEqual(body, {
            _action: "create_household",
            _id: body._id,
            _revision: 0,
            _data: {
              name: "Synthetic household",
              displayName: "Synthetic owner",
              adultConfirmed: true,
            },
          });
          householdRows = [{ id: body._id, user_id: owner, name: body._data.name, revision: 1 }];
          memberRows = [
            { id: id(70), user_id: owner, household_id: body._id, display_name: "Synthetic owner" },
          ];
          commits++;
          return route.abort();
        }
        if (mode === "rename-late") {
          assert.equal(table, "rpc/kitchen_family_change");
          assert.deepEqual(body, {
            _action: "rename_household",
            _id: householdRows[0]?.id,
            _revision: 1,
            _data: { name: "Synthetic renamed household" },
          });
          householdRows[0] = { ...householdRows[0], name: body._data.name, revision: 2 };
          commits++;
          const wait = new Promise((resolve) => {
            heldResponse = resolve;
          });
          arrived();
          await wait;
          return json(route, null).catch(() => {});
        }
        if (mode === "profile-read-error" || mode === "profile-late") {
          assert.equal(table, "rpc/kitchen_family_change");
          const name =
            mode === "profile-read-error" ? "Synthetic saved profile" : "Synthetic late profile";
          assert.deepEqual(body, {
            _action: "save_diner",
            _id: body._id,
            _revision: 0,
            _data: {
              document: { name, kind: "adult", preferences: [] },
              householdId: null,
              shared: false,
            },
          });
          diners.push({
            id: body._id,
            user_id: owner,
            household_id: null,
            shared: false,
            document: body._data.document,
            revision: 1,
            created_at: stamp,
            updated_at: stamp,
          });
          commits++;
          if (mode === "profile-read-error") failList = true;
          else {
            const wait = new Promise((resolve) => {
              heldResponse = resolve;
            });
            arrived();
            await wait;
            return json(route, null).catch(() => {});
          }
          return json(route, null);
        }
        assert.equal(table, "rpc/kitchen_meal_save");
        assert.equal(body._input.sessionId, completed.id);
        assert.equal(body._input.wineId, wine.id);
        if (mode === "meal-conflict") {
          assert.equal(body._revision, 1);
          return json(route, { code: "PT409" }, 409);
        }
        assert.equal(mode, "meal-lost");
        assert.deepEqual(body, {
          _id: body._id,
          _revision: 0,
          _input: {
            sessionId: completed.id,
            wineId: wine.id,
            wineRating: null,
            pairingRating: null,
            note: "Synthetic meal",
          },
        });
        mealRows = [
          {
            id: body._id,
            user_id: owner,
            session_id: completed.id,
            wine_id: wine.id,
            food_rating: null,
            wine_rating: null,
            pairing_rating: null,
            note: "Synthetic meal",
            revision: 1,
            created_at: stamp,
            updated_at: stamp,
          },
        ];
        commits++;
        return route.abort();
      }
      if (
        exerciseMeals &&
        request.method() === "GET" &&
        [
          "kitchen_households",
          "kitchen_household_members",
          "kitchen_diners",
          "meal_wine_links",
        ].includes(table)
      ) {
        if (failedTables.has(table)) return json(route, { code: "synthetic_read_error" }, 400);
        const isInspection = !!url.searchParams.get("id");
        if (isInspection) {
          inspectionCount++;
          assert.equal(url.searchParams.get("user_id"), "eq." + owner);
          if (failInspection) return json(route, { code: "synthetic_read_error" }, 400);
        }
        if (table === "kitchen_diners" && !isInspection && failList)
          return json(route, { code: "synthetic_read_error" }, 400);
        let rows =
          user.id !== owner
            ? []
            : {
                kitchen_households: householdRows,
                kitchen_household_members: memberRows,
                kitchen_diners: diners,
                meal_wine_links: mealRows,
              }[table];
        const exactId = url.searchParams.get("id");
        if (exactId?.startsWith("eq.")) rows = rows.filter((r) => r.id === exactId.slice(3));
        return json(
          route,
          request.headers().accept?.includes("vnd.pgrst.object") ? (rows[0] ?? null) : rows,
        );
      }
      if (
        exerciseMeals &&
        user.id === owner &&
        request.method() === "GET" &&
        table === "cooking_sessions" &&
        (["eq.completed", "in.(completed,abandoned)"].includes(
          url.searchParams.get("state->>status"),
        ) ||
          url.searchParams.get("id")?.includes(completed.id))
      ) {
        return json(route, [completed]);
      }
      if (
        request.method() !== "GET" ||
        !url.pathname.startsWith("/rest/v1/") ||
        !tables.has(table)
      ) {
        report.mutations++;
        return route.abort();
      }
      const delay = delays.get(table);
      readArrivals.get(table)?.();
      readArrivals.delete(table);
      if (delay) await delay;
      if (failedTables.has(table)) return json(route, { message: "synthetic_read_failure" }, 503);
      let rows = [];
      if (user.id === owner) {
        if (table === "wines") rows = [wine];
        if (table === "kitchen_recipes")
          rows = [{ id: version.recipe_id, current_version_id: version.id, revision: 1 }];
        if (table === "kitchen_recipe_versions") rows = [version];
        if (
          table === "cooking_sessions" &&
          !(url.searchParams.get("state->>status") ?? "").includes("completed")
        )
          rows = [active];
        if (table === "food_signals") rows = [signal];
        if (table === "kitchen_diners") rows = pairingDiners ?? diners;
      }
      return json(
        route,
        request.headers().accept?.includes("vnd.pgrst.object") ? (rows[0] ?? null) : rows,
      );
    },
  };
}

async function layout(page, artifacts, report, name) {
  for (const width of [320, 390, 1440]) {
    report.phase = `${name}-layout-${width}`;
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "125%";
      await document.fonts.ready;
    });
    const failures = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "main h1,main h2,main h3,main p,main button,main dt,main dd,main label,.pilot-row-copy",
        ),
      ]
        .filter((element) => {
          if (!element.getClientRects().length || element.closest(".sr-only")) return false;
          const rect = element.getBoundingClientRect();
          return (
            rect.left < -1 ||
            rect.right > innerWidth + 1 ||
            (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2)
          );
        })
        .map((element) => element.tagName + ":" + element.className),
    );
    if (failures.length) {
      report.layoutFailures ??= [];
      report.layoutFailures.push({ view: name, width, elements: failures.slice(0, 12) });
    }
    await page.screenshot({
      path: join(artifacts, `${name}-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    if (!failures.length) report.passed.push(`${name}-fits-${width}`);
  }
}

export async function acceptCoreKitchen({
  page,
  context,
  base,
  artifacts,
  report,
  fixture,
  authKey,
  peerSession,
}) {
  report.phase = "home";
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".pilot-recent-wine").filter({ hasText: fixture.wineName }).waitFor();
  await page.locator(".pilot-hero").evaluate((image) => image.decode());
  await layout(page, artifacts, report, "home");
  await page.locator('.pilot-entries a[href="/kitchen"]').click();
  await page.getByRole("heading", { name: "Vad lagar vi idag?", exact: true }).waitFor();
  const recipe = page.locator(".k-recipe").filter({ hasText: fixture.recipeTitle });
  await recipe.waitFor();
  await layout(page, artifacts, report, "cookbook");
  await recipe.click();
  await page.getByRole("heading", { name: fixture.recipeTitle, exact: true }).waitFor();
  await page.locator(".k-detail-image").evaluate((image) => image.decode());
  await layout(page, artifacts, report, "recipe");
  await page.locator(".k-tabs").getByRole("button", { name: "Matlagning", exact: false }).click();
  await page.getByRole("heading", { name: fixture.stepTitle, exact: true }).waitFor();
  assert.equal(await page.getByRole("timer").textContent(), "01:00");
  await layout(page, artifacts, report, "cook-mode");
  report.phase = "memory-error-retry-focus";
  fixture.failedTables.add("food_signals");
  await page.locator(".k-tabs").getByRole("button", { name: "Matminne", exact: true }).click();
  const memoryError = page.locator('.chef-panel .operation-notice[data-kind="error"]');
  await memoryError.waitFor();
  assert.equal(
    await page.getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true }).count(),
    0,
  );
  fixture.failedTables.delete("food_signals");
  await memoryError.getByRole("button").click();
  await page.getByRole("heading", { name: "Gillar " + fixture.memoryValue, exact: true }).waitFor();
  await layout(page, artifacts, report, "food-memory");
  await page.getByRole("button", { name: "Korrigera " + fixture.memoryValue, exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "INPUT");
  report.passed.push("memory-read-error-retry-and-edit-focus");
  report.phase = "meal-history-loading-error-retry";
  const release = fixture.delay("meal_wine_links");
  fixture.failedTables.add("meal_wine_links");
  try {
    await page
      .getByRole("combobox", { name: "Fler vyer i k\u00f6ket", exact: true })
      .selectOption("meals");
    await page.locator('.meal-panel .operation-notice[data-kind="loading"]').waitFor();
    assert.equal(
      await page.getByText("Inga kombinationer registrerade \u00e4nnu.", { exact: true }).count(),
      0,
    );
  } finally {
    release();
  }
  const mealError = page.locator('.meal-panel .operation-notice[data-kind="error"]');
  await mealError.waitFor();
  fixture.failedTables.delete("meal_wine_links");
  await mealError.getByRole("button").click();
  await page.getByText("Inga kombinationer registrerade \u00e4nnu.", { exact: true }).waitFor();
  await layout(page, artifacts, report, "meal-history");
  report.passed.push("meal-history-does-not-confuse-loading-error-with-empty");
  report.phase = "family";
  const views = page.getByRole("combobox", { name: "Fler vyer i k\u00f6ket", exact: true });
  await views.selectOption("family");
  await page.getByText(fixture.childName, { exact: true }).waitFor();
  await layout(page, artifacts, report, "family");
  report.phase = "child-pairing-boundary";
  await views.selectOption("pairings");
  await page.locator(".meal-diners input").nth(1).check();
  const wineOptIn = page.getByRole("checkbox", {
    name: "Visa vinf\u00f6rslag till vuxna fr\u00e5n min vink\u00e4llare",
    exact: true,
  });
  assert.equal(await wineOptIn.isDisabled(), true);
  assert.equal(await wineOptIn.isChecked(), false);
  await layout(page, artifacts, report, "pairings");
  report.passed.push("child-only-diners-disable-wine-suggestions");
  assert.equal(report.simulatedWrites, 0);
  assert.equal(report.simulatedAiRequests, 0);
  report.passed.push("no-automatic-ai-or-writes-in-core-view-navigation");
  await acceptPairingReads({
    page,
    artifacts,
    report,
    fixture,
    switchAccount: () =>
      page.evaluate(
        ({ key, session }) => {
          localStorage.setItem(key, JSON.stringify(session));
          const channel = new BroadcastChannel(key);
          channel.postMessage({ event: "SIGNED_IN", session });
          channel.close();
        },
        { key: authKey, session: peerSession },
      ),
  });
  await acceptMealWrites({
    page,
    base,
    artifacts,
    report,
    fixture,
    switchAccount: () =>
      page.evaluate(
        ({ key, session }) => {
          localStorage.setItem(key, JSON.stringify(session));
          const channel = new BroadcastChannel(key);
          channel.postMessage({ event: "SIGNED_IN", session });
          channel.close();
        },
        { key: authKey, session: peerSession },
      ),
  });
  await views.selectOption("pairings");
  report.phase = "kitchen-account-isolation";
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session });
      channel.close();
    },
    { key: authKey, session: peerSession },
  );
  await page.getByText("Inga matprofiler valda.", { exact: false }).waitFor();
  for (const text of [
    fixture.recipeTitle,
    fixture.stepTitle,
    fixture.childName,
    fixture.memoryValue,
    fixture.wineName,
  ])
    assert.equal(await page.getByText(text, { exact: true }).count(), 0);
  report.passed.push("kitchen-account-change-clears-owner-view");
  assert.equal(report.simulatedWrites, fixture.counts().writeCount);
  assert.equal(report.simulatedAiRequests, 0);
  await context.clearCookies();
}

async function acceptPairingReads({ page, artifacts, report, fixture, switchAccount }) {
  const optIn = page.getByRole("checkbox", {
    name: "Visa vinförslag till vuxna från min vinkällare",
    exact: true,
  });
  const adult = page.getByRole("checkbox", { name: "SyntheticAdult", exact: true });
  const child = page.getByRole("checkbox", { name: fixture.childName + " (barn)", exact: true });
  const refresh = page.getByRole("button", { name: "Hämta mat- och vinuppgifter", exact: true });
  report.phase = "pairing-child-selection-does-not-reenable-wine";
  await child.uncheck();
  await adult.check();
  await optIn.check();
  await child.check();
  await adult.uncheck();
  assert.equal(await optIn.isDisabled(), true);
  assert.equal(await optIn.isChecked(), false);
  await child.uncheck();
  assert.equal(await optIn.isChecked(), false);
  report.passed.push("pairing-audience-change-never-silently-reenables-wine");

  report.phase = "pairing-removed-selected-profile";
  await adult.check();
  await optIn.check();
  fixture.changePairingDiners("remove-adult");
  await refresh.click();
  await page
    .getByText("En eller flera valda matprofiler är inte längre tillgängliga.", { exact: false })
    .waitFor();
  assert.equal(await optIn.isDisabled(), true);
  assert.equal(await optIn.isChecked(), false);
  assert.equal(await page.locator(".meal-mode").count(), 0);
  assert.equal(
    await page.getByRole("heading", { name: "Mat till sällskapet", exact: true }).count(),
    0,
  );
  await layout(page, artifacts, report, "pairing-unavailable-diner");
  await page.getByRole("button", { name: "Rensa profilval", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await optIn.isDisabled(), false);
  assert.equal(await optIn.isChecked(), false);
  fixture.changePairingDiners("original");
  await refresh.click();
  await adult.waitFor();
  report.passed.push("pairing-missing-diner-blocks-wine-until-explicit-selection-reset");

  report.phase = "pairing-reclassified-child";
  await adult.check();
  await optIn.check();
  fixture.changePairingDiners("adult-becomes-child");
  await refresh.click();
  await page.getByRole("checkbox", { name: "SyntheticAdult (barn)", exact: true }).waitFor();
  assert.equal(await optIn.isDisabled(), true);
  assert.equal(await optIn.isChecked(), false);
  fixture.changePairingDiners("original");
  await refresh.click();
  await adult.waitFor();
  assert.equal(await optIn.isChecked(), false);
  report.passed.push("pairing-profile-kind-change-invalidates-old-adult-opt-in");

  report.phase = "pairing-failed-read-recovery";
  await optIn.check();
  fixture.failedTables.add("kitchen_diners");
  await refresh.click();
  await page.getByRole("alert").filter({ hasText: "Uppgifterna kunde inte hämtas" }).waitFor();
  assert.equal(await adult.count(), 0);
  assert.equal(await page.locator(".meal-mode").count(), 0);
  fixture.failedTables.delete("kitchen_diners");
  await refresh.focus();
  await page.keyboard.press("Enter");
  await adult.waitFor();
  assert.equal(await optIn.isChecked(), false);
  report.passed.push("pairing-read-error-hides-data-and-recovery-does-not-restore-wine-consent");

  report.phase = "pairing-late-owner-read";
  await optIn.check();
  const release = fixture.delay("kitchen_diners");
  const arrived = fixture.nextRead("kitchen_diners");
  await refresh.click();
  await waitForSyntheticWrite(arrived);
  try {
    await switchAccount();
    await adult.waitFor({ state: "hidden" });
    assert.equal(await page.getByText(fixture.recipeTitle, { exact: true }).count(), 0);
  } finally {
    release();
  }
  await page.getByText("Inga matprofiler valda.", { exact: false }).waitFor();
  assert.equal(await optIn.isChecked(), false);
  assert.equal(await page.getByText(fixture.childName, { exact: false }).count(), 0);
  // The fixture init script creates a fresh synthetic owner session on reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await adult.waitFor();
  assert.equal(await optIn.isChecked(), false);
  assert.equal(report.simulatedWrites, 0);
  assert.equal(report.simulatedAiRequests, 0);
  report.passed.push("pairing-late-read-and-consent-cannot-cross-accounts");
}

async function acceptMealWrites({ page, base, artifacts, report, fixture, switchAccount }) {
  fixture.beginMealChecks();
  await page.goto(base + "/kitchen#family", { waitUntil: "domcontentloaded" });
  // A hash change does not reload the parent cooking-history cache.
  await page.reload({ waitUntil: "domcontentloaded" });
  const create = page.getByRole("button", { name: "Skapa hushåll", exact: true });
  await create.waitFor();
  await page.getByLabel("Ditt smeknamn", { exact: true }).fill("Synthetic owner");
  await page.getByLabel("Hushållets namn", { exact: true }).fill("Synthetic household");
  await page
    .getByRole("checkbox", { name: "Jag är vuxen och vill delta i detta hushåll", exact: true })
    .check();
  fixture.armMealScenario("household-lost");
  fixture.failInspection(true);
  report.phase = "family-lost-reply-read-recovery";
  await create.evaluate((button) => {
    button.form.requestSubmit();
    button.form.requestSubmit();
  });
  await page.getByText("Svaret saknas.", { exact: false }).waitFor();
  assert.equal(fixture.counts().writeCount, 1);
  await layout(page, artifacts, report, "family-save-pending");
  fixture.failInspection(false);
  await page.getByRole("button", { name: "Kontrollera sparandet", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByText("Du äger hushållet.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Kontrollera sparandet", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(fixture.counts().writeCount, 1);
  report.passed.push("household-lost-reply-keeps-one-id-and-keyboard-read-recovery");

  report.phase = "family-rename-pending-lock";
  const rename = page.getByRole("form", { name: "Ändra hushållets namn", exact: true });
  const householdName = rename.getByRole("textbox");
  await householdName.fill("Synthetic renamed household");
  fixture.armMealScenario("rename-late");
  const renameArrival = fixture.nextLateWrite();
  await rename.getByRole("button", { name: "Spara hushållets namn", exact: true }).click();
  await waitForSyntheticWrite(renameArrival);
  assert.equal(await householdName.isDisabled(), true);
  assert.equal(
    await rename.getByRole("button", { name: "Spara hushållets namn", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await rename.getByRole("button", { name: "Avbryt namnändring", exact: true }).isDisabled(),
    true,
  );
  await layout(page, artifacts, report, "family-rename-pending");
  fixture.releaseWrite();
  await page.getByText("Sparat.", { exact: true }).waitFor();
  assert.equal(await householdName.inputValue(), "Synthetic renamed household");
  report.passed.push("household-rename-locks-edit-save-and-cancel-until-confirmed");

  report.phase = "family-rename-background-revision";
  await householdName.fill("Synthetic unsaved name");
  fixture.failList(true);
  await page.getByRole("button", { name: "Hämta familjeuppgifter", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Uppgifterna kunde inte hämtas" }).waitFor();
  assert.equal(await rename.count(), 0);
  fixture.failList(false);
  await page.getByRole("button", { name: "Hämta familjeuppgifter", exact: true }).click();
  await householdName.waitFor();
  assert.equal(await householdName.inputValue(), "Synthetic unsaved name");
  report.passed.push("household-name-draft-survives-failed-read-without-retaining-shared-data");
  fixture.conflictHousehold();
  await page.getByRole("button", { name: "Hämta familjeuppgifter", exact: true }).click();
  await rename.getByText("Hushållet har ändrats", { exact: false }).waitFor();
  assert.equal(await householdName.inputValue(), "Synthetic unsaved name");
  assert.equal(
    await rename.getByRole("button", { name: "Spara hushållets namn", exact: true }).isDisabled(),
    true,
  );
  await layout(page, artifacts, report, "family-rename-revision-conflict");
  await rename.getByRole("button", { name: "Avbryt namnändring", exact: true }).click();
  assert.equal(await householdName.inputValue(), "Synthetic server household");
  assert.equal(fixture.counts().writeCount, 2);
  report.passed.push("household-name-draft-never-silently-rebases-after-background-read");

  await page.getByRole("button", { name: "Ny profil", exact: true }).click();
  await page.getByLabel("Namn eller smeknamn", { exact: true }).fill("Synthetic saved profile");
  fixture.armMealScenario("profile-read-error");
  await page.getByRole("button", { name: "Spara profil", exact: true }).click();
  await page.getByText("Sparat. Listan kunde inte läsas om.", { exact: false }).waitFor();
  await layout(page, artifacts, report, "family-save-reload-error");
  fixture.failList(false);
  await page.getByRole("button", { name: "Hämta aktuella uppgifter", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByText("Synthetic saved profile", { exact: true }).waitFor();
  assert.equal(fixture.counts().writeCount, 3);
  report.passed.push("family-committed-save-is-not-a-failed-write-after-reload-error");

  const views = page.getByRole("combobox", { name: "Fler vyer i köket", exact: true });
  report.phase = "meal-register-lost-response";
  await views.selectOption("meals");
  await page.getByRole("button", { name: "Registrera", exact: true }).click();
  await page.getByLabel("Anteckning", { exact: true }).fill("Synthetic meal");
  fixture.armMealScenario("meal-lost");
  await page.getByRole("button", { name: "Spara måltid", exact: true }).click();
  await page.getByText("Måltiden sparades.", { exact: false }).waitFor();
  report.phase = "meal-newer-revision-conflict";
  await page.getByRole("button", { name: "Redigera måltid", exact: true }).click();
  report.phase = "meal-conflict-draft-edit";
  const note = page.locator(".meal-editor textarea");
  await note.fill("Synthetic draft edit");
  fixture.conflictMeal();
  fixture.armMealScenario("meal-conflict");
  report.phase = "meal-conflict-submit";
  await page.getByRole("button", { name: "Spara måltid", exact: true }).click();
  report.phase = "meal-conflict-result";
  await page.getByText("Uppgifterna har ändrats.", { exact: false }).waitFor();
  assert.equal(await note.inputValue(), "Synthetic draft edit");
  await layout(page, artifacts, report, "meal-save-conflict");
  assert.equal(fixture.counts().writeCount, 5);
  assert.equal(fixture.counts().commits, 4);
  report.passed.push("meal-lost-insert-reconciles-once-and-newer-revision-keeps-draft");

  report.phase = "meal-conflict-read-failure-recovery";
  fixture.failedTables.add("meal_wine_links");
  await page.getByRole("button", { name: "Hämta aktuella uppgifter", exact: true }).click();
  await page.getByText("Uppgifterna kunde inte läsas om.", { exact: false }).waitFor();
  assert.equal(await note.count(), 0);
  fixture.failedTables.delete("meal_wine_links");
  await page.getByRole("button", { name: "Hämta aktuella uppgifter", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByText("Aktuella uppgifter är inlästa. Ditt utkast finns kvar.", { exact: false })
    .waitFor();
  await page.getByText("Synthetic server edit", { exact: true }).waitFor();
  assert.equal(await note.inputValue(), "Synthetic draft edit");
  assert.equal(fixture.counts().writeCount, 5);
  await layout(page, artifacts, report, "meal-conflict-reloaded");
  report.passed.push("meal-conflict-explicit-read-retries-without-writing-or-replacing-draft");

  for (const accountChange of [false, true]) {
    report.phase = accountChange ? "late-family-account-change" : "late-family-view-change";
    await views.selectOption("family");
    await page.getByRole("button", { name: "Ny profil", exact: true }).click();
    await page.getByLabel("Namn eller smeknamn", { exact: true }).fill("Synthetic late profile");
    fixture.armMealScenario("profile-late");
    const arrival = fixture.nextLateWrite();
    await page.getByRole("button", { name: "Spara profil", exact: true }).click();
    await waitForSyntheticWrite(arrival);
    const before = fixture.counts().inspectionCount;
    if (accountChange) {
      await switchAccount();
      await page.getByText("Synthetic saved profile", { exact: true }).waitFor({ state: "hidden" });
    } else {
      await views.selectOption("meals");
      await page.getByRole("heading", { name: "Måltider & vin", exact: true }).waitFor();
    }
    fixture.releaseWrite();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(await page.getByText("Sparat.", { exact: true }).count(), 0);
    assert.equal(fixture.counts().inspectionCount, before);
    report.passed.push(
      accountChange
        ? "late-family-write-cannot-appear-in-another-account"
        : "late-family-write-cannot-change-another-view",
    );
  }
  assert.equal(fixture.counts().writeCount, 7);
  assert.equal(fixture.counts().commits, 6);
}

async function waitForSyntheticWrite(arrival) {
  let timer;
  try {
    await Promise.race([
      arrival,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Synthetic write did not arrive")), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
