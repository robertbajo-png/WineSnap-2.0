import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const stamp = "2026-11-01T12:00:00.000Z";
const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const wait = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Synthetic collector request missing")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export function createCoreCollectorFixture({ origin, key, owner, users, report, base }) {
  assert.equal(origin, "http://127.0.0.1:54323");
  assert.equal(key, "sb_publishable_runtime_check_not_a_real_key");
  const peer = [...users.values()].find((u) => u.id !== owner)?.id;
  assert.ok(peer);
  const state = {
    wines: [],
    lots: [],
    writes: [],
    lostReply: false,
    failReconciliation: false,
    failTable: null,
    held: null,
  };
  const lot = (n, user) => ({
    id: id(n),
    user_id: user,
    wine_id: id(10000 + n),
    purpose: "collect",
    purchased_at: "2026-11-01",
    quantity: 2,
    remaining: 1,
    bottle_ml: 750,
    unit_cost: 100,
    additional_cost: 20,
    currency: "SEK",
    condition: "",
    provenance: "",
    storage: "",
    estimate_price: null,
    estimate_currency: null,
    estimate_date: null,
    estimate_source: null,
    estimate_confidence: null,
    created_at: stamp,
    updated_at: stamp,
  });
  const wine = (n, user) => ({
    id: id(10000 + n),
    user_id: user,
    producer: "Synthetic",
    wine_name: n === 1001 ? "Last paginated bottle" : "Collector bottle " + n,
    vintage: 2023,
    quantity: 20,
    consumed_at: null,
  });
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  const fixture = {
    owner,
    peer,
    state,
    reset(large = false) {
      state.lots = Array.from({ length: large ? 1001 : 2 }, (_, i) => lot(i + 1, owner));
      state.wines = Array.from({ length: large ? 1001 : 2 }, (_, i) => wine(i + 1, owner));
      state.wines.push(wine(2000, peer));
      state.writes = [];
      state.lostReply = false;
      state.failReconciliation = false;
      state.failTable = null;
    },
    holdWrite() {
      assert.equal(state.held, null);
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
      state.held = { start, released, finish, release };
      return { arrived: () => wait(arrived), release, done: () => wait(done) };
    },
    async route(route) {
      const req = route.request(),
        url = new URL(req.url()),
        method = req.method();
      if (
        url.origin === base &&
        ["GET", "HEAD"].includes(method) &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (url.origin !== origin) {
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
            "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
          },
        });
      assert.equal(req.headers().apikey, key);
      const user = users.get(req.headers().authorization);
      assert.ok(user);
      if (method === "GET" && url.pathname === "/auth/v1/user") return json(route, user);
      const table = url.pathname.slice("/rest/v1/".length);
      if (method === "GET" && ["wines", "collector_lots"].includes(table)) {
        assert.equal(url.searchParams.get("user_id"), "eq." + user.id);
        if (state.failTable === table) return json(route, { message: "synthetic_read_error" }, 400);
        if (table === "collector_lots" && url.searchParams.has("id") && state.failReconciliation) {
          state.failReconciliation = false;
          return json(route, { message: "synthetic_unknown_read" }, 400);
        }
        let rows = state[table === "wines" ? "wines" : "lots"].filter((r) => r.user_id === user.id);
        if (url.searchParams.has("id"))
          rows = rows.filter((r) => "eq." + r.id === url.searchParams.get("id"));
        const from = Number(url.searchParams.get("offset") ?? 0),
          limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 1000));
        report.simulatedReadRequests = (report.simulatedReadRequests ?? 0) + 1;
        return json(route, rows.slice(from, from + limit));
      }
      if (["POST", "PATCH"].includes(method) && table === "collector_lots") {
        const input = req.postDataJSON();
        assert.ok(state.wines.some((w) => w.id === input.wine_id && w.user_id === user.id));
        if (method === "POST") assert.equal(input.user_id, user.id);
        else assert.equal(url.searchParams.get("user_id"), "eq." + user.id);
        state.writes.push({
          method,
          owner: user.id,
          id: input.id ?? url.searchParams.get("id")?.slice(3),
        });
        report.simulatedWrites++;
        const held = state.held;
        state.held = null;
        if (held) {
          held.start();
          await held.released;
        }
        try {
          let saved;
          if (method === "POST") {
            const rowId = input.id ?? randomUUID();
            if (state.lots.some((r) => r.id === rowId))
              return json(route, { code: "23505", message: "synthetic_duplicate" }, 409);
            saved = { ...input, id: rowId, created_at: stamp, updated_at: stamp };
            state.lots.push(saved);
          } else {
            const index = state.lots.findIndex(
              (r) =>
                r.user_id === user.id &&
                "eq." + r.id === url.searchParams.get("id") &&
                (!url.searchParams.has("updated_at") ||
                  "eq." + r.updated_at === url.searchParams.get("updated_at")),
            );
            if (index < 0)
              return json(route, { code: "PGRST116", message: "synthetic_conflict" }, 406);
            saved = { ...state.lots[index], ...input, updated_at: "2026-11-13T12:00:00.000Z" };
            state.lots[index] = saved;
          }
          if (state.lostReply) {
            state.lostReply = false;
            state.failReconciliation = true;
            return route.abort("failed");
          }
          try {
            return await json(route, saved, method === "POST" ? 201 : 200);
          } catch (cause) {
            if (!req.failure()) throw cause;
          }
        } finally {
          held?.finish();
        }
      }
      report.mutations++;
      return route.abort();
    },
  };
  fixture.reset();
  return fixture;
}

