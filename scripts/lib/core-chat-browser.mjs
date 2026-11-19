import assert from "node:assert/strict";
import { join } from "node:path";

const stamp = "2026-11-01T12:00:00Z";
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const deadline = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Synthetic chat arrival timed out")), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

// Synthetic data only. Never forward backend, AI or unknown app API requests.
export function createCoreChatFixture({ origin, key, owner, users, report, base }) {
  assert.equal(origin, "http://127.0.0.1:54323");
  assert.equal(key, "sb_publishable_runtime_check_not_a_real_key");
  const peer = [...users.values()].find((u) => u.id !== owner)?.id;
  assert.ok(peer);
  const conversations = [
    { id: id(1), user_id: owner, title: "Synthetic owner conversation A", last_message_at: stamp },
    { id: id(2), user_id: owner, title: "Synthetic owner conversation B", last_message_at: stamp },
    { id: id(3), user_id: peer, title: "Synthetic peer conversation", last_message_at: stamp },
  ];
  const messages = conversations.map((c, i) => ({
    id: id(10 + i),
    user_id: c.user_id,
    conversation_id: c.id,
    role: "assistant",
    content: "Synthetic private history " + (i + 1),
    created_at: stamp,
  }));
  const pending = new Map();
  const holds = new Set();
  const deleted = new Set();
  const ai = [],
    deletes = [];
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  async function respond(route, kind, data, apply = () => {}) {
    const hold = pending.get(kind);
    if (!hold) {
      apply();
      return json(route, data);
    }
    pending.delete(kind);
    hold.start();
    await hold.released;
    try {
      if (hold.status < 400) apply();
      await json(route, hold.data ?? data, hold.status);
    } catch (cause) {
      if (!route.request().failure()) throw cause;
    } finally {
      hold.finish();
      holds.delete(hold);
    }
  }
  return {
    owner,
    peer,
    conversations,
    messages,
    ai,
    deletes,
    reset() {
      deleted.clear();
    },
    hold(kind, { data, status = 200 } = {}) {
      assert.ok(!pending.has(kind));
      let start, release, finish;
      const arrived = new Promise((r) => {
        start = r;
      });
      const released = new Promise((r) => {
        release = r;
      });
      const done = new Promise((r) => {
        finish = r;
      });
      const h = {
        data,
        status,
        start: () => {
          h.started = true;
          start();
        },
        released,
        finish,
        release,
        done,
      };
      holds.add(h);
      pending.set(kind, h);
      return { arrived: () => deadline(arrived), release, done: () => deadline(done) };
    },
    async releaseAll() {
      const active = [...holds];
      for (const h of active) {
        h.release();
        if (!h.started) {
          h.finish();
          holds.delete(h);
        }
      }
      pending.clear();
      await deadline(Promise.all(active.map((h) => h.done)));
    },
    async route(route) {
      const request = route.request(),
        url = new URL(request.url()),
        method = request.method();
      const localAi =
        url.origin === base && url.pathname === "/api/ai/ask-winesnap" && method === "POST";
      if (
        url.origin === base &&
        ["GET", "HEAD"].includes(method) &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (url.origin !== origin && !localAi) {
        if (url.origin === base) report.mutations++;
        else report.externalRequests++;
        return route.abort();
      }
      if (method === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": base,
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
          },
        });
      if (!localAi) assert.equal(request.headers().apikey, key);
      const user = users.get(request.headers().authorization);
      assert.ok(user);
      if (method === "GET" && url.pathname === "/auth/v1/user") return json(route, user);
      if (method === "POST" && url.pathname === "/rest/v1/rpc/kitchen_access")
        return json(route, false);
      if (localAi) {
        const body = request.postDataJSON();
        assert.equal(typeof body.message, "string");
        assert.ok(body.message.startsWith("Synthetic "));
        assert.ok(
          !body.conversationId ||
            conversations.some(
              (c) => c.id === body.conversationId && c.user_id === user.id && !deleted.has(c.id),
            ),
        );
        assert.ok(ai.length < 20);
        ai.push({ owner: user.id, conversationId: body.conversationId, message: body.message });
        report.simulatedAiRequests++;
        const conversationId = body.conversationId ?? id(100 + ai.length);
        const answer = {
          conversationId,
          message: {
            id: id(200 + ai.length),
            role: "assistant",
            content: "Synthetic answer: " + body.message,
            created_at: stamp,
          },
        };
        return respond(route, "ai", answer, () => {
          if (!body.conversationId)
            conversations.push({
              id: conversationId,
              user_id: user.id,
              title: "Synthetic saved conversation " + conversationId,
              last_message_at: stamp,
            });
        });
      }
      if (method === "GET" && url.pathname === "/rest/v1/ai_conversations") {
        assert.equal(url.searchParams.get("user_id"), "eq." + user.id);
        report.simulatedReadRequests = (report.simulatedReadRequests ?? 0) + 1;
        return respond(
          route,
          "history:" + user.id,
          conversations.filter((c) => c.user_id === user.id && !deleted.has(c.id)),
        );
      }
      if (method === "GET" && url.pathname === "/rest/v1/ai_messages") {
        const conversationId = url.searchParams.get("conversation_id")?.slice(3);
        assert.ok(conversations.some((c) => c.id === conversationId && c.user_id === user.id));
        if (url.searchParams.has("user_id"))
          assert.equal(url.searchParams.get("user_id"), "eq." + user.id);
        return respond(
          route,
          "messages:" + conversationId,
          messages.filter((m) => m.conversation_id === conversationId),
        );
      }
      if (method === "DELETE" && url.pathname === "/rest/v1/ai_conversations") {
        const conversationId = url.searchParams.get("id")?.slice(3);
        assert.equal(url.searchParams.get("user_id"), "eq." + user.id);
        assert.ok(conversations.some((c) => c.id === conversationId && c.user_id === user.id));
        deletes.push({ owner: user.id, id: conversationId });
        report.simulatedWrites++;
        return respond(route, "delete", null, () => deleted.add(conversationId));
      }
      if (method === "GET" && ["/rest/v1/profiles", "/rest/v1/wines"].includes(url.pathname))
        return json(route, []);
      report.mutations++;
      return route.abort();
    },
  };
}

