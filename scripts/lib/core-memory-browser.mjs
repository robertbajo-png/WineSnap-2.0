import assert from "node:assert/strict";

async function boundedArrival(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("synthetic_memory_timeout")), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Synthetic source fixture only. Never forward this RPC to any backend.
export function createCoreMemoryFixture({ owner, signal, report, failedTables, base }) {
  assert.match(owner, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(signal.user_id, owner);
  assert.equal(new URL(base).hostname, "127.0.0.1");
  let signals = [signal],
    scenario = "",
    target,
    writeCount = 0,
    commits = 0,
    release,
    arrived;
  const label = "syntheticspice",
    draft = "syntheticdraft",
    server = "syntheticserver",
    late = "syntheticlate";
  const json = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": base },
      body: JSON.stringify(data),
    });
  return {
    label,
    draft,
    server,
    late,
    rows: (id) => (id === owner ? [...signals] : []),
    counts: () => ({ writeCount, commits }),
    arm(value) {
      assert.ok(["add-read-error", "correct-conflict", "forget-lost", "add-late"].includes(value));
      assert.equal(scenario, "");
      scenario = value;
    },
    nextWrite() {
      return new Promise((resolve) => {
        arrived = resolve;
      });
    },
    release: () => release?.(),
    async write(route, user) {
      const request = route.request(),
        url = new URL(request.url());
      assert.equal(url.href, "http://127.0.0.1:54323/rest/v1/rpc/food_memory_change");
      assert.equal(request.method(), "POST");
      assert.equal(request.headers().apikey, "sb_publishable_runtime_check_not_a_real_key");
      assert.equal(user.id, owner);
      assert.notEqual(scenario, "");
      const mode = scenario,
        body = request.postDataJSON();
      const adding = mode === "add-read-error" || mode === "add-late";
      if (adding) {
        assert.match(
          body._id,
          /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
        );
        assert.ok(!signals.some((s) => s.id === body._id));
      }
      assert.deepEqual(body, {
        _action: adding ? "add" : mode === "correct-conflict" ? "correct" : "forget",
        _id: adding ? body._id : target,
        _revision: adding ? 0 : mode === "correct-conflict" ? 1 : 2,
        _entry:
          mode === "forget-lost"
            ? null
            : {
                attribute: "ingredient",
                value:
                  mode === "add-read-error" ? label : mode === "correct-conflict" ? draft : late,
                direction: 1,
              },
      });
      scenario = "";
      report.simulatedWrites = (report.simulatedWrites ?? 0) + 1;
      writeCount++;
      assert.ok(writeCount <= 4);
      if (mode === "correct-conflict") {
        signals = signals.map((s) => (s.id === target ? { ...s, value: server, revision: 2 } : s));
        return json(route, { code: "PT409" }, 409);
      }
      commits++;
      if (mode === "forget-lost") {
        signals = signals.filter((s) => s.id !== target);
        return route.abort();
      }
      signals.push({
        ...signal,
        id: body._id,
        value: body._entry.value,
        source_key: "statement:" + body._id,
      });
      if (mode === "add-read-error") {
        target = body._id;
        failedTables.add("food_signals");
        return json(route, null);
      }
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      arrived?.();
      await wait;
      try {
        await json(route, null);
      } catch {
        assert.ok(request.failure());
      }
    },
  };
}

