import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ownedApi,
  ownedApp,
  ownedProject,
  ownedToken,
  validateOwnedKeys,
} from "./owned-backend.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateBrowserFixture(value) {
  assert.equal(value?.project, ownedProject);
  for (const key of ["run", "userId", "wineId", "noteId", "shareId", "versionId", "sessionId"])
    assert.match(value[key], uuid);
  assert.equal(value.email, `owned-browser-${value.run}@example.test`);
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      "project",
      "run",
      "userId",
      "wineId",
      "noteId",
      "shareId",
      "versionId",
      "sessionId",
      "email",
    ].sort(),
  );
  return value;
}
export function assertFixtureOwner(user, fixture) {
  validateBrowserFixture(fixture);
  assert.equal(user?.id, fixture.userId);
  assert.equal(user.email, fixture.email);
  assert.equal(user.app_metadata?.owned_browser_run, fixture.run);
}

// Only synthetic fixtures use this reproducible password. It never enters a
// report or a browser; browser sign-in uses normal mail in the local inbox.
export async function ownedBrowserFixture(keys, action, fixture, remember = async () => {}) {
  validateOwnedKeys(keys);
  assert.ok(["prepare", "inspect", "memory", "cleanup", "absent"].includes(action));
  assert.equal(typeof remember, "function");
  if (action !== "prepare") validateBrowserFixture(fixture);
  const client = (role) =>
    createClient(ownedApi, ownedToken(keys, role), {
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
    });
  const admin = client("service_role"),
    app = client("anon");
  const ok = (result) => {
    if (result.error) throw new Error("owned_browser_fixture_failed");
    return result.data;
  };
  const password = (run) =>
    createHmac("sha256", keys.jwtSecret)
      .update(`owned-browser-fixture-password-v1:${run}`)
      .digest("hex");
  async function owner() {
    const user = ok(await admin.auth.admin.getUserById(fixture.userId)).user;
    assertFixtureOwner(user, fixture);
    return ok(
      await app.auth.signInWithPassword({ email: fixture.email, password: password(fixture.run) }),
    ).session;
  }
  if (action === "absent") {
    const found = await admin.auth.admin.getUserById(fixture.userId);
    assert.equal(found.error?.status, 404);
    return { completed: true, alreadyClean: true };
  }
  if (action === "prepare") {
    const run = randomUUID(),
      email = `owned-browser-${run}@example.test`;
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password: password(run),
        email_confirm: true,
        app_metadata: { owned_browser_run: run },
        user_metadata: { display_name: "Local browser QA" },
      }),
    ).user;
    fixture = {
      project: ownedProject,
      run,
      email,
      userId: user.id,
      wineId: randomUUID(),
      noteId: randomUUID(),
      shareId: randomUUID(),
      versionId: randomUUID(),
      sessionId: randomUUID(),
    };
    try {
      await remember(validateBrowserFixture(fixture));
      await owner();
      ok(
        await app.from("wines").insert({
          id: fixture.wineId,
          user_id: user.id,
          wine_name: "Local browser QA Chardonnay",
          producer: "Synthetic fixture",
          vintage: 2023,
          wine_type: "white",
          quantity: 2,
          country: "Germany",
          acidity: 8,
          body: 5,
          tannin: 1,
          sweetness: 0,
          fruit: 6,
          oak: 2,
          is_public: true,
          share_id: fixture.shareId,
        }),
      );
      ok(
        await app.from("tasting_notes").insert({
          id: fixture.noteId,
          user_id: user.id,
          wine_id: fixture.wineId,
          notes: "Jag gillar frisk syra. Jag ogillar ekfat.",
          rating: null,
        }),
      );
      const document = {
        title: "Lokalt webblasarprov",
        description: "Syntetiskt recept for funktionsprov.",
        servings: 2,
        totalMinutes: 10,
        image: "none",
        sourceNote: "Local synthetic QA",
        notes: "",
        ingredients: [{ id: randomUUID(), name: "Tomat", amount: 400, unit: "g" }],
        steps: [
          {
            id: randomUUID(),
            title: "Forbered tomaten",
            text: "Syntetiskt steg ett.",
            timerSeconds: 60,
          },
          { id: randomUUID(), title: "Ror om", text: "Syntetiskt steg tva.", timerSeconds: null },
          { id: randomUUID(), title: "Servera", text: "Syntetiskt steg tre.", timerSeconds: null },
        ],
      };
      ok(
        await app.rpc("kitchen_save_recipe", {
          _recipe_id: randomUUID(),
          _version_id: fixture.versionId,
          _expected_revision: 0,
          _document: document,
        }),
      );
      ok(
        await app.rpc("kitchen_save_session", {
          _id: fixture.sessionId,
          _version_id: fixture.versionId,
          _expected_revision: 0,
          _request_id: randomUUID(),
          _feedback: null,
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
        await app.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: ownedApp + "/kitchen" },
        }),
      );
      return {
        completed: true,
        fixture: validateBrowserFixture(fixture),
        login: "local-mail-only",
      };
    } catch {
      assertFixtureOwner(ok(await admin.auth.admin.getUserById(user.id)).user, fixture);
      ok(await admin.auth.admin.deleteUser(user.id));
      throw new Error("owned_browser_prepare_failed");
    }
  }
  if (action === "cleanup") {
    const found = await admin.auth.admin.getUserById(fixture.userId);
    if (!found.data?.user && found.error?.status === 404)
      return { completed: true, alreadyClean: true };
    assertFixtureOwner(ok(found).user, fixture);
    ok(await admin.auth.admin.deleteUser(fixture.userId));
    const after = await admin.auth.admin.getUserById(fixture.userId);
    assert.equal(after.error?.status, 404);
    return { completed: true, cleanupCompleted: true, realAccountsChanged: false };
  }
  const session = await owner();
  if (action === "memory") {
    const response = await fetch(ownedApp + "/api/ai/extract-preference-signals", {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(75000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ tastingNoteId: fixture.noteId }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.signals.length >= 2);
    assert.ok(
      result.signals.some(
        (s) => s.attribute === "acidity" && ["like", "prefer"].includes(s.direction),
      ),
    );
    assert.ok(
      result.signals.some(
        (s) => s.attribute === "oak" && ["dislike", "avoid"].includes(s.direction),
      ),
    );
    const rows = ok(
      await app
        .from("taste_signals")
        .select("attribute,direction,evidence,status")
        .eq("tasting_note_id", fixture.noteId)
        .eq("source", "explicit_feedback")
        .neq("attribute", "feedback"),
    );
    assert.equal(rows.length, result.signals.length);
    assert.ok(rows.every((row) => row.status === "active" && row.evidence.length > 0));
    const anonymous = await client("anon")
      .from("taste_signals")
      .select("id")
      .eq("user_id", fixture.userId);
    assert.ok(
      anonymous.error?.code === "42501" || (!anonymous.error && anonymous.data.length === 0),
    );
    return {
      completed: true,
      liveAiScenarios: 1,
      extractedSignals: rows.length,
      anonymousReadDenied: true,
      realAccountsChanged: false,
    };
  }
  const saved = ok(
    await app
      .from("cooking_sessions")
      .select("state,revision")
      .eq("id", fixture.sessionId)
      .single(),
  );
  return {
    completed: true,
    step: saved.state.activeStep,
    revision: saved.revision,
    servings: saved.state.servings,
    timers: saved.state.timers.length,
    status: saved.state.status,
  };
}
