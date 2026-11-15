import assert from "node:assert/strict";
import { join } from "node:path";

export function assertKitchenTabsFixture({ base, owner, fixture, peerSession, authKey, report }) {
  const url = new URL(base);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(url.port && !["5212", "54323", "8026"].includes(url.port));
  assert.equal(url.pathname, "/");
  assert.equal(url.search + url.hash + url.username + url.password, "");
  assert.equal(authKey, "sb-127-auth-token");
  assert.equal(report.synthetic, true);
  assert.equal(report.fixtureDataMocked, true);
  for (const id of [owner, fixture.recipeId, fixture.sessionId, peerSession?.user?.id])
    assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(owner, peerSession.user.id);
  assert.ok(peerSession.access_token.endsWith(".synthetic-not-a-valid-signature"));
}

// Only this isolated synthetic browser's fixed IDB record is inspected/seeded.
async function fixtureCache(page, owner, fixture, mode = "read") {
  assert.ok(["read", "dirty", "remove"].includes(mode));
  return page.evaluate(
    async ({ owner, version, session, mode }) => {
      const db = await new Promise((resolve, reject) => {
        const opening = indexedDB.open("winesnap-kitchen-v1", 1);
        opening.onerror = () => reject(Error("synthetic_cache_open_failed"));
        opening.onsuccess = () => resolve(opening.result);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("accounts", mode === "read" ? "readonly" : "readwrite");
          const store = tx.objectStore("accounts");
          const request = store.get(owner);
          let value;
          request.onsuccess = () => {
            value = request.result ?? null;
            if (
              value &&
              (value.owner !== owner ||
                value.session?.id !== session ||
                value.session?.version.id !== version)
            ) {
              tx.abort();
              return;
            }
            if (mode === "dirty") {
              if (!value?.session || value.session.state.status !== "paused") {
                tx.abort();
                return;
              }
              value = {
                ...value,
                cacheRevision: value.cacheRevision + 1,
                session: {
                  ...value.session,
                  dirty: true,
                  requestId: "10000000-0000-4000-8000-000000000099",
                  state: { ...value.session.state, activeStep: 1 },
                },
              };
              store.put(value);
            } else if (mode === "remove") store.delete(owner);
          };
          tx.oncomplete = () => resolve(value);
          tx.onerror = tx.onabort = () => reject(Error("synthetic_cache_record_scope_failed"));
        });
      } finally {
        db.close();
      }
    },
    { owner, version: fixture.recipeId, session: fixture.sessionId, mode },
  );
}

const cookingRead = (page) =>
  page.waitForRequest((request) => new URL(request.url()).pathname === "/rest/v1/cooking_sessions");
const memoryReady = (page, value) =>
  page.getByRole("heading", { name: "Gillar " + value, exact: true }).waitFor();
const conflict =
  "K\u00f6ket \u00e4ndrades i en annan flik. H\u00e4mta uppdateringen innan du forts\u00e4tter.";

