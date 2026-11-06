import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ownedApp } from "./owned-backend.mjs";
import { validateBrowserFixture } from "./owned-browser-fixture.mjs";

// Synthetic AI replies and deliberate faults, never a provider request or real account.
export async function acceptOwnedCoreStates({ page, context, fixture, phase, capture, pass }) {
  validateBrowserFixture(fixture);
  let simulatedAiRequests = 0,
    memoryWrites = 0,
    wineWrites = 0;
  const routes = [];
  const mock = async (pattern, handler) => {
    await page.route(pattern, handler);
    routes.push([pattern, handler]);
  };
  const remove = async (pattern) => {
    const r = routes.find(([p]) => p === pattern);
    if (r) {
      await page.unroute(...r);
      routes.splice(routes.indexOf(r), 1);
    }
  };
  const json = (route, status, body) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const widths = [360, 390, 430, 1024, 1440];
  const text = "QA STATE WINE SYNTHETIC PRODUCER 2023 NAHE CHARDONNAY";
  const field = (value) => ({ value, source: "label", confidence: 95, evidence: value });
  const unknown = { value: null, source: "unknown", confidence: 0, evidence: null };
  const analysis = {
    wine: {
      label_text: text,
      identity: {
        producer: field("SYNTHETIC PRODUCER"),
        wine_name: field("QA STATE WINE"),
        vintage: field("2023"),
        region: field("NAHE"),
        country: unknown,
        wine_type: unknown,
        grape_varieties: [field("CHARDONNAY")],
      },
      taste: {
        description: "Synthetic state test",
        body: 4,
        acidity: 7,
        tannin: 1,
        sweetness: 0,
        oak: null,
        fruit: null,
        primary_notes: [],
        secondary_notes: [],
        tertiary_notes: [],
        food_pairings: [],
        serving_temp: null,
        glass_type: null,
        decant: null,
      },
    },
  };
  let releaseRead;
  try {
    phase("core_memory_read_failure");
    const held = new Promise((resolve) => {
      releaseRead = resolve;
    });
    await mock("**/rest/v1/food_signals**", async (route) => {
      await held;
      return json(route, 503, { message: "synthetic read failure" });
    });
    await page.goto(ownedApp + "/kitchen#memory", { waitUntil: "domcontentloaded" });
    await page.getByText("H\u00e4mtar ditt matminne\u2026", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true })
        .count(),
      0,
    );
    releaseRead();
    await page
      .getByText(
        "Matminnet kunde inte h\u00e4mtas. Det betyder inte att dina preferenser \u00e4r tomma.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.locator('.operation-notice[aria-busy="true"]').count(), 0);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await capture("memory-error", width);
    }
    await remove("**/rest/v1/food_signals**");
    await page.getByRole("button", { name: "H\u00e4mta igen", exact: true }).click();
    await page
      .getByText("Inga bekr\u00e4ftade matpreferenser \u00e4nnu.", { exact: true })
      .waitFor();
    pass("memory_read_error_not_empty_and_manual_recovery");
    await mock("**/rest/v1/rpc/food_memory_change", async (route) => {
      memoryWrites++;
      return route.fallback();
    });
    await page.getByRole("textbox", { name: "Matpreferens", exact: true }).fill("basilika");
    await page.getByRole("button", { name: "L\u00e4gg till", exact: true }).evaluate((node) => {
      node.click();
      node.click();
    });
    await page.getByRole("heading", { name: "Gillar basilika", exact: true }).waitFor();
    assert.equal(memoryWrites, 1);
    await context.setOffline(true);
    await page
      .getByText(
        "Anslut f\u00f6r att l\u00e4sa eller \u00e4ndra matminnet. Tidigare h\u00e4mtade preferenser \u00e4r dolda.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Gillar basilika", exact: true }).count(),
      0,
    );
    await context.setOffline(false);
    await page.getByRole("heading", { name: "Gillar basilika", exact: true }).waitFor();
    assert.equal(memoryWrites, 1);
    pass("memory_offline_hides_data_without_replaying_mutation");

    phase("core_chef_manual_retry");
    await page.setViewportSize({ width: 390, height: 844 });
    await mock("**/rest/v1/chef_conversations**", (route) =>
      json(route, 503, { message: "synthetic history failure" }),
    );
    const chefRequests = [];
    const draft = {
      title: "Syntetiskt receptutkast",
      description: "Local recovery check",
      servings: 2,
      totalMinutes: 20,
      image: "none",
      sourceNote: "Synthetic state fixture",
      notes: "",
      ingredients: [{ id: randomUUID(), name: "tomat", amount: 400, unit: "g" }],
      steps: [
        {
          id: randomUUID(),
          title: "Forbered",
          text: "Synthetic preparation step.",
          timerSeconds: 60,
        },
      ],
    };
    await mock("**/api/chef", (route) => {
      simulatedAiRequests++;
      const body = route.request().postDataJSON();
      chefRequests.push(body);
      if (chefRequests.length === 1) return json(route, 429, { error: "chef_quota" });
      return json(route, 200, {
        ...(body.action === "chat" ? { answer: "Syntetiskt svar finns kvar." } : { draft }),
        model: "synthetic-ui-probe",
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 1,
      });
    });
    await page.goto(ownedApp + "/kitchen#chef", { waitUntil: "domcontentloaded" });
    await page
      .getByText(
        "Samtalshistoriken kunde inte h\u00e4mtas. Det senaste svaret finns kvar h\u00e4r.",
        { exact: true },
      )
      .waitFor();
    const prompt = page.getByRole("textbox", { name: "Din fr\u00e5ga", exact: true });
    await prompt.fill("Ge ett kort matforslag.");
    await page.getByRole("button", { name: "Skicka", exact: true }).click();
    await page
      .getByText(
        "AI-gr\u00e4nsen \u00e4r n\u00e5dd. Din text finns kvar h\u00e4r. F\u00f6rs\u00f6k igen senare.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await prompt.inputValue(), "Ge ett kort matforslag.");
    await capture("chef-quota", 390);
    await context.setOffline(true);
    await page.getByText(/^AI-kocken beh\u00f6ver anslutning/).waitFor();
    await context.setOffline(false);
    await page
      .locator('.chef-panel .operation-notice[aria-busy="true"]')
      .waitFor({ state: "hidden" });
    assert.equal(chefRequests.length, 1);
    await page.getByRole("button", { name: "Skicka", exact: true }).click();
    await page.getByText("Syntetiskt svar finns kvar.", { exact: true }).waitFor();
    assert.equal(chefRequests[0].requestId, chefRequests[1].requestId);
    await remove("**/rest/v1/chef_conversations**");
    await page.getByRole("button", { name: "H\u00e4mta igen", exact: true }).click();
    await page
      .locator('.chef-panel .operation-notice[aria-busy="true"]')
      .waitFor({ state: "hidden" });
    assert.equal(chefRequests.length, 2);
    assert.equal(await page.getByText("Syntetiskt svar finns kvar.", { exact: true }).count(), 1);
    pass("chef_quota_keeps_prompt_explicit_retry_reuses_id_and_history_failure_keeps_answer");
    await page.getByRole("button", { name: "Skapa recept", exact: true }).click();
    await page
      .getByRole("textbox", {
        name: "Vad ska receptet inneh\u00e5lla eller \u00e4ndra?",
        exact: true,
      })
      .fill("En tomatsoppa.");
    await page.getByRole("button", { name: "Ta fram f\u00f6rslag", exact: true }).click();
    await page.getByRole("button", { name: "Granska recept", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Ta fram f\u00f6rslag", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Granska recept", exact: true }).click();
    const versions = [];
    await mock("**/rest/v1/rpc/kitchen_save_recipe", async (route) => {
      versions.push(route.request().postDataJSON()._version_id);
      if (versions.length === 1) return json(route, 503, { message: "synthetic save failure" });
      return route.fallback();
    });
    await page.getByRole("button", { name: "Spara recept", exact: true }).click();
    await page.getByText(/^Sparandet kunde inte bekr\u00e4ftas\. Utkastet finns kvar/).waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "Receptnamn", exact: true }).inputValue(),
      draft.title,
    );
    assert.equal(chefRequests.length, 3);
    await page.getByRole("button", { name: "Spara recept", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(versions[0], versions[1]);
    assert.equal(chefRequests.length, 3);
    pass("recipe_draft_requires_review_and_survives_save_failure_with_same_version_id");

    phase("core_scan_recovery");
    let imageBytes,
      imageCalls = 0,
      analysisCalls = 0;
    await mock("**/api/ai/analyze-wine", (route) => {
      simulatedAiRequests++;
      analysisCalls++;
      const body = route.request().postDataJSON();
      if (body.imageBase64) {
        imageCalls++;
        if (imageCalls === 1) {
          imageBytes = body.imageBase64;
          return json(route, 503, { error: "synthetic unavailable" });
        }
        assert.equal(body.imageBase64, imageBytes);
      }
      return json(route, 200, analysis);
    });
    await page.goto(ownedApp + "/scan", { waitUntil: "domcontentloaded" });
    await page
      .locator('input[type="file"]')
      .setInputFiles(join(process.env.USERPROFILE, "OneDrive/Desktop/Winesnap/54456874_400.webp"));
    await page.getByRole("button", { name: "Anv\u00e4nd hela bilden", exact: true }).click();
    await page
      .getByText("Den valda bilden finns kvar f\u00f6r en ny analys.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Analysera igen", exact: true }).click();
    await page.getByRole("button", { name: "Spara i k\u00e4llaren", exact: true }).waitFor();
    assert.equal(imageCalls, 2);
    await page.getByRole("button", { name: "Kasta", exact: true }).click();
    pass("scan_analysis_error_retains_identical_image_for_explicit_retry");
    await page.getByRole("button", { name: "Skriv", exact: true }).click();
    const description = page.locator("#scan-description");
    await description.fill(text);
    await context.setOffline(true);
    await page.getByText(/^Anslut f\u00f6r att analysera ett vin\./).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Identifiera vinet", exact: true }).isDisabled(),
      true,
    );
    assert.equal(await description.inputValue(), text);
    await context.setOffline(false);
    assert.equal(analysisCalls, 2);
    await page.getByRole("button", { name: "Identifiera vinet", exact: true }).click();
    await page.getByRole("button", { name: "Spara i k\u00e4llaren", exact: true }).waitFor();
    let saveId,
      loseRead = true;
    await mock("**/rest/v1/wines**", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        wineWrites++;
        saveId = req.postDataJSON().id;
        const response = await route.fetch();
        assert.ok(response.ok());
        return route.abort("failed");
      }
      if (
        loseRead &&
        saveId &&
        req.method() === "GET" &&
        new URL(req.url()).searchParams.get("id") === `eq.${saveId}`
      )
        return route.abort("failed");
      return route.fallback();
    });
    await page.getByRole("button", { name: "Spara i k\u00e4llaren", exact: true }).click();
    await page.getByRole("button", { name: "Kontrollera sparandet", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "\u00c4ndra vinuppgifter", exact: true }).isDisabled(),
      true,
    );
    await capture("scan-save-uncertain", 390);
    loseRead = false;
    await page.getByRole("button", { name: "Kontrollera sparandet", exact: true }).click();
    await page.getByText("Sparat i din k\u00e4llare", { exact: true }).waitFor();
    assert.equal(wineWrites, 1);
    assert.equal(analysisCalls, 3);
    pass("scan_offline_never_autoruns_and_lost_save_reply_never_duplicates_insert");
    return { completed: true, liveProvider: false, simulatedAiRequests, memoryWrites, wineWrites };
  } finally {
    releaseRead?.();
    await context.setOffline(false);
    for (const route of routes) await page.unroute(...route);
  }
}