export async function acceptCoreChat({
  page,
  base,
  artifacts,
  report,
  fixture,
  authKey,
  ownerSession,
  peerSession,
}) {
  const historyButton = () => page.getByRole("button", { name: "Conversations", exact: true });
  const newButton = () => page.getByRole("button", { name: "New conversation", exact: true });
  const sendButton = () => page.getByRole("button", { name: "Send", exact: true });
  const input = () => page.locator("#ask-input");
  const title = (i) => page.getByText(fixture.conversations[i].title, { exact: true });
  const absent = async (text) =>
    assert.equal(await page.getByText(text, { exact: true }).count(), 0);
  const settle = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const session = async (value) => {
    await page.evaluate(
      ({ key, value }) => {
        if (value) localStorage.setItem(key, JSON.stringify(value));
        else localStorage.removeItem(key);
        const channel = new BroadcastChannel(key);
        channel.postMessage({ event: value ? "SIGNED_IN" : "SIGNED_OUT", session: value });
        channel.close();
      },
      { key: authKey, value },
    );
  };
  const reset = async () => {
    await fixture.releaseAll();
    fixture.reset();
    await page.goto(base + "/ask", { waitUntil: "domcontentloaded" });
    await session(ownerSession);
    await historyButton().click();
    await title(0).waitFor();
  };
  const open = async (i) => {
    if (!(await title(i).isVisible())) await historyButton().click();
    await title(i).click();
  };
  const send = async (text) => {
    await input().fill(text);
    await sendButton().click();
  };
  const failures = [];
  async function check(name, run) {
    report.phase = name;
    try {
      await reset();
      await run();
      report.passed.push(name);
    } catch (cause) {
      failures.push(name);
      await page.screenshot({ path: join(artifacts, name + "-failed.png") }).catch(() => {});
      if (cause.name !== "AssertionError")
        report.scenarioErrorTypes = [...(report.scenarioErrorTypes ?? []), cause.name];
    } finally {
      await fixture.releaseAll();
    }
  }
  await check("latest-conversation-wins", async () => {
    const old = fixture.hold("messages:" + fixture.conversations[0].id);
    await open(0);
    await old.arrived();
    await open(1);
    await page.getByText("Synthetic private history 2", { exact: true }).waitFor();
    old.release();
    await old.done();
    await settle();
    await absent("Synthetic private history 1");
    assert.equal(await page.getByText("Synthetic private history 2", { exact: true }).count(), 1);
  });
  await check("new-discards-pending-history", async () => {
    const old = fixture.hold("messages:" + fixture.conversations[0].id);
    await open(0);
    await old.arrived();
    await newButton().click();
    await input().fill("Synthetic new draft");
    old.release();
    await old.done();
    await settle();
    await absent("Synthetic private history 1");
    assert.equal(await input().inputValue(), "Synthetic new draft");
  });
  await check("new-send-is-not-reset-by-old-answer", async () => {
    const old = fixture.hold("ai");
    await send("Synthetic old pending question");
    await old.arrived();
    await newButton().click();
    const current = fixture.hold("ai");
    await send("Synthetic current question");
    await current.arrived();
    old.release();
    await old.done();
    await settle();
    await absent("Synthetic answer: Synthetic old pending question");
    assert.equal(await sendButton().isDisabled(), true);
    current.release();
    await current.done();
    await page.getByText("Synthetic answer: Synthetic current question", { exact: true }).waitFor();
  });
  await check("old-send-error-does-not-restore-draft", async () => {
    const old = fixture.hold("ai", { data: { error: "synthetic_failure" }, status: 503 });
    await send("Synthetic failed old question");
    await old.arrived();
    await newButton().click();
    await input().fill("Synthetic current draft");
    old.release();
    await old.done();
    await settle();
    assert.equal(await input().inputValue(), "Synthetic current draft");
    assert.equal(await page.getByRole("alert").count(), 0);
  });
  await check("conversation-switch-discards-old-answer", async () => {
    await open(0);
    await page.getByText("Synthetic private history 1", { exact: true }).waitFor();
    const old = fixture.hold("ai");
    await send("Synthetic old conversation question");
    await old.arrived();
    await open(1);
    await page.getByText("Synthetic private history 2", { exact: true }).waitFor();
    old.release();
    await old.done();
    await settle();
    await absent("Synthetic answer: Synthetic old conversation question");
    await absent("Synthetic old conversation question");
  });
  await check("account-switch-clears-messages-and-late-answer", async () => {
    await open(0);
    await page.getByText("Synthetic private history 1", { exact: true }).waitFor();
    const old = fixture.hold("ai");
    await send("Synthetic owner-only question");
    await old.arrived();
    await session(peerSession);
    await historyButton().click();
    await title(2).waitFor();
    await absent("Synthetic private history 1");
    await absent("Synthetic owner-only question");
    await input().fill("Synthetic peer draft");
    old.release();
    await old.done();
    await settle();
    await absent("Synthetic answer: Synthetic owner-only question");
    assert.equal(await input().inputValue(), "Synthetic peer draft");
    await sendButton().click();
    await page.getByText("Synthetic answer: Synthetic peer draft", { exact: true }).waitFor();
    assert.deepEqual(fixture.ai.at(-1), {
      owner: fixture.peer,
      conversationId: null,
      message: "Synthetic peer draft",
    });
  });
  await check("late-owner-history-cannot-replace-peer-history", async () => {
    const old = fixture.hold("history:" + fixture.owner);
    await page.reload({ waitUntil: "domcontentloaded" });
    await old.arrived();
    await session(peerSession);
    await historyButton().click();
    await title(2).waitFor();
    old.release();
    await old.done();
    await settle();
    await absent(fixture.conversations[0].title);
    assert.equal(await title(2).count(), 1);
  });
  await check("logout-erases-draft-and-pending-answer", async () => {
    const old = fixture.hold("ai");
    await send("Synthetic signed-out question");
    await old.arrived();
    await session(null);
    await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
    old.release();
    await old.done();
    await session(ownerSession);
    await input().waitFor();
    await settle();
    await absent("Synthetic signed-out question");
    await absent("Synthetic answer: Synthetic signed-out question");
    assert.equal(await input().inputValue(), "");
  });
  await check("message-read-error-blocks-send-until-explicit-retry", async () => {
    const old = fixture.hold("messages:" + fixture.conversations[0].id, {
      data: { message: "synthetic_read_failure" },
      status: 400,
    });
    await open(0);
    await old.arrived();
    old.release();
    await old.done();
    await page.getByRole("alert").waitFor();
    assert.equal(await input().isDisabled(), true);
    await page.getByRole("button", { name: "Load again", exact: true }).click();
    await page.getByText("Synthetic private history 1", { exact: true }).waitFor();
    assert.equal(await input().isDisabled(), false);
  });
  await check("late-message-error-does-not-touch-new-draft", async () => {
    const old = fixture.hold("messages:" + fixture.conversations[0].id, {
      data: { message: "synthetic_read_failure" },
      status: 400,
    });
    await open(0);
    await old.arrived();
    await newButton().click();
    await input().fill("Synthetic retained draft");
    old.release();
    await old.done();
    await settle();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await input().inputValue(), "Synthetic retained draft");
    assert.equal(await input().isDisabled(), false);
  });
  await check("history-loading-error-and-manual-retry", async () => {
    const old = fixture.hold("history:" + fixture.owner, {
      data: { message: "synthetic_history_failure" },
      status: 400,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await old.arrived();
    await historyButton().click();
    await page.locator('.operation-notice[data-kind="loading"]').waitFor();
    old.release();
    await old.done();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "Load again", exact: true }).click();
    await title(0).waitFor();
  });
  await check("mismatched-answer-cannot-change-conversation", async () => {
    await open(0);
    await page.getByText("Synthetic private history 1", { exact: true }).waitFor();
    const old = fixture.hold("ai", {
      data: {
        conversationId: fixture.conversations[1].id,
        message: {
          id: id(999),
          role: "assistant",
          content: "Synthetic mismatched answer",
          created_at: stamp,
        },
      },
    });
    await send("Synthetic mismatch question");
    await old.arrived();
    old.release();
    await old.done();
    await page.getByRole("alert").waitFor();
    await absent("Synthetic mismatched answer");
    assert.equal(await input().inputValue(), "Synthetic mismatch question");
    assert.equal(await page.getByText("Synthetic private history 1", { exact: true }).count(), 1);
  });
  await check("unmount-does-not-refresh-history-after-late-answer", async () => {
    const old = fixture.hold("ai");
    await send("Synthetic departed question");
    await old.arrived();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await input().waitFor({ state: "detached" });
    const before = report.simulatedReadRequests;
    old.release();
    await old.done();
    await settle();
    assert.equal(report.simulatedReadRequests, before);
  });
  await check("late-delete-stays-on-captured-owner", async () => {
    const old = fixture.hold("delete"),
      before = fixture.deletes.length;
    page.once("dialog", (d) => d.accept());
    await title(0)
      .locator("../..")
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await old.arrived();
    await session(peerSession);
    await historyButton().click();
    await title(2).waitFor();
    await input().fill("Synthetic peer draft after delete");
    old.release();
    await old.done();
    await settle();
    assert.equal(await title(2).count(), 1);
    assert.equal(await input().inputValue(), "Synthetic peer draft after delete");
    assert.deepEqual(fixture.deletes.slice(before), [
      { owner: fixture.owner, id: fixture.conversations[0].id },
    ]);
  });
  await check("deleting-active-conversation-discards-its-pending-answer", async () => {
    await open(0);
    await page.getByText("Synthetic private history 1", { exact: true }).waitFor();
    const answer = fixture.hold("ai"),
      deletion = fixture.hold("delete");
    await send("Synthetic deleted conversation question");
    await answer.arrived();
    await historyButton().click();
    page.once("dialog", (d) => d.accept());
    await title(0)
      .locator("../..")
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await deletion.arrived();
    await input().fill("Synthetic post-delete draft");
    answer.release();
    await answer.done();
    deletion.release();
    await deletion.done();
    await historyButton().click();
    await title(1).waitFor();
    await settle();
    await absent("Synthetic private history 1");
    await absent("Synthetic answer: Synthetic deleted conversation question");
    assert.equal(await title(0).count(), 0);
    assert.equal(await input().inputValue(), "Synthetic post-delete draft");
  });
  await check("current-send-error-restores-draft-without-automatic-ai-retry", async () => {
    const before = fixture.ai.length,
      old = fixture.hold("ai", { status: 503, data: { error: "synthetic_unavailable" } });
    await send("Synthetic retry question");
    await old.arrived();
    old.release();
    await old.done();
    await page.getByRole("alert").waitFor();
    await settle();
    assert.equal(await input().inputValue(), "Synthetic retry question");
    assert.equal(fixture.ai.length, before + 1);
    await sendButton().click();
    await page.getByText("Synthetic answer: Synthetic retry question", { exact: true }).waitFor();
    assert.equal(fixture.ai.length, before + 2);
  });
  await check("double-submit-is-one-request", async () => {
    const before = fixture.ai.length,
      old = fixture.hold("ai");
    await input().fill("Synthetic double submit");
    await input().evaluate((el) => {
      const form = el.closest("form");
      for (let i = 0; i < 2; i++)
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await old.arrived();
    old.release();
    await old.done();
    await page.getByText("Synthetic answer: Synthetic double submit", { exact: true }).waitFor();
    assert.equal(fixture.ai.length, before + 1);
  });
  await fixture.releaseAll();
  report.failed = failures;
  assert.deepEqual(failures, [], "Synthetic chat scenarios failed");
  await reset();
  await open(0);
  await page.getByText("Synthetic private history 1", { exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluate(async () => {
      document.documentElement.classList.add("pilot-ui");
      document.documentElement.style.fontSize = "125%";
      await document.fonts.ready;
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false);
    await page.screenshot({ path: join(artifacts, `chat-${width}.png`), animations: "disabled" });
    report.passed.push(`chat-layout-${width}`);
  }
}
