import assert from "node:assert/strict";
import { ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";
import {
  ownedMemoryLabels as labels,
  traceOwnedMemoryReads,
  withOwnedMemoryProbe,
} from "./owned-memory-probe.mjs";

const memoryUrl = ownedApp + "/kitchen#memory";
const input = (page) => page.getByLabel("Matpreferens", { exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, value) =>
  page.getByRole("heading", { name: "Gillar " + value, exact: true });
async function read(page) {
  const retry = button(page, "H\u00e4mta igen");
  await retry.focus();
  await page.keyboard.press("Enter");
}
async function finishUnknown(page, writes, probe) {
  await page.getByText("Aktuella uppgifter \u00e4r inl\u00e4sta.", { exact: false }).waitFor();
  assert.equal(await button(page, "Nollst\u00e4ll matminne").isDisabled(), true);
  assert.equal(probe.snapshot().clientWrites, writes);
  await button(page, "Avsluta f\u00f6rs\u00f6ket").focus();
  await page.keyboard.press("Enter");
  await page.getByText("F\u00f6rs\u00f6ket \u00e4r avslutat.", { exact: false }).waitFor();
  assert.equal(probe.snapshot().clientWrites, writes);
  assert.equal(await page.getByRole("dialog").count(), 0);
}

// Prepared acceptance, not run during ordinary development or over an owner's open viewer.
export async function acceptOwnedMemoryStates({ page, context, fixture, phase, capture, pass }) {
  validateBrowserFixture(fixture);
  assert.equal(new URL(page.url()).origin, ownedApp);
  return withOwnedMemoryProbe({ context, fixture }, async (probe) => {
    phase("memory_installed_saved_read_failure");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(memoryUrl, { waitUntil: "domcontentloaded" });
    await input(page).waitFor();
    await page.getByRole("combobox", { name: "Inst\u00e4llning", exact: true }).selectOption("1");
    await input(page).fill(labels.saved);
    probe.arm("add-read-error");
    await button(page, "L\u00e4gg till").evaluate((node) => {
      node.form.requestSubmit();
      node.form.requestSubmit();
    });
    await page
      .getByText("Matminnet \u00e4r uppdaterat. Uppgifterna kunde inte l\u00e4sas om.", {
        exact: false,
      })
      .waitFor();
    assert.equal(probe.snapshot().clientWrites, 1);
    await capture("memory-installed-saved-read-error", 390);
    probe.fault("food_signals", false);
    await read(page);
    await heading(page, labels.saved).waitFor();
    assert.equal(probe.snapshot().clientWrites, 1);
    pass("memory_installed_saved_read_retry_never_repeats_write");

    phase("memory_installed_real_correction_conflict");
    await button(page, "Korrigera " + labels.saved).click();
    await input(page).fill(labels.draft);
    probe.arm("correct-conflict");
    await button(page, "Spara r\u00e4ttning").click();
    await page.getByText("Underlaget har \u00e4ndrats", { exact: false }).waitFor();
    await probe.inspectServerCorrection();
    await read(page);
    await heading(page, labels.server).waitFor();
    await page.getByText("Preferensen har \u00e4ndrats.", { exact: false }).waitFor();
    assert.equal(await input(page).inputValue(), labels.draft);
    assert.equal(await button(page, "Spara r\u00e4ttning").isDisabled(), true);
    assert.equal(probe.snapshot().clientWrites, 2);
    await capture("memory-installed-conflict-draft", 390);
    await button(page, "Avbryt").click();
    pass("memory_installed_real_conflict_keeps_original_revision_and_draft");

    phase("memory_installed_forget_lost_reply");
    await button(page, "Gl\u00f6m " + labels.server).click();
    probe.arm("forget-lost");
    await page.getByRole("dialog").getByRole("button", { name: "Gl\u00f6m", exact: true }).click();
    await page.getByText("Svaret saknas.", { exact: false }).waitFor();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    probe.fault("food_signals", true);
    await read(page);
    await probe.waitReadFault();
    await page
      .locator('.chef-panel .operation-notice[aria-busy="true"]')
      .waitFor({ state: "hidden" });
    assert.equal(await button(page, "Avsluta f\u00f6rs\u00f6ket").isDisabled(), true);
    probe.fault("food_signals", false);
    await read(page);
    await finishUnknown(page, 3, probe);
    assert.equal(await heading(page, labels.server).count(), 0);
    pass("memory_installed_lost_forget_requires_read_and_nonwriting_completion");

    phase("memory_installed_reset_lost_reply");
    await button(page, "Nollst\u00e4ll matminne").click();
    probe.arm("reset-lost");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Nollst\u00e4ll", exact: true })
      .click();
    await page.getByText("Svaret saknas.", { exact: false }).waitFor();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await read(page);
    await finishUnknown(page, 4, probe);
    await page
      .getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true })
      .waitFor();
    pass("memory_installed_lost_reset_never_reopens_confirmation_or_replays");

    phase("memory_installed_late_reply_after_view_change");
    await input(page).fill(labels.late);
    probe.arm("add-late");
    const root = await page.locator("html").elementHandle();
    assert.ok(root);
    try {
      await button(page, "L\u00e4gg till").click();
      await probe.waitHeld();
      await page.goto(ownedApp + "/kitchen#chef");
      await button(page, "Skapa recept").waitFor();
      assert.equal(await root.evaluate((node) => node.isConnected), true);
      probe.release();
      await probe.waitReleased();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.equal(
        await page.getByText("Matminnet \u00e4r uppdaterat.", { exact: true }).count(),
        0,
      );
      await page.goto(memoryUrl);
      await heading(page, labels.late).waitFor();
      assert.equal(
        await page.getByText("Matminnet \u00e4r uppdaterat.", { exact: true }).count(),
        0,
      );
    } finally {
      await root.dispose();
    }
    pass("memory_installed_late_reply_cannot_update_another_view");
    const result = probe.snapshot();
    assert.equal(result.clientWrites, 5);
    assert.equal(result.rpcRequests, 6);
    assert.equal(result.commits, 5);
    assert.equal(result.injectedEdits, 1);
    assert.equal(result.inspectionReads, 1);
    assert.equal(result.releasedReplies, 1);
    assert.equal(result.fixtureErrors, 0);
    assert.equal(result.unexpectedAi, 0);
    return { completed: true, liveProvider: false, ...result };
  });
}

