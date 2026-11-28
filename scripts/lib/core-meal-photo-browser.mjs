import assert from "node:assert/strict";
import { layout } from "./core-kitchen-browser.mjs";

const path = "/api/ai/analyze-meal-photo";
const photoPath = "/api/meal-photo";
const mealPath = "/rest/v1/kitchen_photo_meals";
const savePath = "/rest/v1/rpc/kitchen_save_photo_meal";
const proposals = {
  items: [
    { name: "Ris", confidence: "medium", portion: { minGrams: 80, maxGrams: 140 } },
    { name: "Gronkalsmix", confidence: "low", portion: null },
  ],
};

export function createCoreMealPhotoFixture({
  base,
  fixtureOrigin,
  fixtureOwner,
  syntheticUsers,
  report,
}) {
  let outcome = "failure";
  let held;
  let photoFixture;
  let loseSaveReply = true;
  let loseUploadReply = true;
  let failNextRemove = true;
  const rows = new Map();
  const files = new Set();
  const saveIds = [];
  const fileRequests = [];
  const analysis = (request) => {
    const url = new URL(request.url());
    return url.origin === base && url.pathname === path;
  };
  const matches = (request) => {
    const url = new URL(request.url());
    return (
      analysis(request) ||
      (url.origin === base && url.pathname === photoPath) ||
      (url.origin === fixtureOrigin &&
        [mealPath, savePath].includes(url.pathname) &&
        request.method() !== "OPTIONS")
    );
  };
  return {
    matches,
    analysis,
    rows,
    files,
    saveIds,
    fileRequests,
    seedPending(label, staged) {
      const id = crypto.randomUUID();
      rows.set(id, {
        id,
        user_id: fixtureOwner,
        created_at: "2026-11-28T12:30:00+00:00",
        items: [{ name: label, portion: null }],
        keep_photo: true,
        photo_state: "pending",
        photo_sha256: staged ? "a".repeat(64) : null,
      });
      if (staged) files.add(id);
    },
    setPhoto: (buffer) => (photoFixture = buffer),
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
      assert.equal(syntheticUsers.get(request.headers().authorization)?.id, fixtureOwner);
      const url = new URL(request.url());
      const method = request.method();
      function respond(status, value) {
        return route.fulfill({
          status,
          json: value,
          headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": base },
        });
      }
      if (url.pathname === mealPath) {
        assert.equal(method, "GET");
        assert.equal(url.searchParams.get("user_id"), `eq.${fixtureOwner}`);
        return respond(200, [...rows.values()].reverse());
      }
      if (url.pathname === savePath) {
        assert.equal(method, "POST");
        report.simulatedWrites++;
        const { _id, _items, _keep_photo } = request.postDataJSON();
        assert.match(_id, /^[0-9a-f-]{36}$/);
        assert.equal(typeof _keep_photo, "boolean");
        saveIds.push(_id);
        if (!rows.has(_id))
          rows.set(_id, {
            id: _id,
            user_id: fixtureOwner,
            created_at: "2026-11-28T12:00:00+00:00",
            items: _items,
            keep_photo: _keep_photo,
            photo_state: _keep_photo ? "pending" : "none",
            photo_sha256: null,
          });
        const record = rows.get(_id);
        assert.deepEqual(record.items, _items);
        assert.equal(record.keep_photo, _keep_photo);
        if (loseSaveReply) {
          loseSaveReply = false;
          return route.abort("failed");
        }
        return respond(200, record);
      }
      if (url.pathname === photoPath) {
        const id = url.searchParams.get("id");
        const record = rows.get(id);
        assert.ok(record?.keep_photo);
        fileRequests.push(method);
        if (method === "POST") {
          report.simulatedWrites++;
          assert.equal(request.headers()["content-type"], "application/octet-stream");
          assert.equal(request.postDataBuffer()?.length, 1024 * 768 * 3);
          files.add(id);
          record.photo_state = "ready";
          record.photo_sha256 = "a".repeat(64);
          if (loseUploadReply) {
            loseUploadReply = false;
            return respond(503, { error: "synthetic_upload_failure" });
          }
          return respond(200, { photoState: "ready" });
        }
        if (method === "GET") {
          assert.ok(files.has(id));
          return route.fulfill({ status: 200, contentType: "image/png", body: photoFixture });
        }
        if (method === "PATCH") {
          assert.equal(request.postDataBuffer(), null);
          if (record.photo_state === "pending" && files.has(id)) {
            report.simulatedWrites++;
            record.photo_state = "ready";
          }
          assert.ok(["pending", "ready"].includes(record.photo_state));
          return respond(200, { photoState: record.photo_state });
        }
        assert.equal(method, "DELETE");
        report.simulatedWrites++;
        record.photo_state = "removing";
        if (failNextRemove) {
          failNextRemove = false;
          return respond(503, { error: "synthetic_remove_failure" });
        }
        files.delete(id);
        record.photo_state = "removed";
        record.photo_sha256 = null;
        return route.fulfill({ status: 204 });
      }
      assert.equal(method, "POST");
      assert.equal(request.headers()["content-type"], "application/octet-stream");
      assert.equal(request.headers()["x-meal-photo-width"], "1024");
      assert.equal(request.headers()["x-meal-photo-height"], "768");
      const pixels = request.postDataBuffer();
      assert.equal(pixels?.length, 1024 * 768 * 3);
      assert.deepEqual([...pixels.subarray(0, 3)], [52, 45, 40]);
      report.simulatedAiRequests++;

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
  assert.equal(report.simulatedWrites, 0);
  await cancelPhoto();
  await preview.waitFor({ state: "detached" });
  report.passed.push("meal-photo-review-edit-confirm-discard-without-save");

  report.phase = "meal-photo-cancel-late-result";
  await choose();
  await preview.waitFor();
  const held = fixture.holdNext();
  try {
    const sent = page.waitForRequest(fixture.analysis);
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
    const sent = page.waitForRequest(fixture.analysis);
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

  fixture.setPhoto(file.buffer);
  const history = panel.getByRole("region", { name: "Sparade fotomåltider" });
  const keep = panel.getByRole("checkbox", { name: "Behåll bilden privat med måltiden" });
  const save = panel.getByRole("button", { name: "Spara måltid" });

  report.phase = "meal-photo-save-without-image";
  await choose();
  await analyze.click();
  await panel.getByRole("textbox", { name: "Livsmedel 1", exact: true }).fill("Matvete");
  await grams.fill("160");
  await confirm.click();
  assert.equal(await keep.isChecked(), false);
  assert.equal(fixture.rows.size, 0);
  await context.setOffline(true);
  try {
    await panel.getByText("Offline. Sparande kräver anslutning.").waitFor();
    assert.equal(await save.isEnabled(), false);
  } finally {
    await context.setOffline(false);
  }
  await save.click();
  await panel.getByText(/Vi kunde inte bekräfta sparandet/).waitFor();
  await panel.getByRole("button", { name: "Kontrollera sparandet igen" }).click();
  await panel.getByText("Måltiden har sparats utan bild.").waitFor();
  await history.getByText("160 g (angivet manuellt)").waitFor();
  await history.getByText("Okänd mängd", { exact: true }).waitFor();
  assert.equal(fixture.rows.size, 1);
  assert.equal(fixture.saveIds[0], fixture.saveIds[1]);
  assert.deepEqual(fixture.fileRequests, []);
  report.passed.push("meal-photo-opt-out-confirmed-save-and-idempotent-retry");

  report.phase = "meal-photo-save-private-image";
  await choose();
  await analyze.click();
  await confirm.click();
  await keep.check();
  await layout(page, artifacts, report, "meal-photo-confirm");
  await page.setViewportSize({ width: 390, height: 844 });
  await save.click();
  await panel.getByText(/Måltiden är sparad, men vi kunde inte bekräfta/).waitFor();
  assert.equal(fixture.rows.size, 2);
  await panel.getByRole("button", { name: "Försök spara bilden igen" }).click();
  await panel.getByText("Måltiden och bilden har sparats privat.").waitFor();
  assert.equal(fixture.saveIds[2], fixture.saveIds[3]);
  assert.equal(fixture.files.size, 1);
  await history.getByRole("button", { name: "Visa bild" }).click();
  const savedImage = history.getByRole("img", { name: "Sparad måltidsbild" });
  await savedImage.waitFor();
  assert.match(await savedImage.getAttribute("src"), /^blob:/);
  assert.equal(await savedImage.evaluate(async (img) => (await img.decode(), img.complete)), true);
  report.passed.push("meal-photo-opt-in-attached-once-and-private-preview");

  report.phase = "meal-photo-remove-keep-log";
  await history.getByRole("button", { name: "Ta bort bild", exact: true }).click();
  assert.ok(await savedImage.isVisible());
  const remove = history.getByRole("button", { name: "Bekräfta borttagning" });
  await remove.click();
  await history.getByText("Borttagningen kunde inte bekräftas. Försök igen.").waitFor();
  await savedImage.waitFor({ state: "detached" });
  await remove.click();
  await history.getByText("Bilden är borttagen.").waitFor();
  assert.equal(fixture.rows.size, 2);
  assert.equal(fixture.files.size, 0);
  assert.deepEqual(fixture.fileRequests, ["POST", "POST", "GET", "DELETE", "DELETE"]);
  assert.equal(fixture.saveIds.length, 4);
  assert.equal(report.simulatedAiRequests, 6);
  assert.equal(report.simulatedWrites, 8);
  report.passed.push("meal-photo-remove-image-retry-preserves-meal");

  report.phase = "meal-photo-resume-after-leaving";
  const inactive = await fetch(base + photoPath + "?id=11111111-1111-4111-8111-111111111111", {
    method: "PATCH",
    redirect: "error",
  });
  assert.equal(inactive.status, 404);
  assert.deepEqual(await inactive.json(), { error: "meal_photo_not_found" });
  report.passed.push("meal-photo-built-resume-route-default-off");
  fixture.seedPending("Testmåltid med bevarad fil", true);
  fixture.seedPending("Testmåltid utan fil", false);
  fixture.seedPending("Testmåltid utan bildval kvar", false);
  await page.getByRole("button", { name: "Recept", exact: true }).click();
  await panel.waitFor({ state: "detached" });
  await select.selectOption("meal-photo");
  const row = (text) => history.locator(".meal-photo-history-entry").filter({ hasText: text });
  const preserved = row("Testmåltid med bevarad fil");
  const missing = row("Testmåltid utan fil");
  const discarded = row("Testmåltid utan bildval kvar");
  const resume = (entry) => entry.getByRole("button", { name: "Slutför bildsparandet" });
  await resume(preserved).click();
  await preserved.getByText("Bilden är sparad.").waitFor();
  assert.deepEqual(fixture.fileRequests.slice(5), ["PATCH"]);
  report.passed.push("meal-photo-resume-staged-bytes-without-reupload");

  await resume(missing).click();
  await missing.getByText(/Ingen färdig bild hittades/).waitFor();
  await missing.getByLabel("Välj samma måltidsbild").setInputFiles(file);
  await missing.getByText(/Vald bild:/).waitFor();
  await layout(page, artifacts, report, "meal-photo-resume");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(fixture.fileRequests.slice(5), ["PATCH", "PATCH"]);
  await missing.getByRole("button", { name: "Spara vald bild" }).click();
  await missing.getByText("Bilden är sparad.").waitFor();
  assert.deepEqual(fixture.fileRequests.slice(5), ["PATCH", "PATCH", "POST"]);
  report.passed.push("meal-photo-resume-missing-file-requires-explicit-upload");

  await discarded.getByRole("button", { name: "Behåll måltiden utan bild" }).click();
  await discarded.getByRole("button", { name: "Bekräfta borttagning" }).click();
  await discarded.getByText("Bilden är borttagen.").waitFor();
  assert.deepEqual(fixture.fileRequests.slice(5), ["PATCH", "PATCH", "POST", "DELETE"]);
  assert.equal(fixture.rows.size, 5);
  assert.equal(fixture.saveIds.length, 4);
  assert.equal(report.simulatedAiRequests, 6);
  report.passed.push("meal-photo-drop-interrupted-attachment-keeps-meal");
}
