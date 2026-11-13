import assert from "node:assert/strict";
import { join } from "node:path";

const id = (n) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-11-01T12:00:00.000Z";
const bounded = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Synthetic price request missing")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
export function createCorePricesFixture({ origin, key, owner, users, report, base }) {
  assert.equal(origin, "http://127.0.0.1:54323");
  assert.equal(key, "sb_publishable_runtime_check_not_a_real_key");
  const peer = [...users.values()].find((u) => u.id !== owner)?.id;
  assert.ok(peer);
  const state = {
    wines: [],
    requests: [],
    failReads: false,
    failPrice: false,
    malformed: false,
    rowError: false,
    failReadBack: false,
    removeDuringPrice: false,
    holds: new Map(),
  };
  const identity = (wine) => ({
    wineId: wine.id,
    producer: wine.producer,
    wineName: wine.wine_name,
    vintage: wine.vintage,
    bottleMl: wine.bottle_ml,
    country: wine.country,
  });
  const candidate = {
    productNumber: "1234501",
    name: "Synthetic Chardonnay",
    producer: "Synthetic",
    vintage: 2023,
    volumeMl: 750,
    packaging: "Bottle",
    country: "Germany",
    price: 159,
    currency: "SEK",
    source: "bolaget.io",
    sourceAsOf: new Date().toISOString(),
  };
  const wine = (n, user) => {
    const row = {
      id: id(n),
      user_id: user,
      producer: "Synthetic",
      wine_name:
        user === peer
          ? "Peer private bottle"
          : "SyntheticBottleWithALongUnbrokenNameForPriceLayout" + n,
      region: "Nahe",
      country: "Germany",
      vintage: 2023,
      bottle_ml: 750,
      quantity: 1,
      consumed_at: null,
      created_at: stamp,
      updated_at: stamp,
      grape_varieties: ["Chardonnay"],
      tasting_notes: [],
      purchase_price: 100,
      purchase_currency: "SEK",
      market_price: null,
      market_price_currency: null,
      market_price_checked_at: null,
      retail_price_status: "review",
    };
    return {
      ...row,
      retail_price_candidates: { identity: identity(row), candidates: [candidate] },
    };
  };
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  async function hold(kind) {
    const held = state.holds.get(kind);
    if (!held) return;
    state.holds.delete(kind);
    held.start();
    await held.released;
    held.finish();
  }
  const fixture = {
    owner,
    peer,
    state,
    reset() {
      state.wines = [1, 2, 3, 4].map((n) => wine(n, owner));
      state.wines.push(wine(10, peer));
      state.requests = [];
      state.failReads =
        state.failPrice =
        state.malformed =
        state.rowError =
        state.failReadBack =
          false;
      state.removeDuringPrice = false;
    },
    hold(kind) {
      assert.ok(!state.holds.has(kind));
      let start, release, finish;
      const arrived = new Promise((r) => {
          start = r;
        }),
        released = new Promise((r) => {
          release = r;
        }),
        done = new Promise((r) => {
          finish = r;
        });
      state.holds.set(kind, { start, released, finish });
      return { arrived: () => bounded(arrived), release, done: () => bounded(done) };
    },
    async route(route) {
      const req = route.request(),
        url = new URL(req.url()),
        method = req.method();
      const hook =
        url.origin === base && url.pathname === "/api/public/hooks/refresh-cellar-values";
      if (
        url.origin === base &&
        ["GET", "HEAD"].includes(method) &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (url.origin !== origin && !hook) {
        if (url.origin === base) report.mutations++;
        else report.externalRequests++;
        return route.abort();
      }
      if (method === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": base,
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
        });
      const user = users.get(req.headers().authorization);
      assert.ok(user);
      if (hook && method === "POST") {
        const input = req.postDataJSON();
        assert.ok(["refresh", "confirm"].includes(input.action));
        const ids = input.action === "refresh" ? input.wineIds : [input.wineId];
        assert.ok(ids.length > 0 && ids.length <= 3);
        for (const value of ids)
          assert.ok(state.wines.some((w) => w.id === value && w.user_id === user.id));
        if (input.action === "confirm") {
          assert.equal(input.productNumber, candidate.productNumber);
          assert.equal(input.acknowledged, true);
        }
        state.requests.push({ owner: user.id, action: input.action, ids: [...ids] });
        report.simulatedWrites++;
        report.simulatedPriceRequests = (report.simulatedPriceRequests ?? 0) + 1;
        await hold("price");
        if (state.failPrice) return json(route, { error: "synthetic_price_failure" }, 503);
        const results = ids.map((wineId) => {
          if (state.removeDuringPrice) {
            state.removeDuringPrice = false;
            state.wines = state.wines.filter((w) => w.id !== wineId);
            return { wineId, status: "changed" };
          }
          const row = state.wines.find((w) => w.id === wineId && w.user_id === user.id);
          const status = state.rowError ? "error" : "matched";
          Object.assign(row, { retail_price_status: status, updated_at: new Date().toISOString() });
          if (!state.rowError)
            Object.assign(row, {
              market_price: 159,
              market_price_currency: "SEK",
              market_price_source: "bolaget.io",
              market_price_checked_at: new Date().toISOString(),
              retail_price_match: {
                ...candidate,
                name: row.wine_name,
                identity: identity(row),
                verification: input.action === "confirm" ? "manual" : "automatic",
              },
              retail_price_candidates: null,
            });
          return { wineId, status };
        });
        if (state.failReadBack) state.failReads = true;
        return json(route, { results: state.malformed ? [] : results });
      }
      assert.equal(req.headers().apikey, key);
      if (method === "GET" && url.pathname === "/auth/v1/user") {
        await hold("auth");
        return json(route, user);
      }
      if (method === "GET" && url.pathname === "/rest/v1/wines") {
        assert.equal(url.searchParams.get("user_id"), "eq." + user.id);
        if (state.failReads) return json(route, { code: "synthetic_read_failure" }, 400);
        let rows = state.wines.filter((w) => w.user_id === user.id);
        const filter = url.searchParams.get("id");
        if (filter) {
          assert.match(filter, /^in\.\([a-f0-9,-]+\)$/);
          const ids = filter.slice(4, -1).split(",");
          rows = rows.filter((w) => ids.includes(w.id));
        }
        const from = Number(url.searchParams.get("offset") ?? 0),
          limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 1000));
        const snapshot = structuredClone(rows.slice(from, from + limit));
        await hold(filter ? "reload" : "read");
        return json(route, snapshot);
      }
      report.mutations++;
      return route.abort();
    },
  };
  fixture.reset();
  return fixture;
}

