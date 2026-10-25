import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.argv.length, 2);
const project = "pzniyupmgwvlldvztzqh",
  origin = `https://${project}.supabase.co`,
  app = "http://127.0.0.1:5210";
let raw = "";
for await (const part of process.stdin) {
  raw += part;
  assert.ok(raw.length < 16384);
}
const keys = JSON.parse(raw);
raw = "";
assert.equal(keys.project, project);
const report = {
  completed: false,
  project,
  productionTouched: false,
  checks: [],
  browserErrors: [],
  cleanupFailures: 0,
  providerCalls: 0,
};
const output = new URL("../dist/nutrition-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const save = () =>
  writeFile(
    new URL("../dist/local-windows-nutrition-report.json", import.meta.url),
    JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2),
  );
const users = [];
let browser, page;
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch(url, init) {
      assert.equal(new URL(url instanceof Request ? url.url : String(url)).origin, origin);
      return fetch(url, {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
    },
  },
};
const admin = createClient(origin, keys.secret, options);
const ok = (r) => {
  if (r.error) {
    report.backendCode = r.error.code;
    throw new Error("backend_check_failed");
  }
  return r.data;
};
async function check(name, fn) {
  report.stage = name;
  try {
    await fn();
    report.checks.push({ name, passed: true });
  } catch (e) {
    report.checks.push({ name, passed: false });
    report.failure = e.code ?? e.name;
    let message = String(e.message);
    for (const secret of [
      ...Object.values(keys),
      ...users.flatMap((u) => [u.email, u.password, u.auth?.access_token, u.auth?.refresh_token]),
    ])
      if (typeof secret === "string" && secret.length > 5)
        message = message.replaceAll(secret, "[redacted]");
    report.message = message.slice(0, 800);
    if (page)
      await page
        .screenshot({ path: fileURLToPath(new URL("failure.png", output)), fullPage: true })
        .catch(() => {});
    throw e;
  } finally {
    await save();
  }
}
const recipe = (title, ingredients) => ({
  title,
  description: "Syntetiskt acceptanstest",
  servings: 2,
  totalMinutes: 20,
  image: "none",
  sourceNote: "Synthetic fixture",
  notes: "",
  ingredients: ingredients.map(([name, amount, unit]) => ({
    id: randomUUID(),
    name,
    amount,
    unit,
  })),
  steps: [
    {
      id: randomUUID(),
      title: "Granska tillagningen",
      text: "Använd ett granskat tillagningssätt.",
      timerSeconds: null,
    },
  ],
});
try {
  await check("exact test destination and empty preflight", async () => {
    assert.equal(ok(await admin.auth.admin.listUsers()).users.length, 0);
    assert.equal(ok(await admin.from("wines").select("id")).length, 0);
  });
  for (let i = 0; i < 2; i++) {
    const email = `nutrition-${randomUUID()}@example.test`,
      password = randomUUID() + "Aa9!",
      { user } = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    const u = {
      id: user.id,
      email,
      password,
      client: createClient(origin, keys.publishable, options),
    };
    users.push(u);
    u.auth = ok(await u.client.auth.signInWithPassword({ email, password })).session;
    ok(
      await admin
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", u.id),
    );
  }
  const [owner, peer] = users;
  const tomato = ok(
    await owner.client.rpc("kitchen_save_recipe", {
      _recipe_id: randomUUID(),
      _version_id: randomUUID(),
      _expected_revision: 0,
      _document: recipe("Testets tomat & olja", [
        ["Tomat", 100, "g"],
        ["Olivolja", 10, "ml"],
      ]),
    }),
  );
  const pasta = ok(
    await owner.client.rpc("kitchen_save_recipe", {
      _recipe_id: randomUUID(),
      _version_id: randomUUID(),
      _expected_revision: 0,
      _document: recipe("Testets pasta", [["Pasta", 180, "g"]]),
    }),
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
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => report.browserErrors.push(e.name));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/chef") report.providerCalls++;
  });
  await page.goto(app + "/login");
  await page.locator("#email").fill(owner.email);
  await page.locator("#password").fill(owner.password);
  await page.getByRole("button", { name: /^(Sign In|Logga in)$/ }).click();
  await page.waitForURL(app + "/");
  const summary = () => page.getByRole("region", { name: "Beräkningsresultat" });
  const confirm = (i) =>
    page
      .getByLabel("Jag har kontrollerat referens, form och ätlig gramvikt", { exact: true })
      .nth(i);
  await check("standard default, opt-in and missing data never zero", async () => {
    await page.goto(app + "/kitchen#nutrition");
    await page
      .getByRole("heading", { name: "Kolhydrater & ingrediensbyten", exact: true })
      .waitFor();
    assert.equal(await page.getByLabel("Standard", { exact: true }).isChecked(), true);
    assert.equal(await summary().count(), 0);
    await page.getByLabel("Keto", { exact: true }).check();
    await page.getByText("Ofullständigt underlag", { exact: true }).waitFor();
    await page.getByLabel("Egen gräns, g per portion (valfri)").fill("10");
    assert.equal(await page.getByText(/Beräkningen ligger inom/).count(), 0);
    assert.equal(report.providerCalls, 0);
  });
  await check("EU reference, weighed volume, scaling and provenance", async () => {
    await page.getByLabel("Recept för kolhydratberäkning").selectOption(tomato.id);
    await page.locator("#ingredient-0-food").selectOption("slv:364");
    await page.locator("#ingredient-0-form").selectOption("raw");
    await confirm(0).check();
    await page.locator("#ingredient-1-food").selectOption("slv:35");
    assert.equal(await page.locator("#ingredient-1-grams").inputValue(), "");
    await page.locator("#ingredient-1-grams").fill("9");
    await page.locator("#ingredient-1-form").selectOption("as_sold");
    await confirm(1).check();
    await summary().getByText("1,3 g", { exact: true }).first().waitFor();
    await page.getByLabel("Egen gräns, g per portion (valfri)").fill("1.2");
    await summary()
      .getByText("Beräkningen ligger över din valda gräns.", { exact: true })
      .waitFor();
    await page.getByLabel("Antal portioner i beräkningen").fill("4");
    await summary().getByText("5,2 g", { exact: true }).waitFor();
    await page.getByText("Referensvärden och version", { exact: true }).first().click();
    await page.getByText(/Livsmedelsnummer 364/).waitFor();
    assert.equal(report.providerCalls, 0);
  });
  await check("state mismatch, US missing fiber and EU double subtraction guard", async () => {
    await page.locator("#ingredient-0-form").selectOption("cooked");
    await confirm(0).check();
    await summary().getByText("Ofullständigt underlag", { exact: true }).waitFor();
    await page.locator("#ingredient-0-food").selectOption("manual");
    await page.getByLabel("Produkt och etikett ingredient-0").fill("Syntetisk etikett");
    await page.getByLabel("Kolhydratdefinition ingredient-0").selectOption("US");
    await page.getByLabel("Kolhydrater per 100 g ingredient-0").fill("10");
    await page.locator("#ingredient-0-form").selectOption("as_sold");
    await confirm(0).check();
    await summary().getByText("Ofullständigt underlag", { exact: true }).waitFor();
    await page.getByLabel("Fiber per 100 g ingredient-0").fill("4");
    await confirm(0).check();
    await summary().getByText("3 g", { exact: true }).first().waitFor();
    await page.getByLabel("Kolhydratdefinition ingredient-0").selectOption("EU");
    await confirm(0).check();
    await summary().getByText("5 g", { exact: true }).first().waitFor();
    await page.getByLabel("Kolhydratdefinition ingredient-0").selectOption("US");
    await page.getByLabel("Fiber per 100 g ingredient-0").fill("20");
    await confirm(0).check();
    await summary().getByText("Ofullständigt underlag", { exact: true }).waitFor();
  });
  await check("mobile tablet desktop accessibility and no overlap", async () => {
    await page.getByLabel("Fiber per 100 g ingredient-0").fill("4");
    await confirm(0).check();
    for (const width of [360, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const audit = await new AxeBuilder({ page }).include(".kitchen").analyze();
      report.lastAxe = audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      }));
      assert.deepEqual(report.lastAxe, []);
      await page.screenshot({
        path: fileURLToPath(new URL(`nutrition-${width}.png`, output)),
        fullPage: true,
      });
    }
  });
  await check("explicit substitution grams and culinary-only Chef handoff", async () => {
    await page.getByLabel("Recept för kolhydratberäkning").selectOption(pasta.id);
    await page.locator("#ingredient-0-food").selectOption("slv:845");
    await page.locator("#ingredient-0-form").selectOption("dry");
    await confirm(0).check();
    await page.getByRole("button", { name: "Jämför ett byte", exact: true }).click();
    assert.equal(await page.locator("#replacement-grams").inputValue(), "");
    await page.locator("#replacement-food").selectOption("slv:362");
    await page.locator("#replacement-grams").fill("300");
    await page.locator("#replacement-form").selectOption("raw");
    await confirm(1).check();
    assert.deepEqual(
      ok(
        await owner.client
          .from("kitchen_recipe_versions")
          .select("document")
          .eq("id", pasta.id)
          .single(),
      ).document,
      pasta.document,
    );
    assert.equal(report.providerCalls, 0);
    await page.getByRole("button", { name: "Granska bytet med AI-kocken", exact: true }).click();
    const prompt = await page
      .getByLabel("Vad ska receptet innehålla eller ändra?", { exact: true })
      .inputValue();
    assert.match(prompt, /Squash/);
    assert.match(prompt, /300 g/);
    assert.doesNotMatch(prompt, /keto|gräns|barn|1\.2/i);
    assert.equal(report.providerCalls, 0);
  });
  await check("manually requested live adaptation is an unsaved draft", async () => {
    await page.getByRole("button", { name: "Ta fram förslag", exact: true }).click();
    await page
      .getByRole("button", { name: "Granska recept", exact: true })
      .waitFor({ timeout: 90000 });
    assert.equal(report.providerCalls, 1);
    assert.equal(ok(await owner.client.from("kitchen_recipe_versions").select("id")).length, 2);
    await page.getByRole("button", { name: "Granska recept", exact: true }).click();
    await page.getByRole("button", { name: "Spara ny version", exact: true }).waitFor();
    assert.equal(ok(await owner.client.from("kitchen_recipe_versions").select("id")).length, 2);
    await page
      .getByRole("button", { name: /Avbryt|Cancel/, exact: true })
      .first()
      .click();
  });
  await check("reload off and peer isolation without nutrition persistence", async () => {
    await page.goto(app + "/kitchen#nutrition");
    await page.getByLabel("Standard", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Standard", { exact: true }).isChecked(), true);
    await page.getByLabel("Keto", { exact: true }).check();
    await summary().getByText("Ofullständigt underlag", { exact: true }).waitFor();
    await page.getByLabel("Standard", { exact: true }).check();
    assert.equal(await summary().count(), 0);
    await page.reload();
    assert.equal(await page.getByLabel("Standard", { exact: true }).isChecked(), true);
    for (const table of ["food_signals", "kitchen_diners", "cooking_sessions"])
      assert.equal(ok(await owner.client.from(table).select("id")).length, 0);
    assert.ok(
      !(await page.evaluate(() => Object.keys(localStorage))).some((k) =>
        /nutrition|keto|diet/i.test(k),
      ),
    );
    const peerContext = await browser.newContext(),
      peerPage = await peerContext.newPage();
    await peerPage.goto(app + "/login");
    await peerPage.locator("#email").fill(peer.email);
    await peerPage.locator("#password").fill(peer.password);
    await peerPage.getByRole("button", { name: /^(Sign In|Logga in)$/ }).click();
    await peerPage.waitForURL(app + "/");
    await peerPage.goto(app + "/kitchen#nutrition");
    await peerPage.getByLabel("Keto", { exact: true }).check();
    await peerPage.getByText("Spara ett recept i kokboken först.", { exact: true }).waitFor();
    await peerContext.close();
    assert.deepEqual(report.browserErrors, []);
  });
  report.completed = true;
} catch {
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const user of users) {
    try {
      if ((await admin.auth.admin.deleteUser(user.id)).error) report.cleanupFailures++;
    } catch {
      report.cleanupFailures++;
    }
  }
  try {
    assert.equal(ok(await admin.auth.admin.listUsers()).users.length, 0);
    for (const t of ["kitchen_recipes", "kitchen_recipe_versions", "food_signals"])
      assert.equal(ok(await admin.from(t).select("id")).length, 0);
  } catch {
    report.cleanupFailures++;
  }
  if (report.cleanupFailures) {
    report.completed = false;
    process.exitCode = 1;
  }
  await save();
  console.log(
    JSON.stringify({
      completed: report.completed,
      checks: report.checks.length,
      cleanupFailures: report.cleanupFailures,
      productionTouched: false,
    }),
  );
}
