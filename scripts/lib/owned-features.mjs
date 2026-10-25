import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ownedApi,
  ownedApp,
  ownedProject,
  ownedToken,
  validateOwnedKeys,
} from "./owned-backend.mjs";

// Backend acceptance only. UI checks use the user's browser separately; no real
// account, saved preference, gate or provider configuration is changed here.
export async function acceptOwnedFeatures(keys, { liveAi = false, progress = () => {} } = {}) {
  validateOwnedKeys(keys);
  assert.equal(typeof liveAi, "boolean");
  const run = randomUUID();
  const users = [];
  const report = {
    project: ownedProject,
    completed: false,
    cleanupCompleted: false,
    realAccountsChanged: false,
    liveAi,
    aiScenarios: 0,
    checks: [],
  };
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch(url, init) {
        assert.equal(new URL(url instanceof Request ? url.url : String(url)).origin, ownedApi);
        return fetch(url, {
          ...init,
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
      },
    },
  };
  const client = (key) => createClient(ownedApi, key, options);
  const admin = client(ownedToken(keys, "service_role"));
  const anon = client(ownedToken(keys, "anon"));
  const ok = (result) => {
    if (result.error) {
      const error = new Error("owned_feature_backend_failed");
      if (/^[A-Z0-9_]{3,12}$/.test(result.error.code ?? "")) error.code = result.error.code;
      throw error;
    }
    return result.data;
  };
  async function check(name, action) {
    progress(name);
    try {
      await action();
      report.checks.push({ name, passed: true });
    } catch (error) {
      report.checks.push({
        name,
        passed: false,
        ...(error.code && /^[A-Z0-9_]{3,12}$/.test(error.code) ? { code: error.code } : {}),
        ...(Number.isInteger(error.status) ? { status: error.status } : {}),
      });
    }
  }
  async function post(user, path, body, status = 200) {
    assert.ok(/^\/api\/(ai\/[a-z-]+|chef)$/.test(path));
    const response = await fetch(ownedApp + path, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(75000),
    });
    const data = await response.json();
    if (response.status !== status) {
      const error = new Error("owned_feature_http_failed");
      error.status = response.status;
      throw error;
    }
    return data;
  }
  async function ai(user, path, body) {
    assert.equal(liveAi, true);
    assert.ok(report.aiScenarios < 8);
    report.aiScenarios++;
    return post(user, path, body);
  }
  const emptyContext = { recipeVersionId: null, sessionId: null, sessionRevision: null };
  let owner, peer, wine, version, session, feedback;
  try {
    progress("fixture_accounts");
    for (const role of ["owner", "peer"]) {
      const email = `owned-features-${role}-${run}@example.test`;
      const password = randomBytes(32).toString("hex");
      const created = ok(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { owned_feature_run: run },
        }),
      ).user;
      assert.ok(created?.id);
      const user = { id: created.id, email, app: client(ownedToken(keys, "anon")) };
      users.push(user);
      user.token = ok(
        await user.app.auth.signInWithPassword({ email, password }),
      ).session.access_token;
    }
    [owner, peer] = users;
    await check("kitchen_chef_meals_gates", async () => {
      for (const gate of ["kitchen_access", "chef_access", "meals_access"])
        assert.equal(ok(await owner.app.rpc(gate)), true);
      assert.ok((await anon.rpc("kitchen_access")).error);
    });
    await check("cellar_create_edit_and_owner_scope", async () => {
      wine = ok(
        await owner.app
          .from("wines")
          .insert({
            user_id: owner.id,
            wine_name: "Owned feature QA Chardonnay",
            producer: "Local QA",
            vintage: 2023,
            wine_type: "white",
            quantity: 2,
            country: "Germany",
            region: "Nahe",
            grape_varieties: ["Chardonnay"],
            acidity: 8,
            body: 5,
            tannin: 1,
            sweetness: 1,
            fruit: 6,
            oak: 2,
            is_public: false,
          })
          .select("*")
          .single(),
      );
      assert.equal(ok(await peer.app.from("wines").select("id").eq("id", wine.id)).length, 0);
      ok(await owner.app.from("wines").update({ quantity: 3 }).eq("id", wine.id));
      assert.equal(
        ok(await owner.app.from("wines").select("quantity").eq("id", wine.id).single()).quantity,
        3,
      );
      assert.equal(
        ok(await peer.app.from("wines").update({ quantity: 99 }).eq("id", wine.id).select("id"))
          .length,
        0,
      );
    });
    await check("tasting_notes_save_update_and_scope", async () => {
      const note = ok(
        await owner.app
          .from("tasting_notes")
          .insert({
            user_id: owner.id,
            wine_id: wine.id,
            rating: 4,
            notes: "Synthetic QA, not a tasting.",
            aromas: ["citrus"],
            aroma_intensities: { citrus: 3 },
            acidity: 8,
            body: 5,
          })
          .select("id")
          .single(),
      );
      assert.equal(
        ok(await peer.app.from("tasting_notes").select("id").eq("id", note.id)).length,
        0,
      );
      ok(
        await owner.app
          .from("tasting_notes")
          .update({ notes: "Synthetic QA updated." })
          .eq("id", note.id),
      );
      const saved = ok(
        await owner.app
          .from("tasting_notes")
          .select("notes,aroma_intensities")
          .eq("id", note.id)
          .single(),
      );
      assert.equal(saved.notes, "Synthetic QA updated.");
      assert.deepEqual(saved.aroma_intensities, { citrus: 3 });
      assert.ok(
        (await peer.app.from("tasting_notes").insert({ user_id: peer.id, wine_id: wine.id })).error,
      );
    });
    await check("wishlist_save_duplicate_and_scope", async () => {
      const row = {
        user_id: owner.id,
        wine_id: wine.id,
        wine_name: wine.wine_name,
        source: "cellar",
      };
      const saved = ok(await owner.app.from("wishlist").insert(row).select("id").single());
      assert.equal((await owner.app.from("wishlist").insert(row)).error?.code, "23505");
      assert.equal(ok(await peer.app.from("wishlist").select("id").eq("id", saved.id)).length, 0);
    });
    await check("public_share_and_revocation", async () => {
      const read = async () => {
        const result = await anon.from("public_wines").select("id").eq("share_id", wine.share_id);
        if (["PGRST205", "42P01"].includes(result.error?.code))
          return anon
            .from("wines")
            .select("id")
            .eq("share_id", wine.share_id)
            .eq("is_public", true);
        return result;
      };
      assert.equal(ok(await read()).length, 0);
      ok(await owner.app.from("wines").update({ is_public: true }).eq("id", wine.id));
      try {
        assert.equal(ok(await read()).at(0)?.id, wine.id);
      } finally {
        ok(await owner.app.from("wines").update({ is_public: false }).eq("id", wine.id));
      }
      assert.equal(ok(await read()).length, 0);
    });
    await check("recipe_versions_and_stale_write_denial", async () => {
      const document = {
        title: "Owned feature QA soup",
        description: "Synthetic functional check",
        servings: 2,
        totalMinutes: 20,
        image: "none",
        sourceNote: "Local QA fixture",
        notes: "",
        ingredients: [{ id: randomUUID(), name: "Tomat", amount: 400, unit: "g" }],
        steps: [
          {
            id: randomUUID(),
            title: "Prepare",
            text: "Follow the reviewed recipe.",
            timerSeconds: 60,
          },
          { id: randomUUID(), title: "Serve", text: "Serve in a bowl.", timerSeconds: null },
        ],
      };
      const first = ok(
        await owner.app.rpc("kitchen_save_recipe", {
          _recipe_id: randomUUID(),
          _version_id: randomUUID(),
          _expected_revision: 0,
          _document: document,
        }),
      );
      version = ok(
        await owner.app.rpc("kitchen_save_recipe", {
          _recipe_id: first.recipe_id,
          _version_id: randomUUID(),
          _expected_revision: 1,
          _document: { ...document, title: "Owned feature QA soup revised" },
        }),
      );
      assert.equal(version.revision, 2);
      assert.equal(
        ok(
          await owner.app
            .from("kitchen_recipe_versions")
            .select("id")
            .eq("recipe_id", first.recipe_id),
        ).length,
        2,
      );
      assert.equal(
        ok(await peer.app.from("kitchen_recipe_versions").select("id").eq("id", first.id)).length,
        0,
      );
      assert.ok(
        (
          await owner.app.rpc("kitchen_save_recipe", {
            _recipe_id: first.recipe_id,
            _version_id: randomUUID(),
            _expected_revision: 1,
            _document: document,
          })
        ).error,
      );
    });
    await check("cook_mode_portions_timer_and_replay", async () => {
      const request = {
        _id: randomUUID(),
        _version_id: version.id,
        _expected_revision: 0,
        _request_id: randomUUID(),
        _state: {
          status: "running",
          activeStep: 0,
          servings: 4,
          checkedIngredientIds: [version.document.ingredients[0].id],
          timers: [
            {
              id: randomUUID(),
              name: "QA timer",
              durationMs: 60000,
              deadlineMs: Date.now() + 60000,
              pausedMs: 0,
              resumeOnSession: false,
            },
          ],
        },
      };
      session = ok(await owner.app.rpc("kitchen_save_session", request));
      assert.equal(
        ok(await owner.app.rpc("kitchen_save_session", request)).revision,
        session.revision,
      );
      const loaded = ok(
        await owner.app.from("cooking_sessions").select("*").eq("id", session.id).single(),
      );
      assert.deepEqual(loaded.state, request._state);
      assert.equal(
        ok(await peer.app.from("cooking_sessions").select("id").eq("id", session.id)).length,
        0,
      );
      session = ok(
        await owner.app.rpc("kitchen_save_session", {
          _id: session.id,
          _version_id: version.id,
          _expected_revision: session.revision,
          _request_id: randomUUID(),
          _state: {
            ...session.state,
            status: "paused",
            timers: session.state.timers.map((t) => ({ ...t, deadlineMs: null, pausedMs: 55000 })),
          },
        }),
      );
      assert.equal(session.state.timers[0].pausedMs, 55000);
    });
    await check("cook_history_feedback_and_wine_meal", async () => {
      session = ok(
        await owner.app.rpc("kitchen_save_session", {
          _id: session.id,
          _version_id: version.id,
          _expected_revision: session.revision,
          _request_id: randomUUID(),
          _state: { ...session.state, status: "completed", activeStep: 1, timers: [] },
          _feedback: { rating: 4, note: "Jag gillar basilika och tomat. Jag ogillar svamp." },
        }),
      );
      feedback = ok(
        await owner.app.from("cooking_feedback").select("*").eq("session_id", session.id).single(),
      );
      assert.equal(feedback.rating, 4);
      const request = {
        _id: randomUUID(),
        _revision: 0,
        _input: {
          sessionId: session.id,
          wineId: wine.id,
          wineRating: 5,
          pairingRating: 3,
          note: "Synthetic QA",
        },
      };
      ok(await owner.app.rpc("kitchen_meal_save", request));
      ok(await owner.app.rpc("kitchen_meal_save", request));
      const meal = ok(
        await owner.app.from("meal_wine_links").select("*").eq("id", request._id).single(),
      );
      assert.deepEqual([meal.food_rating, meal.wine_rating, meal.pairing_rating], [4, 5, 3]);
      assert.equal(
        ok(await owner.app.from("wines").select("quantity").eq("id", wine.id).single()).quantity,
        3,
      );
      assert.equal(
        ok(await peer.app.from("meal_wine_links").select("id").eq("id", request._id)).length,
        0,
      );
    });
    await check("food_memory_correction_forget_and_reset", async () => {
      const signalId = randomUUID();
      ok(
        await owner.app.rpc("food_memory_change", {
          _action: "add",
          _id: signalId,
          _entry: { attribute: "ingredient", value: "basilika", direction: 1 },
        }),
      );
      let signal = ok(await owner.app.from("food_signals").select("*").eq("id", signalId).single());
      assert.equal(signal.status, "confirmed");
      assert.equal(ok(await peer.app.from("food_signals").select("id")).length, 0);
      ok(
        await owner.app.rpc("food_memory_change", {
          _action: "correct",
          _id: signal.id,
          _revision: signal.revision,
          _entry: { attribute: "ingredient", value: "basilika", direction: -1 },
        }),
      );
      signal = ok(
        await owner.app.from("food_signals").select("*").eq("status", "confirmed").single(),
      );
      assert.equal(signal.direction, -1);
      ok(
        await owner.app.rpc("food_memory_change", {
          _action: "forget",
          _id: signal.id,
          _revision: signal.revision,
        }),
      );
      assert.equal(ok(await owner.app.from("food_signals").select("id")).length, 0);
      ok(await owner.app.rpc("food_memory_change", { _action: "reset", _id: randomUUID() }));
      ok(
        await owner.app.rpc("food_memory_change", {
          _action: "add",
          _id: randomUUID(),
          _entry: { attribute: "ingredient", value: "basilika", direction: 1 },
        }),
      );
    });
    await check("family_explicit_share_and_membership_revocation", async () => {
      const group = randomUUID(),
        profile = randomUUID();
      const family = (user, action, id, revision, data = {}) =>
        user.app.rpc("kitchen_family_change", {
          _action: action,
          _id: id,
          _revision: revision,
          _data: data,
        });
      ok(
        await family(owner, "create_household", group, 0, {
          name: "Owned QA family",
          displayName: "QA owner",
          adultConfirmed: true,
        }),
      );
      ok(
        await family(owner, "save_diner", profile, 0, {
          document: { name: "QA adult", kind: "adult", preferences: [] },
          householdId: group,
          shared: true,
        }),
      );
      assert.equal(
        ok(await peer.app.from("kitchen_diners").select("id").eq("id", profile)).length,
        0,
      );
      const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
      ok(
        await owner.app.rpc("kitchen_invite_create", {
          _id: randomUUID(),
          _household_id: group,
          _revision: 1,
          _hash: hash,
        }),
      );
      assert.equal(
        ok(
          await peer.app.rpc("kitchen_invite_accept", {
            _hash: hash,
            _display_name: "QA member",
            _adult_confirmed: true,
          }),
        ).status,
        "joined",
      );
      assert.equal(
        ok(await peer.app.from("kitchen_diners").select("id").eq("id", profile)).length,
        1,
      );
      assert.equal(ok(await peer.app.from("kitchen_recipes").select("id")).length, 0);
      const groupState = ok(
        await owner.app.from("kitchen_households").select("revision").eq("id", group).single(),
      );
      ok(await family(owner, "remove_member", group, groupState.revision, { userId: peer.id }));
      assert.equal(
        ok(await peer.app.from("kitchen_diners").select("id").eq("id", profile)).length,
        0,
      );
    });
    if (liveAi) {
      await check("live_wine_chat_and_history", async () => {
        const response = await ai(owner, "/api/ai/ask-winesnap", {
          conversationId: null,
          message:
            "Ge ett kort matforslag till mitt sparade Chardonnay-vin. Hitta inte pa ett provningsbetyg.",
          context: { source: "wine", wineId: wine.id, route: `/wine/${wine.id}` },
          language: "sv",
        });
        assert.ok(response.message?.content?.length > 10);
        assert.ok(
          ok(
            await owner.app
              .from("ai_messages")
              .select("id")
              .eq("conversation_id", response.conversationId),
          ).length >= 2,
        );
        assert.equal(
          ok(
            await peer.app
              .from("ai_messages")
              .select("id")
              .eq("conversation_id", response.conversationId),
          ).length,
          0,
        );
      });
      for (const [name, path, body] of [
        ["live_personal_recommendations", "/api/ai/taste-suggestions", { language: "sv" }],
        ["live_similar_wines", "/api/ai/wine-suggestions", { wineId: wine.id, language: "sv" }],
      ])
        await check(name, async () => {
          const response = await ai(owner, path, body);
          assert.ok(response.suggestions?.length > 0);
          assert.ok(
            response.suggestions.every(
              (w) => w.identity_verified === true && /^https:\/\//.test(w.source_url),
            ),
          );
        });
      await check("live_restaurant_text_menu", async () => {
        const response = await ai(owner, "/api/ai/restaurant-match", {
          text: "Zehn Morgen Kalk & Sandstein 2023 Chardonnay & Weisser Burgunder, Nahe, Germany. Bottle 520 SEK.\nGuigal Cotes du Rhone Rouge 2022. Bottle 610 SEK.",
          language: "sv",
          constraints: { dish: "Ugnsbakad fisk med citron", maxPrice: 600, mode: "balanced" },
        });
        assert.ok(response.picks?.length > 0);
        assert.ok(
          response.picks.every((pick) =>
            response.extracted_wines.some(
              (wine) => wine.wine_name === pick.wine_name && wine.producer === pick.producer,
            ),
          ),
        );
      });
      await check("live_chef_confirmed_memory_and_cached_retry", async () => {
        const request = {
          action: "chat",
          requestId: randomUUID(),
          context: emptyContext,
          conversationId: randomUUID(),
          conversationRevision: 0,
          message:
            "Vilken ingrediens har jag uttryckligen sagt att jag gillar? Svara mycket kort utan att gissa.",
        };
        const response = await ai(owner, "/api/chef", request);
        assert.match(response.answer?.toLowerCase() ?? "", /basilika/);
        assert.deepEqual(await post(owner, "/api/chef", request), response);
        assert.equal(ok(await peer.app.from("chef_messages").select("id")).length, 0);
      });
      await check("live_chef_recipe_draft_without_implicit_save", async () => {
        const before = ok(await owner.app.from("kitchen_recipes").select("id")).length;
        const response = await ai(owner, "/api/chef", {
          action: "generate",
          requestId: randomUUID(),
          context: emptyContext,
          servings: 2,
          maxMinutes: 30,
          prompt:
            "En enkel tomatsoppa med vita bonor och basilika. Exakt tva portioner, hogst 30 minuter. Inga narings- eller sakerhetspastaenden.",
        });
        assert.equal(response.draft?.servings, 2);
        assert.ok(response.draft.ingredients.length > 1 && response.draft.steps.length > 0);
        assert.equal(ok(await owner.app.from("kitchen_recipes").select("id")).length, before);
      });
      await check("live_chef_adaptation_preserves_original", async () => {
        const before = ok(await owner.app.from("kitchen_recipe_versions").select("id")).length;
        const response = await ai(owner, "/api/chef", {
          action: "adapt",
          requestId: randomUUID(),
          context: { ...emptyContext, recipeVersionId: version.id },
          servings: 4,
          maxMinutes: 30,
          prompt: "Anpassa till fyra portioner och lagg till basilika. Skapa endast ett utkast.",
        });
        assert.equal(response.draft?.servings, 4);
        assert.equal(
          ok(await owner.app.from("kitchen_recipe_versions").select("id")).length,
          before,
        );
        assert.equal(
          ok(await owner.app.from("cooking_sessions").select("state").eq("id", session.id).single())
            .state.status,
          "completed",
        );
      });
      await check("live_feedback_exact_source_candidates", async () => {
        // Reset deliberately excludes older feedback; make a new fixture after it.
        const newer = ok(
          await owner.app.rpc("kitchen_save_session", {
            _id: randomUUID(),
            _version_id: version.id,
            _expected_revision: 0,
            _request_id: randomUUID(),
            _state: {
              status: "running",
              activeStep: 0,
              servings: 2,
              checkedIngredientIds: [],
              timers: [],
            },
          }),
        );
        ok(
          await owner.app.rpc("kitchen_save_session", {
            _id: newer.id,
            _version_id: version.id,
            _expected_revision: newer.revision,
            _request_id: randomUUID(),
            _state: { ...newer.state, status: "completed" },
            _feedback: { rating: 4, note: "Jag gillar tomat och basilika. Jag ogillar svamp." },
          }),
        );
        feedback = ok(
          await owner.app.from("cooking_feedback").select("*").eq("session_id", newer.id).single(),
        );
        const response = await ai(owner, "/api/chef", {
          action: "extract",
          requestId: randomUUID(),
          context: emptyContext,
          feedbackId: feedback.id,
        });
        assert.ok(response.candidateCount > 0);
        const signals = ok(
          await owner.app.from("food_signals").select("*").eq("source_kind", "feedback"),
        );
        assert.ok(
          signals.every((s) => s.status === "pending" && feedback.note.includes(s.source_excerpt)),
        );
      });
    }
    await check("chef_safety_without_provider", async () => {
      const response = await post(owner, "/api/chef", {
        action: "chat",
        requestId: randomUUID(),
        context: emptyContext,
        conversationId: randomUUID(),
        conversationRevision: 0,
        message: "Ar raw chicken safe to eat?",
      });
      assert.equal(response.safety, true);
      assert.equal(response.model, null);
      assert.equal(response.inputTokens, 0);
    });
  } finally {
    progress("cleanup");
    let failures = 0;
    for (const user of users) {
      try {
        const found = ok(await admin.auth.admin.getUserById(user.id)).user;
        assert.equal(found.email, user.email);
        assert.equal(found.user_metadata.owned_feature_run, run);
        ok(await admin.auth.admin.deleteUser(user.id));
        const removed = await admin.auth.admin.getUserById(user.id);
        assert.equal(removed.error?.status, 404);
      } catch {
        failures++;
      }
    }
    report.cleanupFailures = failures;
    report.cleanupCompleted = failures === 0 && users.length === 2;
  }
  report.passed = report.checks.filter((c) => c.passed).length;
  report.failed = report.checks.filter((c) => !c.passed).length;
  report.completed = report.failed === 0 && report.cleanupCompleted;
  return report;
}
