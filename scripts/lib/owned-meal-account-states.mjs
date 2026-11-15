import assert from "node:assert/strict";
import { ownedApp } from "./owned-backend.mjs";
import { ownedMealSessionId, validateBrowserFixture } from "./owned-browser-fixture.mjs";
import { withOwnedMealProbe } from "./owned-meal-states.mjs";

// Only the existing private fixture wrapper supplies the normal UI sign-in callback.
export async function acceptOwnedMealAccountStates({
  page,
  context,
  fixture,
  peerFixture,
  switchAccount,
  phase,
  pass,
}) {
  validateBrowserFixture(fixture);
  validateBrowserFixture(peerFixture);
  assert.notEqual(peerFixture.userId, fixture.userId);
  assert.notEqual(peerFixture.run, fixture.run);
  assert.notEqual(peerFixture.email, fixture.email);
  assert.equal(new URL(page.url()).origin, ownedApp);
  assert.equal(typeof switchAccount, "function");
  assert.equal(typeof phase, "function");
  assert.equal(typeof pass, "function");
  const extraPages = [],
    roots = [];
  try {
    return await withOwnedMealProbe({ page, context, fixture }, async (probe) => {
      phase("meals_installed_hold_profile_and_meal_for_account_switch");
      await page.goto(ownedApp + "/kitchen#family", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Ny profil", exact: true }).click();
      await page
        .getByLabel("Namn eller smeknamn", { exact: true })
        .fill("Local QA account profile");
      const familyRoot = await page.locator("html").elementHandle();
      assert.ok(familyRoot);
      roots.push(familyRoot);
      probe.arm("profile-account-late");
      await page.getByRole("button", { name: "Spara profil", exact: true }).click();
      await probe.waitHeld();

      const mealPage = await context.newPage();
      extraPages.push(mealPage);
      await mealPage.goto(ownedApp + "/kitchen#meals", { waitUntil: "domcontentloaded" });
      await mealPage.getByText("Local QA server meal", { exact: true }).waitFor();
      await mealPage.getByRole("button", { name: "Redigera m\u00e5ltid", exact: true }).click();
      const editor = mealPage.locator(".meal-editor");
      assert.equal(await editor.locator("select").nth(0).inputValue(), ownedMealSessionId(fixture));
      assert.equal(await editor.locator("select").nth(1).inputValue(), fixture.wineId);
      await editor.locator("textarea").fill("Local QA account meal");
      const mealRoot = await mealPage.locator("html").elementHandle();
      assert.ok(mealRoot);
      roots.push(mealRoot);
      probe.arm("meal-account-late");
      await editor.getByRole("button", { name: "Spara m\u00e5ltid", exact: true }).click();
      await probe.waitHeld();
      assert.equal(probe.snapshot().committedWrites, 2);

      probe.beginAccountSwitch(peerFixture, [page, mealPage]);
      const controlPage = await context.newPage();
      extraPages.push(controlPage);
      phase("meals_installed_account_switch_with_replies_held");
      await switchAccount(controlPage);
      // BroadcastChannel/Auth changes, not navigation or injected session state,
      // must replace the two still-mounted kitchen documents with the peer UI.
      await page.getByText("Inga matprofiler \u00e4nnu.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Ny profil", exact: true }).waitFor();
      await mealPage
        .getByText("Inga kombinationer registrerade \u00e4nnu.", { exact: true })
        .waitFor();
      assert.equal(new URL(page.url()).pathname, "/kitchen");
      assert.equal(new URL(mealPage.url()).pathname, "/kitchen");
      for (const root of roots) assert.equal(await root.evaluate((node) => node.isConnected), true);
      probe.completeAccountSwitch();
      const inspections = probe.snapshot().inspectionReads;
      probe.release();
      await probe.waitReleased();
      for (const current of [page, mealPage]) {
        await current.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        for (const text of [
          "Local QA account profile",
          "Local QA account meal",
          "Local QA server meal",
          "Sparat.",
          "M\u00e5ltiden sparades.",
        ])
          assert.equal(await current.getByText(text, { exact: true }).count(), 0);
        assert.equal(await current.locator(".meal-editor").count(), 0);
        assert.equal(
          await current.getByRole("button", { name: "Kontrollera sparandet", exact: true }).count(),
          0,
        );
        assert.equal(
          await current
            .getByRole("button", { name: "H\u00e4mta aktuella uppgifter", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await current.getByRole("button", { name: "Spara profil", exact: true }).count(),
          0,
        );
        assert.equal(
          await current.getByRole("button", { name: "Spara m\u00e5ltid", exact: true }).count(),
          0,
        );
        for (const root of roots)
          assert.equal(await root.evaluate((node) => node.isConnected), true);
      }
      await probe.assertForeignReads(fixture);
      const result = probe.snapshot();
      assert.equal(result.inspectionReads, inspections);
      assert.equal(result.clientWriteRequests, 2);
      assert.equal(result.forwardedRpcRequests, 2);
      assert.equal(result.committedWrites, 2);
      assert.equal(result.accountSwitches, 1);
      assert.equal(result.releasedReplies, 2);
      assert.equal(result.blockedSwitchWrites, 0);
      assert.equal(result.blockedStaleReads, 0);
      assert.equal(result.fixtureErrors, 0);
      pass("meals_installed_late_profile_and_meal_replies_cannot_cross_accounts");
      return { completed: true, liveProvider: false, privateTablesDenied: 3, ...result };
    });
  } finally {
    let failed = false;
    for (const root of roots)
      await root.dispose().catch(() => {
        failed = true;
      });
    for (const extra of extraPages.reverse()) {
      try {
        await extra.close({ runBeforeUnload: false });
        assert.equal(extra.isClosed(), true);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("owned_meal_account_page_cleanup_failed");
  }
}
