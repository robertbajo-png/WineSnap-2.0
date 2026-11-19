import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.argv[2] ?? "http://127.0.0.1:5200";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname),
  "Only local prototype targets are allowed",
);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = resolve("dist/chef-prototype-qa");
await mkdir(output, { recursive: true });
const results = [];

try {
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["small-mobile", 360, 740],
    ["tablet", 1024, 1000],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
        !["data:", "blob:"].includes(url.protocol)
      ) {
        external.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });

    async function layout(name) {
      await page.locator("img").evaluateAll((images) =>
        images.forEach((image) => {
          image.loading = "eager";
        }),
      );
      await page.waitForFunction(() =>
        Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
      );
      const measurement = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: Array.from(document.querySelectorAll("main *"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
          })
          .slice(0, 8)
          .map((element) => element.className),
      }));
      assert.ok(
        measurement.scrollWidth <= measurement.width + 1,
        `${label}/${name} has horizontal overflow: ${JSON.stringify(measurement)}`,
      );
      await page.screenshot({ path: resolve(output, `${label}-${name}.png`), fullPage: true });
      results.push({ viewport: label, screen: name, width, ...measurement });
    }

    await page.goto(`${origin}/#home`);
    await page.getByRole("heading", { name: "Vad lagar vi ikväll?" }).waitFor();
    await layout("home");
    await page.getByRole("button", { name: "Se receptet", exact: true }).click();
    const save = page.getByRole("button", { name: "Spara detta recept", exact: true });
    await save.click();
    assert.equal(await save.getAttribute("aria-pressed"), "false");
    await save.click();
    assert.equal(await save.getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Fler portioner", exact: true }).click();
    assert.equal(await page.getByTestId("serving-count").innerText(), "3");
    assert.ok((await page.locator(".cp-ingredient-list").innerText()).includes("900 g"));
    await layout("recipe");
    await page.getByRole("button", { name: "Börja laga", exact: true }).click();
    await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
    await page.getByRole("button", { name: "Lägg till timer", exact: true }).click();
    await page.getByLabel("Namn", { exact: true }).fill("Provkok");
    await page.getByLabel("Minuter", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Starta timer", exact: true }).click();
    await page.getByRole("button", { name: "Pausa Provkok", exact: true }).click();
    const paused = await page.getByRole("timer", { name: "Provkok", exact: true }).innerText();
    await page.waitForTimeout(1100);
    assert.equal(
      await page.getByRole("timer", { name: "Provkok", exact: true }).innerText(),
      paused,
    );
    await page.getByRole("button", { name: "Fortsätt Provkok", exact: true }).click();
    await layout("cook");
    await page.getByRole("button", { name: "En fråga mitt i matlagningen?", exact: true }).click();
    await page.getByRole("button", { name: "Vad kan jag byta ut?", exact: true }).click();
    await page
      .getByText("Bytet är ett förslag och ändrar inte ingredienslistan automatiskt.", {
        exact: false,
      })
      .waitFor();
    await layout("chat");
    await page.getByRole("button", { name: "Tillbaka från AI-kocken", exact: true }).click();
    await page.getByRole("timer", { name: "Provkok", exact: true }).waitFor();
    await page.getByRole("button", { name: "Receptet", exact: true }).click();
    await page.getByRole("button", { name: "Fortsätt laga", exact: true }).click();
    await page.getByRole("heading", { name: "Ge den gyllene kanter", exact: true }).waitFor();
    await page.getByRole("timer", { name: "Provkok", exact: true }).waitFor();
    const nav = page.getByRole("navigation", {
      name: width <= 700 ? "Mobilnavigation" : "Huvudnavigation",
      exact: true,
    });
    await nav.getByRole("button", { name: "Du", exact: true }).click();
    await page.getByRole("switch", { name: "Keto-läge", exact: true }).check();
    await layout("profile");
    await page
      .getByRole("button", { name: "Bekräfta: Lite extra citron till det gröna", exact: true })
      .click();
    assert.equal(await page.getByText("Bekräftat exempel", { exact: true }).count(), 2);
    await page
      .getByRole("button", { name: "Ändra: Lite extra citron till det gröna", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Ändra exempelminne", exact: true })
      .fill("Lite mer persilja");
    await page.getByRole("button", { name: "Spara ändring", exact: true }).click();
    await page.getByRole("heading", { name: "Lite mer persilja", exact: true }).waitFor();
    await page.getByRole("button", { name: "Glöm: Lite mer persilja", exact: true }).click();
    assert.equal(
      await page.getByRole("heading", { name: "Lite mer persilja", exact: true }).count(),
      0,
    );
    await nav.getByRole("button", { name: "Köket", exact: true }).click();
    await page.getByRole("textbox", { name: "Sök bland recepten", exact: true }).fill("saknas123");
    await page.getByRole("heading", { name: "Inga recept här ännu", exact: true }).waitFor();
    await page.getByRole("button", { name: "Visa alla", exact: true }).click();
    await layout("cookbook");
    await page.getByRole("tab", { name: "Kokboken", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "Mina råvaror", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.getByRole("button", { name: "Hitta något gott", exact: true }).click();
    await page.getByRole("heading", { name: "Det här kan bli gott", exact: true }).waitFor();
    await layout("workbench");
    await nav.getByRole("button", { name: "Vin", exact: true }).click();
    await layout("wine");
    await page.getByRole("button", { name: "Välj ett exempelvin", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await nav.getByRole("button", { name: "Laga", exact: true }).click();
    await page.getByRole("button", { name: "Gå till steg 5", exact: true }).click();
    await page.getByRole("button", { name: "Klart för servering", exact: true }).click();
    await page.getByRole("button", { name: "4 av 5", exact: true }).click();
    await page.getByLabel("Till nästa gång", { exact: true }).fill("Lite mer citron.");
    await page.getByRole("button", { name: "Avsluta provlagningen", exact: true }).click();
    await page.getByRole("status").waitFor();
    await page.reload();
    assert.equal(
      await page.locator(".cp-resume").count(),
      0,
      "Demo state must not persist across reload",
    );
    assert.equal(external.length, 0, `Unexpected external requests: ${external}`);
    assert.deepEqual(errors, [], `Browser errors in ${label}`);
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    { screens: results.length, viewports: 4, errors: 0, externalRequests: 0, screenshots: output },
    null,
    2,
  ),
);
