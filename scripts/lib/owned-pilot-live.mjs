import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";
import { verifyOwnedScanFixture } from "./owned-scan-fixture.mjs";

// Explicit manual opt-in: exactly one approved-image analysis and one Chef generation.
export async function acceptOwnedLiveJourneys({ page, fixture, phase, pass }) {
  validateBrowserFixture(fixture);
  const imagePath = join(process.env.USERPROFILE, "OneDrive/Desktop/Winesnap/54456874_400.webp");
  const original = await readFile(imagePath);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const count = { scan: 0, chef: 0 };
  let expected = "scan";
  const gate = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(url.origin, ownedApp);
    assert.equal(request.method(), "POST");
    const token = request.headers().authorization?.replace(/^Bearer /, "");
    assert.equal(JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub, fixture.userId);
    const body = request.postDataJSON();
    if (url.pathname === "/api/ai/analyze-wine") {
      assert.equal(expected, "scan");
      assert.equal(++count.scan, 1);
      assert.equal(digest(Buffer.from(body.imageBase64, "base64")), digest(original));
    } else {
      assert.equal(expected, "chef");
      assert.equal(body.action, "generate");
      assert.equal(++count.chef, 1);
    }
    return route.continue();
  };
  const scanPattern = "**/api/ai/analyze-wine",
    chefPattern = "**/api/chef";
  await page.route(scanPattern, gate);
  await page.route(chefPattern, gate);
  try {
    phase("live_original_scan_review_save");
    await page.goto(ownedApp + "/scan", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"]').setInputFiles(imagePath);
    const scanResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/ai/analyze-wine",
      { timeout: 90000 },
    );
    await page.getByRole("button", { name: "Anv\u00e4nd hela bilden", exact: true }).click();
    const scan = await scanResponse;
    assert.equal(scan.status(), 200);
    const scanBody = await scan.json();
    const identity = verifyOwnedScanFixture(scanBody.wine);
    await page.getByRole("button", { name: "Spara i k\u00e4llaren", exact: true }).click();
    await page.getByText("Sparat i din k\u00e4llare", { exact: true }).waitFor();
    const imageResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/wine-image",
    );
    await page.getByRole("button", { name: "Visa detaljer", exact: true }).click();
    const downloaded = await imageResponse;
    assert.equal(downloaded.status(), 200);
    assert.equal(digest(await downloaded.body()), digest(original));
    await page.locator("img").first().waitFor();
    await page.waitForFunction(() =>
      [...document.images].some((i) => i.naturalWidth > 100 && i.complete),
    );
    pass("live_original_identity_review_save_and_identical_private_image");

    phase("live_chef_review_save");
    expected = "chef";
    await page.goto(ownedApp + "/kitchen#chef", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Skapa recept", exact: true }).click();
    await page
      .getByRole("textbox", {
        name: "Vad ska receptet inneh\u00e5lla eller \u00e4ndra?",
        exact: true,
      })
      .fill(
        "En vegetarisk tomatsoppa f\u00f6r tv\u00e5 vuxna med tomat, l\u00f6k och kokta vita b\u00f6nor, klar p\u00e5 ungef\u00e4r 30 minuter.",
      );
    const chefResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/chef", {
      timeout: 90000,
    });
    await page.getByRole("button", { name: "Ta fram f\u00f6rslag", exact: true }).click();
    const chef = await chefResponse;
    assert.equal(chef.status(), 200);
    const answer = await chef.json();
    assert.ok(answer.draft?.title);
    await page.getByRole("button", { name: "Granska recept", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "Receptnamn", exact: true }).inputValue(),
      answer.draft.title,
    );
    await page.getByRole("button", { name: "Spara recept", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.locator(".k-detail h1").filter({ hasText: answer.draft.title }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".k-detail h1").filter({ hasText: answer.draft.title }).waitFor();
    pass("live_chef_draft_explicit_review_save_and_reload");
    assert.deepEqual(count, { scan: 1, chef: 1 });
    return {
      completed: true,
      liveProviderScenarios: 2,
      identity,
      imageBytesMatched: true,
      recipePersisted: true,
    };
  } finally {
    expected = "closed";
    await page.unroute(scanPattern, gate);
    await page.unroute(chefPattern, gate);
  }
}

export async function cachedKitchenOwnerPresent(page, owner) {
  return page.evaluate(async (id) => {
    if (!(await indexedDB.databases()).some((db) => db.name === "winesnap-kitchen-v1"))
      return false;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("winesnap-kitchen-v1");
      request.onerror = () => reject(new Error("demo_cache_read_failed"));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("accounts")) {
          db.close();
          resolve(false);
          return;
        }
        const read = db.transaction("accounts").objectStore("accounts").get(id);
        read.onerror = () => {
          db.close();
          reject(new Error("demo_cache_read_failed"));
        };
        read.onsuccess = () => {
          db.close();
          resolve(read.result !== undefined);
        };
      };
    });
  }, owner);
}

export async function exerciseMemoryControls(page, phase, pass) {
  phase("memory_correct_forget");
  await page.goto(ownedApp + "/kitchen#memory", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Korrigera basilika", exact: true }).click();
  await page.getByRole("combobox", { name: "Inst\u00e4llning", exact: true }).selectOption("-1");
  await page.getByRole("button", { name: "Spara r\u00e4ttning", exact: true }).click();
  await page.getByRole("heading", { name: "Undviker basilika", exact: true }).waitFor();
  await page.getByRole("button", { name: "Gl\u00f6m basilika", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Gl\u00f6m", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true }).waitFor();
  pass("memory_correction_and_forgetting_in_ui");
  await page.getByRole("textbox", { name: "Matpreferens", exact: true }).fill("dragonfrukt");
  await page.getByRole("button", { name: "L\u00e4gg till", exact: true }).click();
  await page.getByRole("heading", { name: "Gillar dragonfrukt", exact: true }).waitFor();
}
