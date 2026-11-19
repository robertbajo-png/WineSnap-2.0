import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";

// Manual installed-app acceptance: normal fixture Auth/RLS reads, mocked AI only.
export async function acceptOwnedChatStates({ page, context, fixture, phase, pass, capture }) {
  validateBrowserFixture(fixture);
  assert.equal(new URL(page.url()).origin, ownedApp);
  const result = { completed: false, simulatedAiRequests: 0, fixtureErrors: 0 };
  const endpoint = ownedApp + "/api/ai/ask-winesnap";
  let arrive, release, finished, timer;
  const arrived = new Promise((resolve) => {
    arrive = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const handler = async (route) => {
    try {
      const request = route.request();
      assert.equal(request.method(), "POST");
      const body = request.postDataJSON();
      assert.equal(body.conversationId, null);
      assert.equal(
        typeof body.message === "string" && body.message.startsWith("Synthetic chat "),
        true,
      );
      result.simulatedAiRequests++;
      assert.ok(result.simulatedAiRequests <= 2);
      if (result.simulatedAiRequests === 1) {
        arrive();
        await held;
      }
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversationId: randomUUID(),
            message: {
              id: randomUUID(),
              role: "assistant",
              content: "Synthetic chat answer: " + body.message,
              created_at: "2026-11-13T12:00:00Z",
            },
          }),
        });
      } catch {
        assert.equal(Boolean(request.failure()), true);
      }
    } catch {
      result.fixtureErrors++;
      await route.abort().catch(() => {});
    } finally {
      if (result.simulatedAiRequests === 1) finished();
    }
  };
  try {
    await context.route(endpoint, handler);
    phase("chat_installed_reads");
    await page.goto(ownedApp + "/ask", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Konversationer", exact: true }).click();
    await page.getByText("Inga tidigare konversationer \u00e4nnu.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    pass("chat_installed_private_history_read");
    phase("chat_installed_late_answer");
    const input = page.locator("#ask-input"),
      send = page.getByRole("button", { name: "Skicka", exact: true });
    await input.fill("Synthetic chat old question");
    await send.click();
    await Promise.race([
      arrived,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Synthetic chat request missing")), 15000);
      }),
    ]);
    clearTimeout(timer);
    await page.getByRole("button", { name: "Ny konversation", exact: true }).click();
    await input.fill("Synthetic chat current question");
    release();
    await done;
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(
      await page
        .getByText("Synthetic chat answer: Synthetic chat old question", { exact: true })
        .count(),
      0,
    );
    assert.equal(await input.inputValue(), "Synthetic chat current question");
    assert.equal(await input.isDisabled(), false);
    assert.equal(result.simulatedAiRequests, 1);
    pass("chat_installed_new_discards_late_answer");
    await send.click();
    await page
      .getByText("Synthetic chat answer: Synthetic chat current question", { exact: true })
      .waitFor();
    assert.equal(result.simulatedAiRequests, 2);
    assert.equal(result.fixtureErrors, 0);
    await capture("chat", 390);
    pass("chat_installed_current_answer");
    result.completed = true;
    return result;
  } finally {
    clearTimeout(timer);
    release();
    await context.unroute(endpoint, handler);
  }
}