export async function acceptCorePrices({
  page,
  base,
  artifacts,
  report,
  fixture,
  authKey,
  ownerSession,
  peerSession,
}) {
  const panel = () => page.getByRole("region", { name: "Retail price reference", exact: true });
  const update = () => panel().getByRole("button", { name: "Update prices", exact: true });
  const read = () => panel().getByRole("button", { name: "Reload saved prices", exact: true });
  async function session(value) {
    await page.evaluate(
      ({ key, session }) => {
        if (session) localStorage.setItem(key, JSON.stringify(session));
        else localStorage.removeItem(key);
        const channel = new BroadcastChannel(key);
        channel.postMessage({ event: session ? "SIGNED_IN" : "SIGNED_OUT", session });
        channel.close();
      },
      { key: authKey, session: value },
    );
  }
  async function reset() {
    fixture.reset();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/cellar/overview", { waitUntil: "domcontentloaded" });
    await session(ownerSession);
    await update().waitFor();
  }
  async function settle() {
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  }
  const failed = [];
  async function check(name, action) {
    report.phase = name;
    try {
      await reset();
      await action();
      report.passed.push(name);
    } catch (error) {
      failed.push(name);
      report.scenarioErrorTypes = [...(report.scenarioErrorTypes ?? []), error.name];
      await page.screenshot({ path: join(artifacts, name + "-failed.png") }).catch(() => {});
    }
  }
  await check("prices-initial-read-error-and-explicit-retry", async () => {
    fixture.state.failReads = true;
    await page.reload();
    await page.getByRole("alert").waitFor();
    assert.equal(await panel().count(), 0);
    assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).count(), 1);
    fixture.state.failReads = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await update().waitFor();
    assert.equal(fixture.state.requests.length, 0);
  });
  await check("prices-failed-read-back-retries-only-the-read", async () => {
    fixture.state.failReadBack = true;
    await update().click();
    await panel().getByRole("alert").waitFor();
    assert.equal(await read().count(), 1);
    assert.equal(fixture.state.requests.length, 1);
    await read().click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (el) => el.textContent === "Reload saved prices" && !el.disabled,
      ),
    );
    assert.equal(fixture.state.requests.length, 1);
    fixture.state.failReads = false;
    fixture.state.failReadBack = false;
    await read().focus();
    await page.keyboard.press("Enter");
    await panel().getByRole("button", { name: "Resume", exact: true }).waitFor();
    assert.equal(fixture.state.requests.length, 1);
    await panel().getByText("3/4 wines with a current, verified price", { exact: true }).waitFor();
    await panel().getByRole("button", { name: "Resume", exact: true }).click();
    await update().waitFor();
    assert.equal(fixture.state.requests.length, 2);
    assert.equal(new Set(fixture.state.requests.flatMap((r) => r.ids)).size, 4);
  });
  await check("prices-uncertain-response-requires-read-before-new-check", async () => {
    fixture.state.malformed = true;
    await update().click();
    await panel().getByRole("alert").waitFor();
    assert.equal(await read().count(), 1);
    await read().click();
    await panel().getByRole("button", { name: "Resume", exact: true }).waitFor();
    assert.equal(fixture.state.requests.length, 1);
  });
  await check("prices-transport-error-retains-explicit-recovery", async () => {
    fixture.state.failPrice = true;
    await update().click();
    await panel().getByRole("alert").waitFor();
    assert.equal(await read().count(), 1);
    assert.equal(fixture.state.requests.length, 1);
  });
  await check("prices-account-change-during-verification-sends-nothing", async () => {
    const held = fixture.hold("auth");
    await update().click();
    try {
      await held.arrived();
      await session(peerSession);
      await panel()
        .getByText("Peer private bottle", { exact: true })
        .waitFor({ state: "attached" });
      held.release();
      await held.done();
      await settle();
      assert.equal(fixture.state.requests.length, 0);
      assert.equal(await panel().getByRole("alert").count(), 0);
    } finally {
      held.release();
    }
  });
  await check("prices-late-confirmation-read-cannot-toast-in-new-account", async () => {
    await panel().getByText("Prices per wine", { exact: true }).click();
    const first = panel().locator("li").first();
    await first.getByRole("radio").check();
    await first.getByRole("checkbox").check();
    const held = fixture.hold("reload");
    await first.getByRole("button", { name: "Confirm product", exact: true }).click();
    try {
      await held.arrived();
      await session(peerSession);
      await panel()
        .getByText("Peer private bottle", { exact: true })
        .waitFor({ state: "attached" });
      held.release();
      await held.done();
      await settle();
      assert.equal(await page.locator("[data-sonner-toast]").count(), 0);
      assert.equal(await panel().getByRole("alert").count(), 0);
      assert.equal(fixture.state.requests.length, 1);
      assert.equal(fixture.state.requests[0].owner, fixture.owner);
    } finally {
      held.release();
    }
  });
  await check("prices-late-initial-read-cannot-replace-peer-totals", async () => {
    const held = fixture.hold("read");
    await page.reload();
    try {
      await held.arrived();
      await session(peerSession);
      await panel()
        .getByText("Peer private bottle", { exact: true })
        .waitFor({ state: "attached" });
      held.release();
      await held.done();
      await settle();
      assert.match(await panel().innerText(), /0\/1/);
      assert.doesNotMatch(await panel().innerText(), /SyntheticBottle/);
    } finally {
      held.release();
    }
  });
  await check("prices-late-refresh-cannot-enter-peer-progress", async () => {
    const held = fixture.hold("price");
    await update().click();
    try {
      await held.arrived();
      await session(peerSession);
      await panel()
        .getByText("Peer private bottle", { exact: true })
        .waitFor({ state: "attached" });
      await update().click();
      await page.locator("[data-sonner-toast]").waitFor();
      held.release();
      await held.done();
      await settle();
      assert.equal(fixture.state.requests.length, 2);
      assert.equal(fixture.state.requests[1].owner, fixture.peer);
      await panel()
        .getByText("1/1 wines with a current, verified price", { exact: true })
        .waitFor();
      assert.equal(await page.locator("[data-sonner-toast]").count(), 1);
      assert.equal(await panel().getByRole("alert").count(), 0);
    } finally {
      held.release();
    }
  });
  await check("prices-removed-wine-does-not-retain-an-old-reference", async () => {
    fixture.state.removeDuringPrice = true;
    const removedName = fixture.state.wines[0].wine_name;
    await update().click();
    await page.locator("[data-sonner-toast]").waitFor();
    await panel().getByText("3/3 wines with a current, verified price", { exact: true }).waitFor();
    assert.doesNotMatch(await panel().innerText(), new RegExp(removedName));
    assert.equal(fixture.state.requests.length, 2);
  });
  await check("prices-row-errors-remain-visible-without-false-success", async () => {
    fixture.state.rowError = true;
    await update().click();
    await page.locator("[data-sonner-toast]").waitFor();
    assert.match(
      await page.locator("[data-sonner-toast]").innerText(),
      /Price could not be checked/,
    );
    assert.doesNotMatch(
      await page.locator("[data-sonner-toast]").innerText(),
      /Price check finished/,
    );
    assert.match(await panel().innerText(), /0\/4/);
    assert.equal(fixture.state.requests.length, 2);
  });
  await check("prices-double-submit-and-pause-do-not-repeat-a-batch", async () => {
    const held = fixture.hold("price");
    await update().evaluate((el) => {
      el.click();
      el.click();
    });
    try {
      await held.arrived();
      await panel().getByRole("button", { name: "Pause", exact: true }).click();
      held.release();
      await held.done();
      await panel().getByRole("button", { name: "Resume", exact: true }).waitFor();
      assert.equal(fixture.state.requests.length, 1);
      await panel().getByRole("button", { name: "Resume", exact: true }).click();
      await update().waitFor();
      assert.equal(fixture.state.requests.length, 2);
      assert.equal(new Set(fixture.state.requests.flatMap((r) => r.ids)).size, 4);
    } finally {
      held.release();
    }
  });
  await check("prices-logout-discards-owner-data-and-progress", async () => {
    const held = fixture.hold("price");
    await update().click();
    try {
      await held.arrived();
      await session(null);
      await panel().waitFor({ state: "hidden" });
      held.release();
      await held.done();
      await settle();
      assert.equal(await panel().count(), 0);
      assert.equal(await page.locator("[data-sonner-toast]").count(), 0);
    } finally {
      held.release();
    }
  });
  report.failed = failed;
  assert.deepEqual(failed, []);
  await reset();
  fixture.state.failPrice = true;
  await update().click();
  await read().waitFor();
  for (const width of [320, 390, 1440]) {
    report.phase = `prices-layout-${width}`;
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "125%";
      await document.fonts.ready;
    });
    await panel()
      .locator("details")
      .evaluateAll((items) =>
        items.forEach((el) => {
          el.open = true;
        }),
      );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    assert.equal(
      await panel().evaluate((el) => {
        const title = el.querySelector("h2"),
          button = el.querySelector("button");
        const range = document.createRange();
        range.selectNodeContents(title);
        const text = range.getBoundingClientRect(),
          command = button.getBoundingClientRect();
        return (
          text.right > command.left &&
          text.left < command.right &&
          text.bottom > command.top &&
          text.top < command.bottom
        );
      }),
      false,
      "Price heading must not overlap its recovery button",
    );
    await panel().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(artifacts, `prices-${width}.png`), animations: "disabled" });
    report.passed.push(`prices-layout-${width}`);
  }
}
