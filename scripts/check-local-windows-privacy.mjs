import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

assert.equal(process.argv.length, 2);
const app = "http://127.0.0.1:5210";
const output = new URL("../dist/supplier-privacy-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  completed: false,
  productionTouched: false,
  checks: [],
  browserErrors: [],
  externalRequests: [],
};
const save = () =>
  writeFile(
    new URL("../dist/local-windows-privacy-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
const { chromium } = await import(
  pathToFileURL(
    `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
  ).href
);
const { default: AxeBuilder } = await import(
  pathToFileURL(
    `${process.env.LOCALAPPDATA}/WineSnapHosting/qa-runtime/node_modules/@axe-core/playwright/dist/index.mjs`,
  ).href
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "allow",
});
await context.addInitScript(() => {
  if (localStorage.getItem("lang") === null) localStorage.setItem("lang", "en");
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const fontUrls = new Set();
context.on("request", (request) => {
  const url = new URL(request.url());
  if (url.origin !== app) report.externalRequests.push(url.origin);
  if (url.origin === app && url.pathname.endsWith(".woff2")) fontUrls.add(url.href);
});
await context.route("**/*", async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== app || !["GET", "HEAD"].includes(request.method()))
    return route.abort();
  return route.continue();
});
page.on("pageerror", (error) => report.browserErrors.push(error.name));
async function check(name, run) {
  report.stage = name;
  try {
    await run();
    report.checks.push({ name, passed: true });
  } catch (error) {
    report.checks.push({ name, passed: false });
    report.failure = error.name;
    report.message = String(error.message).slice(0, 800);
    throw error;
  } finally {
    await save();
  }
}
try {
  await check("public privacy warning remains visible without supplier approval", async () => {
    const response = await page.goto(app + "/privacy");
    assert.equal(response.status(), 200);
    await page.getByRole("alert").filter({ hasText: "supplier accounts" }).waitFor();
    await page.getByRole("heading", { name: "Suppliers and transfers", exact: true }).waitFor();
    await page.getByText(/55-day Gemini abuse monitoring/).waitFor();
    assert.equal(
      await page.locator('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]').count(),
      0,
    );
  });
  await check("both font families and extended Latin load from the app origin", async () => {
    const loaded = await page.evaluate(async () => {
      const text = "\u00c5\u00c4\u00d6 \u00e5\u00e4\u00f6 \u0150\u0141";
      const faces = await Promise.all(
        ['400 16px "Inter"', '700 20px "Cormorant Garamond"'].map((font) =>
          document.fonts.load(font, text),
        ),
      );
      await document.fonts.ready;
      return faces.map((items) =>
        items.map((font) => ({ family: font.family, status: font.status })),
      );
    });
    assert.ok(
      loaded.every((items) => items.length >= 2 && items.every((font) => font.status === "loaded")),
    );
    assert.equal(fontUrls.size, 4);
    assert.deepEqual(report.externalRequests, []);
  });
  await check("mobile desktop bilingual privacy is accessible without overflow", async () => {
    for (const lang of ["en", "sv"]) {
      await page.evaluate((value) => localStorage.setItem("lang", value), lang);
      await page.reload();
      await page
        .getByRole("heading", {
          name: lang === "sv" ? "Leverantörer och överföringar" : "Suppliers and transfers",
          exact: true,
        })
        .waitFor();
      for (const width of [360, 390, 1024, 1440]) {
        await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
        await page.evaluate(() => document.fonts.ready);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        const audit = await new AxeBuilder({ page }).include("#winesnap-content").analyze();
        report.lastAxe = audit.violations.map((item) => ({
          id: item.id,
          nodes: item.nodes.map((node) => node.target),
        }));
        assert.deepEqual(report.lastAxe, []);
        await page.screenshot({
          path: fileURLToPath(new URL(`privacy-${lang}-${width}.png`, output)),
          fullPage: true,
        });
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: fileURLToPath(new URL(`privacy-${lang}-${width}-viewport.png`, output)),
          });
      }
    }
  });
  await check("local licenses ship with the app", async () => {
    for (const name of ["Inter-OFL.txt", "Cormorant-Garamond-OFL.txt"]) {
      const response = await context.request.get(app + "/fonts/" + name);
      assert.equal(response.status(), 200);
      assert.match(await response.text(), /SIL OPEN FONT LICENSE Version 1.1/);
    }
  });
  await check(
    "public fonts stay available offline in the current service-worker cache",
    async () => {
      await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.ready).active));
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      const urls = [...fontUrls];
      await page.evaluate(async (files) => {
        for (const file of files) {
          const response = await fetch(file);
          if (!response.ok) throw new Error("font_warmup_failed");
          await response.arrayBuffer();
        }
      }, urls);
      await context.setOffline(true);
      const results = await page.evaluate(async (files) => {
        const result = [];
        for (const file of files) {
          const response = await fetch(file);
          const bytes = new Uint8Array(await response.arrayBuffer());
          result.push({
            ok: response.ok,
            bytes: bytes.length,
            signature: String.fromCharCode(...bytes.slice(0, 4)),
          });
        }
        return result;
      }, urls);
      assert.ok(
        results.length === 4 &&
          results.every((item) => item.ok && item.bytes > 10000 && item.signature === "wOF2"),
      );
      await context.setOffline(false);
      assert.deepEqual(report.externalRequests, []);
      assert.deepEqual(report.browserErrors, []);
    },
  );
  report.completed = true;
} catch {
  process.exitCode = 1;
  await page
    .screenshot({ path: fileURLToPath(new URL("failure.png", output)), fullPage: true })
    .catch(() => {});
} finally {
  await browser.close();
  await save();
}
process.stdout.write(
  JSON.stringify({
    completed: report.completed,
    report: "dist/local-windows-privacy-report.json",
  }) + "\n",
);