export async function acceptCoreCollector({
  page,
  base,
  artifacts,
  report,
  fixture,
  authKey,
  peerSession,
}) {
  const form = () => page.locator("form"),
    add = () => page.getByRole("button", { name: "Add acquisition", exact: true });
  const submit = () => form().getByRole("button", { name: "Save", exact: true });
  const rows = () => page.locator("main > ul > li, main > :not(form) > ul > li");
  const field = (name) =>
    name === "Wine" ? form().locator("select").first() : form().getByLabel(name, { exact: true });
  const idle = () =>
    page.waitForFunction(() => !document.querySelector('form button[type="submit"]')?.disabled);
  async function reset(large = false) {
    fixture.reset(large);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/cellar/collection", { waitUntil: "domcontentloaded" });
    await add().waitFor();
  }
  async function openNew(cost = "150") {
    await add().click();
    await field("Wine").selectOption({ index: 1 });
    await field("Purchase price per bottle").fill(cost);
    report.syntheticFormProbe = await form().evaluate((el) => ({
      wineSelected: Boolean(el.querySelector("select")?.value),
      invalidTypes: [...el.elements]
        .filter((field) => field.willValidate && !field.validity.valid)
        .map((field) => field.type),
    }));
  }
  const failed = [];
  async function check(name, run) {
    report.phase = name;
    try {
      await reset();
      await run();
      report.passed.push(name);
    } catch (cause) {
      failed.push(name);
      report.scenarioErrorTypes = [...(report.scenarioErrorTypes ?? []), cause.name];
      await page.screenshot({ path: join(artifacts, name + "-failed.png") }).catch(() => {});
    }
  }
  await check("collector-loads-all-pages", async () => {
    await reset(true);
    await page
      .getByRole("link", { name: "Synthetic Last paginated bottle 2023", exact: true })
      .waitFor({ state: "attached" });
    assert.equal(await rows().count(), 1001);
  });
  await check("collector-read-error-is-not-an-empty-total", async () => {
    fixture.state.failTable = "collector_lots";
    await page.reload();
    await page.getByRole("alert").waitFor();
    assert.equal(await rows().count(), 0);
    fixture.state.failTable = null;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("link", { name: "Synthetic Collector bottle 1 2023", exact: true })
      .waitFor();
  });
  await check("collector-lost-insert-reply-reconciles-before-retry", async () => {
    await openNew();
    fixture.state.lostReply = true;
    await submit().click();
    await idle();
    await page.getByRole("alert").waitFor();
    assert.equal(await field("Purchase price per bottle").isDisabled(), true);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByRole("alert").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({
      path: join(artifacts, "collector-uncertain-320.png"),
      animations: "disabled",
    });
    await submit().click();
    await form().waitFor({ state: "hidden" });
    assert.equal(fixture.state.writes.filter((w) => w.method === "POST").length, 1);
    assert.equal(fixture.state.lots.length, 3);
  });
  await check("collector-late-save-cannot-clear-a-new-account-draft", async () => {
    await openNew();
    const held = fixture.holdWrite();
    await submit().click();
    await held.arrived();
    try {
      await page.evaluate(
        ({ key, session }) => {
          localStorage.setItem(key, JSON.stringify(session));
          const channel = new BroadcastChannel(key);
          channel.postMessage({ event: "SIGNED_IN", session });
          channel.close();
        },
        { key: authKey, session: peerSession },
      );
      await page.getByText("No acquisitions in this view.", { exact: true }).waitFor();
      await openNew("55");
      held.release();
      await held.done();
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      assert.equal(await form().isVisible(), true);
      assert.equal(await field("Purchase price per bottle").inputValue(), "55");
      assert.equal(fixture.state.writes[0].owner, fixture.owner);
    } finally {
      held.release();
    }
  });
  await check("collector-rejects-a-conflicting-update", async () => {
    await page.getByRole("button", { name: "Edit acquisition", exact: true }).first().click();
    await field("Purchase price per bottle").fill("150");
    fixture.state.lots[0].unit_cost = 777;
    fixture.state.lots[0].updated_at = "2026-11-13T12:00:01.000Z";
    await submit().click();
    await page.getByRole("alert").waitFor();
    assert.equal(fixture.state.lots[0].unit_cost, 777);
    await page.getByRole("button", { name: "Reload acquisitions", exact: true }).click();
    await form().waitFor({ state: "hidden" });
    await add().waitFor();
  });
  await check("collector-double-submit-is-one-write", async () => {
    await openNew();
    await form().evaluate((el) => {
      for (let i = 0; i < 2; i++)
        el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await form().waitFor({ state: "hidden" });
    assert.equal(fixture.state.writes.length, 1);
  });
  await check("collector-zero-manual-estimate-retains-provenance", async () => {
    const source = "SyntheticManualReferenceWithALongUnbrokenNameForLayoutVerification";
    Object.assign(fixture.state.lots[0], {
      estimate_price: 0,
      estimate_currency: "EUR",
      estimate_date: "2026-11-01",
      estimate_source: source,
      estimate_confidence: "low",
    });
    await page.reload();
    await page.getByText(new RegExp(source)).waitFor();
    assert.equal(await page.getByText("No estimates recorded", { exact: true }).count(), 0);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByText(new RegExp(source)).scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({
      path: join(artifacts, "collector-manual-estimate-320.png"),
      animations: "disabled",
    });
  });
  report.failed = failed;
  assert.deepEqual(failed, []);
  await reset();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "125%";
      await document.fonts.ready;
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({
      path: join(artifacts, `collector-${width}.png`),
      animations: "disabled",
    });
    report.passed.push(`collector-layout-${width}`);
  }
}