export async function acceptOwnedMemoryAccountStates({
  context,
  fixture,
  peerFixture,
  switchAccount,
  phase,
  pass,
  captureFailure = async () => {},
  diagnostics = {},
}) {
  validateBrowserFixture(fixture);
  validateBrowserFixture(peerFixture);
  assert.notEqual(fixture.userId, peerFixture.userId);
  assert.notEqual(fixture.run, peerFixture.run);
  assert.equal(typeof switchAccount, "function");
  assert.equal(typeof captureFailure, "function");
  let page,
    root,
    trace,
    cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    let failed = false;
    trace?.close();
    try {
      await root?.dispose();
    } catch {
      failed = true;
    }
    if (page) {
      try {
        await page.close({ runBeforeUnload: false });
        assert.equal(page.isClosed(), true);
      } catch {
        failed = true;
      }
    }
    if (failed) throw Error("owned_memory_account_cleanup_failed");
  }
  try {
    return await withOwnedMemoryProbe({ context, fixture }, async (probe) => {
      try {
        phase("memory_installed_account_open_view");
        page = await context.newPage();
        trace = traceOwnedMemoryReads(page);
        await page.goto(memoryUrl, { waitUntil: "domcontentloaded" });
        phase("memory_installed_account_wait_for_input");
        await input(page).waitFor();
        await input(page).fill(labels.late);
        probe.arm("add-late");
        root = await page.locator("html").elementHandle();
        assert.ok(root);
        phase("memory_installed_account_submit");
        await button(page, "L\u00e4gg till").click();
        phase("memory_installed_account_wait_for_held_reply");
        await probe.waitHeld();
        probe.beginAccountSwitch(peerFixture, page);
        trace.beginSwitch();
        await switchAccount();
        phase("memory_installed_verified_peer_before_late_reply");
        const empty = page.getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", {
          exact: true,
        });
        const withheld = page.getByText(
          "K\u00f6ket \u00e4ndrades i en annan flik. H\u00e4mta uppdateringen innan du forts\u00e4tter.",
          { exact: true },
        );
        await empty.or(withheld).first().waitFor();
        const withheldPeerView = await withheld.isVisible();
        if (withheldPeerView) {
          assert.equal(await page.locator(".chef-panel").count(), 0);
          await button(page, "H\u00e4mta igen").waitFor();
        } else assert.ok(probe.snapshot().peerMemoryReads > 0);
        assert.equal(await root.evaluate((node) => node.isConnected), true);
        assert.equal(new URL(page.url()).href, memoryUrl);
        probe.completeAccountSwitch();
        probe.release();
        await probe.waitReleased();
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(await root.evaluate((node) => node.isConnected), true);
        assert.equal(await heading(page, labels.late).count(), 0);
        assert.equal(
          await page.getByText("Matminnet \u00e4r uppdaterat.", { exact: true }).count(),
          0,
        );
        assert.equal(await page.getByText("Svaret saknas.", { exact: false }).count(), 0);
        assert.equal(await button(page, "Avsluta f\u00f6rs\u00f6ket").count(), 0);
        if (!withheldPeerView) assert.equal(await input(page).inputValue(), "");
        await probe.assertForeignReads();
        const result = probe.snapshot();
        for (const key of [
          "clientWrites",
          "rpcRequests",
          "commits",
          "accountSwitches",
          "releasedReplies",
        ])
          assert.equal(result[key], 1);
        for (const key of [
          "fixtureErrors",
          "blockedSwitchWrites",
          "blockedStaleReads",
          "unexpectedAi",
        ])
          assert.equal(result[key], 0);
        pass("memory_installed_late_reply_cannot_cross_accounts");
        return {
          completed: true,
          liveProvider: false,
          withheldPeerView,
          privateTablesDenied: 3,
          ...result,
        };
      } catch (error) {
        if (page && new URL(page.url()).href === memoryUrl)
          await captureFailure(page).catch(() => {});
        throw error;
      } finally {
        if (trace) diagnostics.reads = trace.snapshot();
        diagnostics.guard = probe.snapshot();
        // Close the extra fixture document before removing its request guards.
        await cleanup();
      }
    });
  } finally {
    await cleanup();
  }
}