export async function acceptCoreMemoryRecovery({
  page,
  base,
  fixture,
  report,
  capture,
  switchAccount,
}) {
  const memory = fixture.memory;
  const panel = page.locator(".chef-panel");
  const retry = () => panel.getByRole("button", { name: "H\u00e4mta igen", exact: true });
  const read = async () => {
    await retry().focus();
    await page.keyboard.press("Enter");
  };
  report.phase = "memory-restore-synthetic-owner";
  await page.goto(base + "/kitchen#memory", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Gillar " + fixture.memoryValue, exact: true }).waitFor();
  report.phase = "memory-committed-read-failure";
  await page.getByLabel("Matpreferens", { exact: true }).fill(memory.label);
  memory.arm("add-read-error");
  await page.getByRole("button", { name: "L\u00e4gg till", exact: true }).evaluate((button) => {
    button.form.requestSubmit();
    button.form.requestSubmit();
  });
  await page
    .getByText("Matminnet \u00e4r uppdaterat. Uppgifterna kunde inte l\u00e4sas om.", {
      exact: false,
    })
    .waitFor();
  assert.equal(memory.counts().writeCount, 1);
  await capture("memory-saved-read-error");
  fixture.failedTables.delete("food_signals");
  await read();
  await page.getByRole("heading", { name: "Gillar " + memory.label, exact: true }).waitFor();
  assert.equal(memory.counts().writeCount, 1);
  report.passed.push("memory-committed-save-read-retry-never-repeats-write");

  report.phase = "memory-correction-conflict-draft";
  await page.getByRole("button", { name: "Korrigera " + memory.label, exact: true }).click();
  await page.getByLabel("Matpreferens", { exact: true }).fill(memory.draft);
  memory.arm("correct-conflict");
  await page.getByRole("button", { name: "Spara r\u00e4ttning", exact: true }).click();
  await page.getByText("Underlaget har \u00e4ndrats", { exact: false }).waitFor();
  await read();
  await page.getByText("Preferensen har \u00e4ndrats.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("Matpreferens", { exact: true }).inputValue(), memory.draft);
  assert.equal(
    await page.getByRole("button", { name: "Spara r\u00e4ttning", exact: true }).isDisabled(),
    true,
  );
  assert.equal(memory.counts().writeCount, 2);
  await capture("memory-conflict-retains-draft");
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  report.passed.push("memory-correction-keeps-draft-and-never-rebases-newer-revision");

  report.phase = "memory-forget-lost-reply";
  await page.getByRole("button", { name: "Gl\u00f6m " + memory.server, exact: true }).click();
  memory.arm("forget-lost");
  await page.getByRole("dialog").getByRole("button", { name: "Gl\u00f6m", exact: true }).click();
  await page.getByText("Svaret saknas.", { exact: false }).waitFor();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  fixture.failedTables.add("food_signals");
  const failed = fixture.nextRead("food_signals");
  await read();
  await boundedArrival(failed);
  await panel.locator('.operation-notice[data-kind="error"]').waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Avsluta f\u00f6rs\u00f6ket", exact: true })
      .isDisabled(),
    true,
  );
  fixture.failedTables.delete("food_signals");
  await read();
  await page.getByText("Aktuella uppgifter \u00e4r inl\u00e4sta.", { exact: false }).waitFor();
  assert.equal(memory.counts().writeCount, 3);
  assert.equal(
    await page.getByRole("button", { name: "Nollst\u00e4ll matminne", exact: true }).isDisabled(),
    true,
  );
  await capture("memory-uncertain-read-review");
  await page.setViewportSize({ width: 390, height: 844 });
  const finish = page.getByRole("button", { name: "Avsluta f\u00f6rs\u00f6ket", exact: true });
  await finish.focus();
  const focused = await finish.boundingBox(),
    nav = await page.locator(".pilot-nav").boundingBox();
  assert.ok(focused && nav && focused.y >= 0 && focused.y + focused.height <= nav.y);
  await page.keyboard.press("Enter");
  await page.getByText("F\u00f6rs\u00f6ket \u00e4r avslutat.", { exact: false }).waitFor();
  assert.equal(memory.counts().writeCount, 3);
  report.passed.push("memory-uncertain-forget-requires-read-and-explicit-nonwriting-completion");

  report.phase = "memory-late-save-account-change";
  await page.getByLabel("Matpreferens", { exact: true }).fill(memory.late);
  memory.arm("add-late");
  const arrival = memory.nextWrite();
  await page.getByRole("button", { name: "L\u00e4gg till", exact: true }).click();
  try {
    await boundedArrival(arrival);
    await switchAccount();
    await page
      .getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true })
      .waitFor();
  } finally {
    memory.release();
  }
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await page.getByLabel("Matpreferens", { exact: true }).inputValue(), "");
  assert.equal(await page.getByText("Matminnet \u00e4r uppdaterat.", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Gillar " + memory.late, { exact: true }).count(), 0);
  assert.deepEqual(memory.counts(), { writeCount: 4, commits: 3 });
  report.memoryCounts = memory.counts();
  report.passed.push("memory-late-save-cannot-clear-or-update-another-account");
}
