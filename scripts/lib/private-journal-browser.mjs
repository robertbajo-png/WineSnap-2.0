import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openDev11Loopback } from "./owned-dev11-loopback.mjs";
import { createPlanningDatabaseFixture } from "./planning-database-browser.mjs";

const base = "http://127.0.0.1:5291";
const gate = "http://127.0.0.1:5292";
const key = "sb_publishable_runtime_check_not_a_real_key";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function address(server) {
  return "http://127.0.0.1:" + server.address().port;
}
async function listen(server, port = 0) {
  server.listen({ host: "127.0.0.1", port, exclusive: true });
  await once(server, "listening");
  return server;
}
async function stop(server) {
  if (!server) return;
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections();
  await closed;
}
async function asRouteResponse(response) {
  const headers = Object.fromEntries(response.headers);
  for (const key of [
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
  ])
    delete headers[key];
  return { status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) };
}

export async function verifyPrivateJournalBrowser({
  backend,
  owner,
  peer,
  handler,
  proof,
  report,
  pauseMaintenance,
}) {
  const root = new URL("../../", import.meta.url);
  const entry = fileURLToPath(new URL("dist/private-journal-runtime/server/index.mjs", root));
  const directory = fileURLToPath(new URL("dist/private-journal-check/", root));
  const { chromium } = await import(
    pathToFileURL(
      join(
        process.env.USERPROFILE,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
    ).href
  );
  let proxy, upstream, bridge, web, browser;
  let cleanup = true;
  try {
    await stop(await listen(createServer(), 5291));
    const environment = Object.fromEntries(
      ["Path", "PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((name) =>
        process.env[name] ? [[name, process.env[name]]] : [],
      ),
    );
    web = spawn(process.execPath, [entry], {
      cwd: fileURLToPath(root),
      windowsHide: true,
      stdio: "ignore",
      env: { ...environment, NITRO_HOST: "127.0.0.1", NITRO_PORT: "5291" },
    });
    const ready = await new Promise((resolve) => {
      web.once("error", () => resolve(false));
      void (async () => {
        for (let attempt = 0; attempt < 45 && web.exitCode === null; attempt++) {
          const result = await fetch(base + "/api/health", {
            signal: AbortSignal.timeout(800),
          }).catch(() => null);
          if (result?.ok && (await result.json()).status === "ok") return resolve(true);
          await delay(400);
        }
        resolve(false);
      })();
    });
    assert.equal(ready, true);
    const closed = await fetch(base + "/api/dev11/journal", {
      method: "POST",
      headers: { "content-type": "application/json", "x-winesnap-dev11-proof": proof },
      body: '{"action":"read"}',
    });
    assert.equal(closed.status, 404);
    upstream = await listen(
      createServer((req, res) => {
        void (async () => {
          try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const response = await handler(
              new Request(address(upstream) + req.url, {
                method: req.method,
                headers: req.headers,
                body: Buffer.concat(chunks),
              }),
            );
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch {
            if (!res.headersSent) res.writeHead(500);
            res.end();
          }
        })();
      }),
    );
    bridge = await openDev11Loopback({
      proof,
      upstream: address(upstream),
      pageOrigin: base,
      port: 5292,
    });
    assert.equal(
      (
        await fetch(gate + "/api/dev11/journal", {
          method: "POST",
          headers: { Origin: "https://example.invalid", "x-winesnap-dev11-proof": proof },
        })
      ).status,
      404,
    );

    proxy = await listen(
      createServer((_request, response) => {
        response.writeHead(403, { "x-fixture": "network-denied" });
        response.end();
      }),
    );
    proxy.on("connect", (_request, socket) => socket.destroy());
    browser = await chromium.launch({
      headless: true,
      proxy: { server: address(proxy), bypass: "<-loopback>" },
    });
    const probe = await browser.newPage();
    assert.equal(
      await (await probe.goto(base + "/api/health")).headerValue("x-fixture"),
      "network-denied",
    );
    await probe.close();
    const fixture = await createPlanningDatabaseFixture({
      backend,
      base,
      origin: "http://127.0.0.1:54323",
      key,
      report,
      preparedAccounts: [owner, peer],
      pantry: true,
      relayWeb: async (path, method) =>
        asRouteResponse(await fetch(base + path, { method, redirect: "manual" })),
    });
    await fixture.refreshFixtureLogin(owner);
    await fixture.recipe(owner, "Syntetiskt provrecept", undefined);

    async function login(account, width) {
      const context = await browser.newContext({
        serviceWorkers: "block",
        timezoneId: "UTC",
        viewport: { width, height: 844 },
        acceptDownloads: true,
      });
      await context.addInitScript(() => localStorage.setItem("lang", "sv"));
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        try {
          if (url.origin !== gate) return await fixture.route(route);
          assert.ok(
            ["/api/dev11/journal", "/api/dev11/export"].includes(url.pathname) && !url.search,
          );
          const headers = await request.allHeaders();
          if (request.method() === "POST")
            assert.equal(fixture.browserOwner(headers.authorization?.slice(7)), account.id);
          const reply = await fetch(url, {
            method: request.method(),
            redirect: "error",
            headers: {
              Origin: base,
              ...Object.fromEntries(
                Object.entries(headers).filter(([name]) =>
                  [
                    "authorization",
                    "content-type",
                    "access-control-request-headers",
                    "access-control-request-method",
                  ].includes(name),
                ),
              ),
            },
            body: request.postDataBuffer() ?? undefined,
          });
          await route.fulfill(await asRouteResponse(reply));
        } catch {
          report.browserFixtureFailures = (report.browserFixtureFailures ?? 0) + 1;
          await route.abort().catch(() => {});
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.on("pageerror", () => {
        report.browserPageErrors = (report.browserPageErrors ?? 0) + 1;
      });
      report.phase = "browser_load_login";
      const loginResponse = await page.goto(base + "/login", { waitUntil: "networkidle" });
      assert.equal(loginResponse.status(), 200);
      report.phase = "browser_login_fields";
      await page.locator("#email").fill(account.email);
      await page.locator("#password").fill(account.password);
      report.phase = "browser_submit_login";
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(
        (url) => url.origin === base && ["/", "/onboarding"].includes(url.pathname),
      );
      report.phase = "browser_open_journal";
      await page.goto(base + "/kitchen", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("combobox", { name: "Fler vyer i köket" })
        .selectOption("private-journal");
      return { context, page, panel: page.getByRole("region", { name: "Mål och mätningar" }) };
    }

    report.phase = "mobile_web_goal_journal";
    const { context, page, panel } = await login(owner, 360);
    report.phase = "browser_separate_opt_ins";
    const goal = panel.getByRole("region", { name: "Måltidsmål" });
    const journal = panel.getByRole("region", { name: "Privat ketonjournal" });
    const enableGoal = goal.getByRole("button", { name: "Aktivera måltidsmål" });
    const enableJournal = journal.getByRole("button", { name: "Aktivera journal" });
    await enableGoal.waitFor();
    assert.equal(await enableGoal.isDisabled(), true);
    assert.equal(await enableJournal.isDisabled(), true);
    await goal.getByRole("checkbox").check();
    report.phase = "browser_goal_comparison";
    await enableGoal.click();
    await goal.getByLabel("Tillgängliga kolhydrater (g)").fill("41,53");
    await goal.getByLabel("Period").selectOption("day");
    await goal.getByRole("button", { name: "Spara mål" }).click();
    await goal.getByText("Ingen verifierad dagssumma att jämföra med.").waitFor();
    assert.equal(await enableJournal.isDisabled(), true);
    await goal.getByLabel("Period").selectOption("meal");
    await goal.getByRole("button", { name: "Spara mål" }).click();
    await goal
      .getByLabel("Jämför en receptportion")
      .selectOption({ label: "Syntetiskt provrecept" });
    await goal
      .getByText("Jämförelsen väntar på kompletta mängder och kolhydratunderlag.")
      .waitFor();

    report.phase = "browser_record_and_export";
    await journal.getByRole("checkbox").check();
    await enableJournal.click();
    await journal.getByLabel("Avläst värde (mmol/L)").fill("7,381");
    await journal
      .getByLabel("Mättid")
      .fill(new Date(Date.now() - 120000).toISOString().slice(0, 19));
    await journal.getByRole("button", { name: "Spara mätvärde" }).click();
    await journal.getByText("7,381 mmol/L", { exact: true }).waitFor();
    await journal.getByRole("radio", { name: "Utandning" }).check();
    await journal.getByText("Inga sparade mätvärden för metoden.").waitFor();
    assert.equal(await journal.getByText("7,381 mmol/L").count(), 0);
    await journal.getByRole("radio", { name: "Blod" }).check();
    await Promise.all([
      page.waitForEvent("download").then(async (download) => {
        const data = JSON.parse(await readFile(await download.path(), "utf8"));
        assert.equal(data.version, 1);
        assert.equal(data.readings.length, 1);
        assert.equal(data.readings[0].reading.unit, "mmol/L");
        assert.equal(data.readings[0].reading.value, "7.381");
        await download.delete();
      }),
      panel.getByRole("button", { name: "Exportera privata uppgifter" }).click(),
    ]);
    const clientStores = await page.evaluate(async () => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      cachedHealth: (
        await Promise.all(
          (await caches.keys()).map(async (name) =>
            (await (await caches.open(name)).keys()).some((request) =>
              request.url.includes("/api/dev11"),
            ),
          ),
        )
      ).some(Boolean),
    }));
    assert.ok(
      !clientStores.local.includes("7.381") &&
        !clientStores.session.includes("7.381") &&
        !clientStores.cachedHealth,
    );
    await mkdir(directory, { recursive: true });
    for (const [width, height] of [
      [320, 760],
      [1280, 900],
    ]) {
      await page.setViewportSize({ width, height });
      const noOverflow = await panel.evaluate(
        (node) =>
          node.scrollWidth <= node.clientWidth + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
      );
      assert.equal(noOverflow, true);
      await page.screenshot({
        path: join(directory, "synthetic-" + width + ".png"),
        fullPage: true,
      });
    }
    report.mobileAndDesktopLayoutPassed = true;

    report.phase = "browser_offline_tab_and_account";
    await context.setOffline(true);
    await panel.getByText("Den privata vyn fungerar bara online på den här datorn.").waitFor();
    assert.equal(await journal.getByText("7,381 mmol/L").count(), 0);
    await context.setOffline(false);
    await journal.getByText("7,381 mmol/L", { exact: true }).waitFor();
    if (pauseMaintenance) {
      report.phase = "browser_maintenance_pause";
      await pauseMaintenance();
    }
    const other = await context.newPage();
    await other.goto(base + "/kitchen#private-journal");
    const paused = "Dina värden är tillfälligt dolda i väntan på lokalt underhåll.";
    if (pauseMaintenance) {
      await other.setViewportSize({ width: 320, height: 760 });
      await other.getByText(paused).waitFor();
      assert.equal(await other.getByText("7,381 mmol/L").count(), 0);
      assert.equal(
        await other.getByRole("button", { name: "Exportera privata uppgifter" }).count(),
        0,
      );
      assert.equal(await other.getByRole("button", { name: "Spara mätvärde" }).count(), 0);
      assert.equal(await other.getByRole("button", { name: "Spara mål" }).count(), 0);
      assert.ok(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await other.screenshot({
        path: join(directory, "synthetic-maintenance-320.png"),
        fullPage: true,
      });
    }
    await other.getByRole("button", { name: "Stäng av och radera journalen" }).click();
    if (pauseMaintenance)
      await other
        .getByRole("region", { name: "Privat ketonjournal" })
        .getByText("Avstängt")
        .waitFor();
    await page.bringToFront();
    if (pauseMaintenance) {
      await panel.getByText(paused).waitFor();
      await journal.getByText("Avstängt").waitFor();
      report.maintenancePausedMobileWithdrawalPassed = true;
    } else await enableJournal.waitFor();
    assert.equal(await journal.getByText("7,381 mmol/L").count(), 0);
    await context.close();
    const noAccess = await login(peer, 390);
    await noAccess.panel
      .getByText(
        "Den privata vyn är inte tillgänglig för det här kontot eller den här anslutningen.",
      )
      .waitFor();
    assert.equal(await noAccess.panel.locator("input").count(), 0);
    await noAccess.context.close();
    assert.equal(
      (report.browserPageErrors ?? 0) +
        (report.browserFixtureFailures ?? 0) +
        (report.externalRequests ?? 0) +
        (report.mutations ?? 0),
      0,
    );
    report.isolatedBrowserPassed = true;
  } finally {
    if (browser)
      await browser.close().catch(() => {
        cleanup = false;
      });
    for (const server of [bridge, upstream, proxy])
      await stop(server).catch(() => {
        cleanup = false;
      });
    if (web?.pid && web.exitCode === null && web.signalCode === null) {
      const ended = once(web, "exit");
      web.kill();
      await ended.catch(() => {
        cleanup = false;
      });
    }
    report.browserCleanupPassed = cleanup;
    assert.equal(cleanup, true);
  }
}