export async function acceptCoreKitchenTabs(args) {
  assertKitchenTabsFixture(args);
  const { page, context, base, owner, fixture, peerSession, authKey, report, artifacts } = args;
  const extra = [],
    roots = [];
  let release;
  try {
    report.phase = "tabs-same-owner-parallel-start";
    const second = await context.newPage();
    extra.push(second);
    second.on("pageerror", () => report.pageErrors++);
    await page.setViewportSize({ width: 390, height: 844 });
    await second.setViewportSize({ width: 1440, height: 1000 });
    release = fixture.delay("cooking_sessions");
    const firstRead = cookingRead(page),
      secondRead = cookingRead(second);
    await page.goto(base + "/kitchen#memory", { waitUntil: "domcontentloaded" });
    await second.goto(base + "/kitchen#memory", { waitUntil: "domcontentloaded" });
    await Promise.all([firstRead, secondRead]);
    release();
    release = null;
    await Promise.all([
      memoryReady(page, fixture.memoryValue),
      memoryReady(second, fixture.memoryValue),
    ]);
    assert.equal(await page.getByText(conflict, { exact: true }).count(), 0);
    assert.equal(await second.getByText(conflict, { exact: true }).count(), 0);
    const original = await fixtureCache(page, owner, fixture);
    assert.equal(original.cacheRevision, 1);
    await page.screenshot({ path: join(artifacts, "tabs-start-390.png"), fullPage: true });
    await second.screenshot({ path: join(artifacts, "tabs-start-1440.png"), fullPage: true });
    report.passed.push("tabs-parallel-start-reuses-one-owner-cache-without-locking-memory");
    await second.close();

    report.phase = "tabs-start-during-unsynced-edit";
    const reader = await context.newPage();
    extra.push(reader);
    reader.on("pageerror", () => report.pageErrors++);
    await reader.setViewportSize({ width: 320, height: 844 });
    release = fixture.delay("cooking_sessions");
    const arrival = cookingRead(reader);
    await reader.goto(base + "/kitchen#memory", { waitUntil: "domcontentloaded" });
    await arrival;
    const changed = await fixtureCache(page, owner, fixture, "dirty");
    report.simulatedCacheEdits = (report.simulatedCacheEdits ?? 0) + 1;
    release();
    release = null;
    await memoryReady(reader, fixture.memoryValue);
    // Covers the existing 500 ms initial auto-sync window, not an offline-network proof.
    await reader.waitForTimeout(800);
    assert.deepEqual(await fixtureCache(reader, owner, fixture), changed);
    assert.equal(report.mutations, 0);
    await reader.goto(base + "/kitchen#cook");
    await reader.getByText("Steg 2 av 2", { exact: true }).waitFor();
    assert.equal(await reader.getByRole("timer").textContent(), "01:00");
    await reader.screenshot({
      path: join(artifacts, "tabs-preserved-dirty-320.png"),
      fullPage: true,
    });
    report.passed.push("tabs-start-never-overwrites-or-autosyncs-a-newer-unsynced-session");

    report.phase = "tabs-competing-edit-still-rejected";
    await page.goto(base + "/kitchen#cook");
    await page.getByText("Steg 1 av 2", { exact: true }).waitFor();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
    await page.getByRole("button", { name: "\u00c5teruppta matlagningen", exact: true }).click();
    await page.getByText(conflict, { exact: true }).waitFor();
    assert.deepEqual(await fixtureCache(page, owner, fixture), changed);
    assert.equal(report.mutations, 0);
    await page.screenshot({ path: join(artifacts, "tabs-edit-conflict-390.png"), fullPage: true });
    report.passed.push("tabs-competing-user-edit-keeps-strict-cache-revision-and-pending-timer");

    report.phase = "tabs-explicit-read-recovery";
    const sameDocument = await page.locator("html").elementHandle();
    roots.push(sameDocument);
    await page.goto(base + "/kitchen#library");
    const search = page.getByRole("searchbox", { name: "S\u00f6k recept" });
    await search.fill("synthetic unsaved search");
    await page.evaluate((owner) => {
      const original = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        if (this.name === "accounts" && key === owner) {
          IDBObjectStore.prototype.get = original;
          throw Error("synthetic_one_read_fault");
        }
        return original.call(this, key);
      };
    }, owner);
    const retryRead = page.getByRole("button", { name: "H\u00e4mta igen", exact: true });
    await retryRead.click();
    await page
      .getByText(
        "Uppdateringen kunde inte h\u00e4mtas. Vyn och dina utkast beh\u00e5lls. F\u00f6rs\u00f6k h\u00e4mta igen.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await search.inputValue(), "synthetic unsaved search");
    assert.equal(await sameDocument.evaluate((node) => node.isConnected), true);
    assert.deepEqual(await fixtureCache(page, owner, fixture), changed);
    report.passed.push("tabs-failed-recovery-keeps-mounted-view-and-unsaved-search");
    await retryRead.click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    assert.equal(await search.inputValue(), "synthetic unsaved search");
    assert.equal(await sameDocument.evaluate((node) => node.isConnected), true);
    await page.goto(base + "/kitchen#cook");
    await page.getByText("Steg 2 av 2", { exact: true }).waitFor();
    assert.equal(await page.getByRole("timer").textContent(), "01:00");
    await page.waitForTimeout(800);
    assert.deepEqual(await fixtureCache(page, owner, fixture), changed);
    assert.equal(report.mutations, 0);
    assert.equal(report.simulatedAiRequests, 0);
    await page.screenshot({ path: join(artifacts, "tabs-recovered-390.png"), fullPage: true });
    report.passed.push("tabs-explicit-recovery-adopts-winning-snapshot-without-reload-or-write");
    await page.goto(base + "/");
    await reader.goto(base + "/");
    await fixtureCache(page, owner, fixture, "remove");
    await reader.close();

    report.phase = "tabs-late-old-account-startup";
    const control = await context.newPage();
    extra.push(control);
    control.on("pageerror", () => report.pageErrors++);
    await control.goto(base + "/");
    release = fixture.delay("cooking_sessions");
    const oldRead = cookingRead(page);
    await page.goto(base + "/kitchen#memory");
    await oldRead;
    const root = await page.locator("html").elementHandle();
    roots.push(root);
    const peerRead = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/rest/v1/cooking_sessions" &&
        request.headers().authorization === "Bearer " + peerSession.access_token,
    );
    await control.evaluate(
      ({ key, session }) => {
        localStorage.setItem(key, JSON.stringify(session));
        const channel = new BroadcastChannel(key);
        channel.postMessage({ event: "SIGNED_IN", session });
        channel.close();
      },
      { key: authKey, session: peerSession },
    );
    await peerRead;
    release();
    release = null;
    await page
      .getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true })
      .waitFor();
    assert.equal(await root.evaluate((node) => node.isConnected), true);
    assert.equal(await page.getByText(conflict, { exact: true }).count(), 0);
    assert.equal(await page.getByText(fixture.memoryValue, { exact: false }).count(), 0);
    assert.equal(await fixtureCache(page, owner, fixture), null);
    report.passed.push("tabs-late-startup-cannot-restore-a-cleared-old-account-cache");
    assert.equal(report.mutations, 0);
    assert.equal(report.simulatedWrites, 0);
    assert.equal(report.simulatedAiRequests, 0);
    await page.goto(base + "/");
  } catch (error) {
    await page
      .screenshot({ path: join(artifacts, "tabs-failure-primary.png"), fullPage: true })
      .catch(() => {});
    for (let index = 0; index < extra.length; index++)
      if (!extra[index].isClosed())
        await extra[index]
          .screenshot({ path: join(artifacts, `tabs-failure-extra-${index}.png`), fullPage: true })
          .catch(() => {});
    throw error;
  } finally {
    release?.();
    let failed = false;
    for (const root of roots)
      await root?.dispose().catch(() => {
        failed = true;
      });
    for (const current of extra.reverse()) {
      try {
        if (!current.isClosed()) await current.close();
        assert.equal(current.isClosed(), true);
      } catch {
        failed = true;
      }
    }
    if (failed) throw Error("synthetic_tabs_cleanup_failed");
  }
}
