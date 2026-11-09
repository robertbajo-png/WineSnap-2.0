import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";
import { cachedKitchenOwnerPresent } from "./owned-pilot-live.mjs";
import { demoAnswer, demoWineName } from "./owned-demo-policy.mjs";
import { ownedDemoRecipe } from "./owned-demo-data.mjs";

// Automated rehearsal of the demo, not human usability evidence or live AI.
export async function acceptOwnedDemo({ page, fixture, imagePath, original, report, progress }) {
  validateBrowserFixture(fixture);
  assert.equal(typeof progress, "function");
  assert.equal(report.humanSessions, 0);
  await progress("scan_choose_image");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ownedApp + "/scan");
  await page.waitForFunction(() =>
    Object.keys(document.querySelector('input[type="file"]') ?? {}).some((k) =>
      k.startsWith("__reactProps"),
    ),
  );
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await page.getByRole("button", { name: "Anv\u00e4nd hela bilden", exact: true }).click();
  await progress("scan_review");
  await page.getByRole("button", { name: "Spara i k\u00e4llaren", exact: true }).click();
  await progress("scan_save");
  await page.getByText("Sparat i din k\u00e4llare", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Visa detaljer", exact: true }).click();
  await progress("scan_detail");
  await page.getByRole("heading", { name: demoWineName, exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.images].some(
      (i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 100,
    ),
  );
  const digest = await page.evaluate(async () => {
    const image = [...document.images].find(
      (i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 100,
    );
    const bytes = await (await fetch(image.src)).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
  assert.equal(digest, createHash("sha256").update(original).digest("hex"));
  report.passed.push("example_scan_review_save_and_identical_private_image");

  await progress("chef");
  await page.goto(ownedApp + "/kitchen#chef");
  await page.getByRole("button", { name: "Skapa recept", exact: true }).click();
  await page
    .getByRole("textbox", {
      name: "Vad ska receptet inneh\u00e5lla eller \u00e4ndra?",
      exact: true,
    })
    .fill("Ett exempelrecept med blomk\u00e5l och vita b\u00f6nor.");
  await page.getByRole("button", { name: "Ta fram f\u00f6rslag", exact: true }).click();
  await page.getByRole("button", { name: "Granska recept", exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Receptnamn", exact: true }).inputValue(),
    ownedDemoRecipe().title,
  );
  await page.getByRole("button", { name: "Spara recept", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.locator(".k-detail h1").filter({ hasText: ownedDemoRecipe().title }).waitFor();
  await page.reload();
  await page.locator(".k-detail h1").filter({ hasText: ownedDemoRecipe().title }).waitFor();
  report.passed.push("example_chef_review_save_and_reload");

  await progress("cook");
  await page.goto(ownedApp + "/kitchen#cook");
  await page.getByText("Steg 1 av 3", { exact: true }).waitFor();
  await page
    .locator(".k-current-step")
    .getByRole("button", { name: /^Starta / })
    .click();
  await page.getByRole("timer").waitFor();
  await page.reload();
  await page.getByRole("timer").waitFor();
  await page.getByRole("button", { name: "Vin till maten", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Visa vinf\u00f6rslag till vuxna fr\u00e5n min vink\u00e4llare",
      exact: true,
    })
    .check();
  await page.getByRole("link", { name: "Visa vinet", exact: true }).first().click();
  await page.getByRole("link", { name: "Forts\u00e4tt laga", exact: true }).click();
  await page.getByRole("timer").waitFor();
  report.passed.push("cook_timer_reload_and_wine_roundtrip");

  await progress("sommelier");
  await page.goto(ownedApp + "/ask");
  await page.locator("#ask-input").fill("Vilket exempelvin passar till citron och blomk\u00e5l?");
  await page.locator("#ask-input").press("Enter");
  await page.getByText(demoAnswer, { exact: true }).waitFor();
  report.passed.push("sommelier_shows_attributed_local_example");

  await progress("memory");
  await page.goto(ownedApp + "/kitchen#memory");
  await page.getByRole("textbox", { name: "Matpreferens", exact: true }).fill("citron");
  await page.getByRole("button", { name: "L\u00e4gg till", exact: true }).click();
  await page.getByRole("button", { name: "Korrigera citron", exact: true }).click();
  await page.getByRole("combobox", { name: "Inst\u00e4llning", exact: true }).selectOption("-1");
  await page.getByRole("button", { name: "Spara r\u00e4ttning", exact: true }).click();
  await page.getByRole("heading", { name: "Undviker citron", exact: true }).waitFor();
  await page.getByRole("button", { name: "Gl\u00f6m citron", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Gl\u00f6m", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true }).waitFor();
  await page.goto(ownedApp + "/me");
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await page.getByText(/Logga in f.r att forts.tta/).waitFor();
  assert.equal(await cachedKitchenOwnerPresent(page, fixture.userId), false);
  report.passed.push("memory_correct_forget_and_logout_erasure");
  report.completed = true;
  return report;
}
