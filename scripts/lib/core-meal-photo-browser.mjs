import assert from "node:assert/strict";
import { layout } from "./core-kitchen-browser.mjs";

const path = "/api/ai/analyze-meal-photo";
const proposals = {
  items: [
    { name: "Ris", confidence: "medium", portion: { minGrams: 80, maxGrams: 140 } },
    { name: "Gronkalsmix", confidence: "low", portion: null },
  ],
};

export function createCoreMealPhotoFixture({ base, fixtureOwner, syntheticUsers, report }) {
  let outcome = "failure";
  let held;
  const matches = (request) => {
    const url = new URL(request.url());
    return url.origin === base && url.pathname === path;
  };
  return {
    matches,
    preferSuccess: () => (outcome = "success"),
    holdNext() {
      assert.equal(held, undefined);
      const pending = Promise.withResolvers();
      const finished = Promise.withResolvers();
      held = { pending, finished };
      return {
        release: pending.resolve,
        async waitFinished() {
          let timer;
          try {
            await Promise.race([
              finished.promise,
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Held synthetic response did not settle")),
                  15_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        },
      };
    },
    async route(route) {
      const request = route.request();
      assert.ok(matches(request));
      assert.equal(request.method(), "POST");
      assert.equal(syntheticUsers.get(request.headers().authorization)?.id, fixtureOwner);
      assert.equal(request.headers()["content-type"], "application/octet-stream");
      assert.equal(request.headers()["x-meal-photo-width"], "1024");
      assert.equal(request.headers()["x-meal-photo-height"], "768");
      const pixels = request.postDataBuffer();
      assert.equal(pixels?.length, 1024 * 768 * 3);
      assert.deepEqual([...pixels.subarray(0, 3)], [52, 45, 40]);
      report.simulatedAiRequests++;

      function respond(status, value) {
        return route.fulfill({ status, json: value, headers: { "Cache-Control": "no-store" } });
      }
      if (held) {
        const { pending, finished } = held;
        held = undefined;
        try {
          await pending.promise;
          await respond(200, {
            items: [{ name: "Fordrojt testforslag", confidence: "low", portion: null }],
          });
        } catch {
          // A canceled browser request may no longer accept the held response.
        } finally {
          finished.resolve();
        }
        return;
      }
      return outcome === "failure"
        ? respond(502, { error: "meal_photo_provider" })
        : respond(200, proposals);
    },
  };
}

async function syntheticPhoto(page) {
  const uri = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 960;
    const pen = canvas.getContext("2d");
    pen.fillStyle = "#342d28";
    pen.fillRect(0, 0, canvas.width, canvas.height);
    for (const [x, y, radius, color] of [
      [640, 480, 408, "#eee6d5"],
      [640, 480, 336, "#f9f6e9"],
      [510, 460, 146, "#e3d5aa"],
      [745, 390, 86, "#748443"],
      [772, 515, 91, "#b58763"],
      [670, 628, 65, "#778548"],
    ]) {
      pen.beginPath();
      pen.fillStyle = color;
      pen.arc(x, y, radius, 0, 2 * Math.PI);
      pen.fill();
    }
    return canvas.toDataURL("image/png");
  });
  return {
    name: "synthetic-meal-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(uri.split(",")[1], "base64"),
  };
}

export async function acceptCoreMealPhoto({ page, context, base, artifacts, report, fixture }) {
  assert.equal(report.synthetic, true);
  assert.equal(report.authenticationSimulated, true);
  assert.equal(new URL(base).hostname, "127.0.0.1");
  report.phase = "meal-photo-kitchen-entry";
  await page.goto(base + "/kitchen", { waitUntil: "domcontentloaded" });
  const select = page.getByRole("combobox", { name: "Fler vyer i köket" });
  await select.selectOption("meal-photo");
  const panel = page.getByRole("region", { name: "Måltidsfoto" });
  const preview = panel.getByRole("img", { name: "Din valda måltidsbild" });
  const analyze = panel.getByRole("button", { name: "Analysera bild" });
  const file = await syntheticPhoto(page);
  const choose = () => panel.locator('input[type="file"]').setInputFiles(file);
  const cancelPhoto = () => panel.getByRole("button", { name: "Kasta bilden" }).click();
  await panel.getByRole("button", { name: "Välj bild" }).waitFor();
  assert.equal(await analyze.count(), 0);
  await choose();
  await preview.waitFor();
  assert.deepEqual(
    await preview.evaluate(async (image) => {
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }),
    [1024, 768],
  );
  await panel.getByRole("link", { name: "OpenAI:s datahantering" }).waitFor();
  assert.equal(report.simulatedAiRequests, 0);
  report.passed.push("meal-photo-preview-before-network");

  report.phase = "meal-photo-provider-failure";
  await analyze.click();
  await panel.getByRole("alert").filter({ hasText: "inget användbart svar" }).waitFor();
  await preview.waitFor();
  assert.equal(report.simulatedAiRequests, 1);
  fixture.preferSuccess();
  await analyze.click();
  await panel.getByRole("heading", { name: "Granska måltiden" }).waitFor();
  await panel.getByText(/80–140 g \(från bild\)/).waitFor();
  await panel.getByText(/Okänd mängd.*Osäker identifiering/).waitFor();
  assert.equal(report.simulatedAiRequests, 2);
  report.passed.push("meal-photo-provider-failure-explicit-retry");

  report.phase = "meal-photo-review";
  await layout(page, artifacts, report, "meal-photo-review");
  await page.setViewportSize({ width: 390, height: 844 });
  report.phase = "meal-photo-review-edit";
  await panel.getByRole("textbox", { name: "Livsmedel 1", exact: true }).fill("Matvete");
  assert.equal(await panel.getByText(/80–140 g/).count(), 0);
  const grams = panel.getByLabel("Egen mängd (g)").first();
  const confirm = panel.getByRole("button", { name: "Bekräfta underlaget" });
  await grams.fill("0");
  await confirm.click();
  await panel.getByRole("alert").filter({ hasText: "1–10 000 gram" }).waitFor();
  await grams.fill("160");
  await confirm.click();
  await panel.getByRole("heading", { name: "Granskat underlag" }).waitFor();
  await panel.getByText("160 g (angivet manuellt)").waitFor();
  await panel.getByText("Okänd mängd", { exact: true }).waitFor();
  await panel.getByText("Inget har sparats i måltidshistoriken.").waitFor();
  assert.equal(report.simulatedAiRequests, 2);
  assert.equal(report.mutations, 0);
  await cancelPhoto();
  await preview.waitFor({ state: "detached" });
  report.passed.push("meal-photo-review-edit-confirm-discard-without-save");

  report.phase = "meal-photo-cancel-late-result";
  await choose();
  await preview.waitFor();
  const held = fixture.holdNext();
  try {
    const sent = page.waitForRequest(fixture.matches);
    await analyze.click();
    await sent;
    await panel.getByRole("button", { name: "Avbryt", exact: true }).click();
  } finally {
    held.release();
  }
  await held.waitFinished();
  await analyze.waitFor();
  assert.equal(await panel.getByText("Fordrojt testforslag").count(), 0);
  assert.equal(await panel.getByRole("heading", { name: "Granska måltiden" }).count(), 0);
  assert.equal(report.simulatedAiRequests, 3);
  report.passed.push("meal-photo-abort-ignores-late-reply");

  report.phase = "meal-photo-offline";
  await context.setOffline(true);
  try {
    await panel.getByText("Offline. Bildanalys kräver anslutning.").waitFor();
    assert.equal(await analyze.isEnabled(), false);
    assert.equal(report.simulatedAiRequests, 3);
  } finally {
    await context.setOffline(false);
  }
  await panel.getByText("Offline. Bildanalys kräver anslutning.").waitFor({ state: "detached" });
  assert.equal(await analyze.isEnabled(), true);
  assert.equal(report.simulatedAiRequests, 3);
  await cancelPhoto();
  await preview.waitFor({ state: "detached" });
  report.passed.push("meal-photo-offline-no-automatic-analysis");

  report.phase = "meal-photo-leave-view";
  await choose();
  await preview.waitFor();
  const interrupted = fixture.holdNext();
  try {
    const sent = page.waitForRequest(fixture.matches);
    await analyze.click();
    await sent;
    await page.getByRole("button", { name: "Recept", exact: true }).click();
    await panel.waitFor({ state: "detached" });
  } finally {
    interrupted.release();
  }
  await interrupted.waitFinished();
  await select.selectOption("meal-photo");
  await panel.getByRole("button", { name: "Välj bild" }).waitFor();
  assert.equal(await preview.count(), 0);
  assert.equal(await panel.getByText("Fordrojt testforslag").count(), 0);
  assert.equal(report.simulatedAiRequests, 4);
  report.passed.push("meal-photo-view-exit-clears-draft-and-late-result");
}
