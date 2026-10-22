import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  imageBrowserRequestAllowed,
  imageBrowserSessionUrls,
} from "./lib/image-browser-session.mjs";

assert.equal(process.argv.length, 2, "This check accepts no connection arguments");
assert.ok(!process.env.WINESNAP_TEST_SECRET_KEY, "UI checks must not inherit admin keys");
const root = fileURLToPath(new URL("../", import.meta.url));
const urls = imageBrowserSessionUrls(
  JSON.parse(await readFile(resolve(root, "dist/hosted-image-browser-session.json"), "utf8")),
);
const { chromium } = await import(
  process.env.WINESNAP_PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.WINESNAP_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const { default: AxeBuilder } = await import(
  process.env.WINESNAP_AXE_MODULE
    ? pathToFileURL(resolve(process.env.WINESNAP_AXE_MODULE)).href
    : "@axe-core/playwright"
);
const report = {
  project: "pzniyupmgwvlldvztzqh",
  scope: "built app, synthetic sign-in, read-only application pages, no AI calls",
  completed: false,
  checks: [],
  blockedRequests: 0,
  pageErrors: 0,
  note: "Automated WCAG checks are not screen-reader or physical-device acceptance.",
};
const browser = await chromium.launch({ headless: true });
let credentials = [];
let failed = false;
try {
  const operator = await browser.newPage();
  await operator.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== urls.controlUrl) return route.abort();
    await route.continue();
  });
  await operator.goto(urls.controlUrl);
  await operator.getByText("Show temporary test sign-ins", { exact: true }).click();
  for (const label of ["Owner email", "Owner password"]) {
    credentials.push(await operator.getByLabel(label, { exact: true }).inputValue());
  }
  await operator.close();

  for (const authenticated of [false, true]) {
    const context = await browser.newContext({ locale: "sv-SE", serviceWorkers: "block" });
    context.on("page", (page) => page.on("pageerror", () => report.pageErrors++));
    await context.route("**/*", async (route) => {
      if (!imageBrowserRequestAllowed(route.request().url(), urls.appUrl, urls.controlUrl)) {
        report.blockedRequests++;
        return route.abort("blockedbyclient");
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    if (authenticated) {
      await page.goto(`${urls.appUrl}/login`);
      await page.getByRole("button", { name: "Logga in", exact: true }).waitFor();
      await page.getByLabel("E-post", { exact: true }).fill(credentials[0]);
      await page.getByLabel("Lösenord", { exact: true }).fill(credentials[1]);
      await page.getByRole("button", { name: "Logga in", exact: true }).click();
      await page.waitForURL(`${urls.appUrl}/`);
    }
    const routes = authenticated
      ? [
          ["home", "/"],
          ["cellar", "/cellar"],
          ["overview", "/cellar/overview"],
          ["collector", "/cellar/collection"],
          ["wishlist", "/wishlist"],
          ["ask", "/ask"],
          ["profile", "/me"],
          ["taste", "/taste"],
          ["scan", "/scan"],
          ["wine", new URL(urls.wineUrl).pathname],
        ]
      : [
          ["home", "/"],
          ["login", "/login"],
          ["forgot-password", "/forgot-password"],
          ["privacy", "/privacy"],
          ["scan", "/scan"],
          ["ask", "/ask"],
          ["profile", "/me"],
        ];
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      for (const [name, path] of routes) {
        await page.goto(`${urls.appUrl}${path}`);
        await page.waitForFunction(() => document.documentElement.lang === "sv");
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        if (name === "profile" && !authenticated) {
          await page.getByRole("link", { name: "Logga in", exact: true }).waitFor();
          assert.equal(await page.getByRole("switch").count(), 0);
          assert.equal(await page.getByRole("button", { name: /^Användarnamn/ }).count(), 0);
        }
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        const violations = results.violations.map((violation) => ({
          rule: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ targets: node.target })),
        }));
        const check = {
          name,
          authenticated,
          actualPath: name === "wine" ? "/wine/:fixture" : new URL(page.url()).pathname,
          viewport,
          overflow,
          violations,
        };
        report.checks.push(check);
        if (overflow || violations.length) failed = true;
        console.log(
          JSON.stringify({
            name,
            authenticated,
            width: viewport.width,
            violations: violations.length,
            overflow,
          }),
        );
      }
    }
    await context.close();
  }
  report.completed = true;
} catch (error) {
  // Do not save raw browser errors, filled values or account content.
  report.failureClass = error?.constructor?.name ?? "UnknownError";
  failed = true;
} finally {
  credentials.fill("");
  await browser.close();
  report.checkedAt = new Date().toISOString();
  report.passed = report.checks.filter(
    (check) => !check.overflow && !check.violations.length,
  ).length;
  await writeFile(resolve(root, "dist/release-ui-report.json"), JSON.stringify(report, null, 2));
  if (failed || report.blockedRequests || report.pageErrors) process.exitCode = 1;
  console.log(
    JSON.stringify({
      completed: report.completed,
      passed: report.passed,
      checked: report.checks.length,
    }),
  );
}
