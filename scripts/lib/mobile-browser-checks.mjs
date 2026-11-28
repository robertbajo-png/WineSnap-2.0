import assert from "node:assert/strict";
import { mobileControlIssues } from "./mobile-control-layout.mjs";

export const mobileBrowserSteps = [
  "mobile navigation, larger text and the keyboard skip link remain usable",
  "denied camera permission keeps text and gallery alternatives available",
  "permission retry starts a moving synthetic inline camera without audio",
  "capturing opens a local crop matching the preview and stops the camera",
  "retake restarts the camera and switching to text stops it again",
  "text input and identify remain reachable in a short enlarged mobile viewport",
  "gallery selection opens a local crop without submitting it to AI",
  "closing the camera releases its track with no new private cache or network errors",
];

export async function runMobileBrowserChecks({
  page,
  appUrl,
  assetPath,
  check,
  report,
  screenshot,
  layout,
  finalAudit,
}) {
  report.mobile = { layouts: [], syntheticCameraOnly: true };
  const context = page.context();
  const button = (name) => page.getByRole("button", { name, exact: true });
  const nav = () => page.getByRole("navigation", { name: "WineSnap", exact: true });
  const shutter = () => button("Ta foto");
  async function denyCamera() {
    await context.clearPermissions();
    await context.grantPermissions([], { origin: appUrl });
  }
  async function controls(stage, items) {
    const rectangles = [];
    for (const [name, locator] of items)
      rectangles.push({ name, box: await locator.boundingBox() });
    const viewport = page.viewportSize();
    const issues = mobileControlIssues(viewport, rectangles);
    report.mobile.layouts.push({ stage, viewport, issues });
    assert.deepEqual(issues, []);
  }
  async function ready() {
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video?.readyState >= 2 && video.videoWidth > 0 && video.srcObject?.active;
    });
    await page.waitForFunction(() => {
      const shutter = document.querySelector('button[aria-label="Ta foto"]');
      return shutter && !shutter.disabled;
    });
    assert.equal(await shutter().isEnabled(), true);
  }
  async function rememberTrack() {
    await page.evaluate(() => {
      const video = document.querySelector("video");
      window.__wineSnapMobileTrack = video.srcObject.getVideoTracks()[0];
      window.__wineSnapMobileRatio = video.clientWidth / video.clientHeight;
    });
  }
  const stopped = () =>
    page.waitForFunction(() => window.__wineSnapMobileTrack?.readyState === "ended");
  async function cropped() {
    await page.getByText("Justera etikett", { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('img[src^="blob:"]');
      return image?.complete && image.naturalWidth > 0;
    });
  }

  await check(0, async () => {
    await page.goto(`${appUrl}/cellar`);
    await page.getByRole("heading", { name: "Min k\u00e4llare", exact: true }).waitFor();
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => (document.documentElement.style.fontSize = "125%"));
      await layout(page);
      await controls("navigation-enlarged", [
        ["home", nav().getByRole("link", { name: "Hem", exact: true })],
        ["ask", nav().getByRole("link", { name: "Fr\u00e5ga", exact: true })],
        ["scan", nav().getByRole("link", { name: "Skanna", exact: true })],
        ["cellar", nav().getByRole("link", { name: "K\u00e4llare", exact: true })],
        ["profile", nav().getByRole("link", { name: "Profil", exact: true })],
      ]);
      const scanBox = await nav().getByRole("link", { name: "Skanna", exact: true }).boundingBox();
      assert.ok(Math.abs(scanBox.width - scanBox.height) < 1);
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
    await page.reload();
    await page.getByRole("heading", { name: "Min k\u00e4llare", exact: true }).waitFor();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByRole("link", { name: "Hoppa till inneh\u00e5llet", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "winesnap-content");
  });
  await check(1, async () => {
    await denyCamera();
    const scan = nav().getByRole("link", { name: "Skanna", exact: true });
    for (let i = 0; i < 40 && !(await scan.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press("Tab");
    assert.equal(await scan.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press("Enter");
    await page.waitForURL(`${appUrl}/scan`);
    await page
      .getByText(
        "Kameratillst\u00e5nd saknas. Till\u00e5t kameran i webbl\u00e4saren eller v\u00e4lj en bild fr\u00e5n galleriet.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await shutter().isDisabled(), true);
    assert.equal(await button("V\u00e4lj en etikettbild").isEnabled(), true);
    assert.equal(await button("Skriv").isEnabled(), true);
    assert.equal(
      await page.evaluate(
        async () => (await navigator.permissions.query({ name: "camera" })).state,
      ),
      "denied",
    );
    await screenshot(page, "mobile-camera-denied");
  });
  await check(2, async () => {
    await context.grantPermissions(["camera"], { origin: appUrl });
    await button("F\u00f6rs\u00f6k igen").click();
    await ready();
    const frame = await page.evaluate(() => {
      const video = document.querySelector("video");
      const stream = video.srcObject;
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        audioTracks: stream.getAudioTracks().length,
        synthetic: stream.getVideoTracks().every((track) => track.label.startsWith("fake_device")),
        inline: video.playsInline,
        fit: getComputedStyle(video).objectFit,
      };
    });
    report.mobile.video = frame;
    assert.equal(frame.synthetic, true);
    assert.equal(frame.audioTracks, 0);
    assert.equal(frame.inline, true);
    assert.equal(frame.fit, "cover");
    const sample = () =>
      page.evaluate(() => {
        const video = document.querySelector("video");
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, 48, 48);
        const data = ctx.getImageData(0, 0, 48, 48).data;
        let min = 255,
          max = 0,
          sum = 0;
        for (let i = 0; i < data.length; i++)
          if (i % 4 !== 3) {
            min = Math.min(min, data[i]);
            max = Math.max(max, data[i]);
            sum += data[i] * (i + 1);
          }
        return { time: video.currentTime, variance: max - min, checksum: sum };
      });
    const first = await sample();
    await page.waitForFunction(
      (time) => document.querySelector("video").currentTime > time + 0.3,
      first.time,
    );
    const second = await sample();
    assert.ok(first.variance > 20);
    assert.notEqual(first.checksum, second.checksum);
    report.mobile.video.nonblank = true;
    report.mobile.video.moving = true;
    await controls("camera", [
      ["close", button("St\u00e4ng")],
      ["shutter", shutter()],
      ["gallery", button("V\u00e4lj en etikettbild")],
    ]);
    await screenshot(page, "mobile-camera-live");
  });
  await check(3, async () => {
    await rememberTrack();
    await shutter().click();
    await cropped();
    await stopped();
    const capture = await page.evaluate(() => {
      const image = document.querySelector('img[src^="blob:"]');
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        previewRatio: window.__wineSnapMobileRatio,
      };
    });
    assert.ok(Math.abs(capture.width / capture.height - capture.previewRatio) < 0.01);
    report.mobile.capture = capture;
    await layout(page);
    await screenshot(page, "mobile-camera-crop");
  });
  await check(4, async () => {
    await button("Ta om").last().click();
    await ready();
    await rememberTrack();
    await button("Skriv").click();
    await stopped();
    await page.getByLabel("Vinbeskrivning", { exact: true }).waitFor();
    assert.equal(await page.locator("video").count(), 0);
  });
  await check(5, async () => {
    await page.setViewportSize({ width: 390, height: 360 });
    await page.evaluate(() => (document.documentElement.style.fontSize = "125%"));
    const input = page.getByLabel("Vinbeskrivning", { exact: true });
    const identify = button("Identifiera vinet");
    assert.equal(await identify.isDisabled(), true);
    await input.fill("Synthetic image access test");
    assert.equal(await identify.isEnabled(), true);
    await input.focus();
    await page.keyboard.press("Tab");
    assert.equal(await identify.evaluate((el) => el === document.activeElement), true);
    await identify.scrollIntoViewIfNeeded();
    await controls("short-text-enlarged", [["identify", identify]]);
    await layout(page);
    await screenshot(page, "mobile-scan-text-short");
    await input.fill("");
    await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await check(6, async () => {
    await denyCamera();
    await button("Skanna").click();
    await button("F\u00f6rs\u00f6k igen").waitFor();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      button("V\u00e4lj en etikettbild").click(),
    ]);
    assert.equal(await chooser.element().getAttribute("capture"), null);
    await chooser.setFiles(assetPath);
    await cropped();
    assert.equal(await page.locator("video").count(), 0);
    await button("Ta om").last().click();
    await button("F\u00f6rs\u00f6k igen").waitFor();
  });
  await check(7, async () => {
    await context.grantPermissions(["camera"], { origin: appUrl });
    await button("F\u00f6rs\u00f6k igen").click();
    await ready();
    await rememberTrack();
    await button("St\u00e4ng").click();
    await page.waitForURL(appUrl + "/");
    await stopped();
    assert.equal(await page.locator("video").count(), 0);
    assert.equal(await page.locator('img[src^="blob:"]').count(), 0);
    await nav().waitFor();
    await finalAudit();
  });
}
