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
  const delays = new Map();
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
        request.method() !== "GET" ||
        !url.pathname.startsWith("/rest/v1/") ||
        !tables.has(table)
      ) {
        report.mutations++;
        return route.abort();
      }
      const delay = delays.get(table);
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
        if (table === "kitchen_diners") rows = diners;
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
  assert.equal(report.simulatedWrites, 0);
  assert.equal(report.simulatedAiRequests, 0);
  report.passed.push("no-automatic-ai-or-writes-in-core-view-navigation");
  await context.clearCookies();
}
