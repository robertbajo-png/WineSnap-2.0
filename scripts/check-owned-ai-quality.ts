// Private stdin only. Invoke through test-owned-ai-quality.ps1, never directly.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ownedApi,
  ownedApp,
  validateOwnedKeys,
  ownedToken,
  checkOwnedContainer,
} from "./lib/owned-backend.mjs";
import {
  ownedBrowserFixture,
  validateBrowserFixture,
  assertFixtureOwner,
} from "./lib/owned-browser-fixture.mjs";
import {
  liveQualityIds,
  freshQualityCase,
  liveQualityReportSchema,
  maySendQualityCase,
  type LiveQualityCase,
  type LiveQualityReport,
} from "./lib/ai-quality-live-contract";
import { createAiClient } from "../supabase/functions/_shared/aiClient";
import { AI_MODELS } from "../supabase/functions/_shared/aiModels";
import { createAiAccessGuard } from "../supabase/functions/_shared/aiAccess";
import { createLabelReader } from "../supabase/functions/analyze-wine/handler";
import { createHandler as createAsk } from "../supabase/functions/ask-winesnap/handler";
import { createHandler as createSuggestions } from "../supabase/functions/wine-suggestions/handler";
import { SUGGESTION_CATALOG } from "../supabase/functions/_shared/suggestionCatalog";
import { createChefHandler } from "../src/lib/chef.server";
import {
  savedSessionSchema,
  versionSchema,
  type RecipeVersion,
} from "../src/features/kitchen/domain";

const nativeFetch = globalThis.fetch;
const reportDirectory = resolve(import.meta.dirname, "../dist/ai-quality-live");
const reportFile = join(reportDirectory, "report.json");
let report: LiveQualityReport = {
  suite: "winesnap-ai-quality-live-v1",
  project: "winesnap-owned-local",
  completed: false,
  finished: false,
  cleanupCompleted: false,
  backendVerified: null,
  productionTouched: false,
  configurationChanged: false,
  realAccountsChanged: false,
  liveProvider: true,
  sourceHandlers: true,
  browserVerified: false,
  semanticQualityVerified: false,
  medicalSafetyCertified: false,
  cases: [],
  failure: "none",
  checkedAt: new Date().toISOString(),
};
let directorySafe = false,
  active: LiveQualityCase | null = null,
  sent = 0;
let keys: ReturnType<typeof validateOwnedKeys> | undefined;
const fixtures: ReturnType<typeof validateBrowserFixture>[] = [];
const privateIds = new Set<string>();
const chunks: Buffer[] = [];
async function prepareDirectory() {
  for (let path = reportDirectory; ; path = dirname(path)) {
    assert.ok(!/[\\/]OneDrive[^\\/]*(?:[\\/]|$)/i.test(path));
    try {
      assert.equal((await lstat(path)).isSymbolicLink(), false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(path) === path) break;
  }
  await mkdir(reportDirectory, { recursive: true });
  directorySafe = true;
}
async function checkpoint() {
  assert.equal(directorySafe, true);
  report.checkedAt = new Date().toISOString();
  const safe = liveQualityReportSchema.parse(report);
  const temporary = join(reportDirectory, "checkpoint-" + randomUUID() + ".tmp");
  await writeFile(temporary, JSON.stringify(safe), { flag: "wx", mode: 0o600 });
  await rename(temporary, reportFile);
}
function ok<T extends { data: unknown; error: unknown }>(value: T): NonNullable<T["data"]> {
  assert.equal(value.error, null);
  assert.notEqual(value.data, null);
  return value.data as NonNullable<T["data"]>;
}
const checkedFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.username + url.password + url.hash, "");
  if (url.origin === ownedApi)
    return nativeFetch(input, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(20000),
    });
  try {
    assert.ok(active && maySendQualityCase(active));
    const openai = url.href === "https://api.openai.com/v1/chat/completions";
    assert.ok(
      openai ||
        url.href === "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, openai ? AI_MODELS.labelReading : AI_MODELS.fast);
    assert.equal(body.stream, false);
    if (openai) assert.equal(body.store, false);
    const serialized = JSON.stringify(body);
    for (const id of privateIds) assert.equal(serialized.includes(id), false);
    assert.ok(sent < 8);
    active.outboundAttempts = 1;
    sent++;
    // Persist a replay barrier before any possibly billable request leaves the process.
    await checkpoint();
    return nativeFetch(input, { ...init, redirect: "error", cache: "no-store" });
  } catch (error) {
    if (active) active.failureKind = "request_blocked";
    throw error;
  }
};
let dispatch: (request: Request) => Promise<Response>;
async function cleanupPriorFixtures() {
  for (const role of ["owner", "peer"]) {
    const path = join(process.env.USERPROFILE!, "WineSnapOwned", `ai-quality-${role}-fixture.json`);
    try {
      const info = await lstat(path);
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 16384);
      const fixture = validateBrowserFixture(JSON.parse(await readFile(path, "utf8")));
      const result = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, {
        cleanupMeals: true,
        cleanupMemory: true,
      });
      assert.ok(result.cleanupCompleted || result.alreadyClean);
      assert.equal((await ownedBrowserFixture(keys, "absent", fixture)).alreadyClean, true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
type QualityActor = { id: string; email: string; app: SupabaseClient; token: string };
async function acceptQualityFixtures(
  beforeCleanup: (value: {
    owner: QualityActor;
    peer: QualityActor;
    wine: { id: string };
    version: RecipeVersion;
  }) => Promise<void>,
) {
  const actors: QualityActor[] = [];
  let completed = false,
    cleaned = true;
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: checkedFetch },
  };
  try {
    for (const role of ["owner", "peer"]) {
      const path = join(
        process.env.USERPROFILE!,
        "WineSnapOwned",
        `ai-quality-${role}-fixture.json`,
      );
      let hadPrevious = false;
      try {
        const info = await lstat(path);
        assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 16384);
        const previous = validateBrowserFixture(JSON.parse(await readFile(path, "utf8")));
        await ownedBrowserFixture(keys, "cleanup", previous, undefined, {
          cleanupMeals: true,
          cleanupMemory: true,
        });
        hadPrevious = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const created = await ownedBrowserFixture(
        keys,
        "prepare",
        undefined,
        async (value?: unknown) => {
          const fixture = validateBrowserFixture(value);
          fixtures.push(fixture);
          await writeFile(path, JSON.stringify(fixture), {
            flag: hadPrevious ? "w" : "wx",
            mode: 0o600,
          });
        },
      );
      const fixture = validateBrowserFixture(created.fixture);
      const app = createClient(ownedApi, ownedToken(keys!, "anon"), options);
      const password = createHmac("sha256", keys!.jwtSecret)
        .update(`owned-browser-fixture-password-v1:${fixture.run}`)
        .digest("hex");
      const signed = ok(await app.auth.signInWithPassword({ email: fixture.email, password }));
      assertFixtureOwner(signed.user, fixture);
      actors.push({
        id: fixture.userId,
        email: fixture.email,
        app,
        token: signed.session!.access_token,
      });
    }
    const owner = actors[0],
      peer = actors[1],
      fixture = fixtures[0];
    const wine = ok(await owner.app.from("wines").select("id").eq("id", fixture.wineId).single());
    const version = versionSchema.parse(
      ok(
        await owner.app
          .from("kitchen_recipe_versions")
          .select("*")
          .eq("id", fixture.versionId)
          .single(),
      ),
    );
    const session = savedSessionSchema.parse(
      ok(await owner.app.from("cooking_sessions").select("*").eq("id", fixture.sessionId).single()),
    );
    ok(
      await owner.app.rpc("kitchen_save_session", {
        _id: session.id,
        _version_id: version.id,
        _expected_revision: session.revision,
        _request_id: randomUUID(),
        _state: { ...session.state, status: "abandoned", timers: [] },
      }),
    );
    await beforeCleanup({ owner, peer, wine, version });
    completed = true;
  } catch {
    completed = false;
  } finally {
    for (const fixture of fixtures) {
      try {
        const result = await ownedBrowserFixture(keys, "cleanup", fixture, undefined, {
          cleanupMeals: true,
          cleanupMemory: true,
        });
        assert.ok(result.cleanupCompleted || result.alreadyClean);
        assert.equal((await ownedBrowserFixture(keys, "absent", fixture)).alreadyClean, true);
      } catch {
        cleaned = false;
      }
    }
  }
  return { completed, cleanupCompleted: cleaned && fixtures.length === 2 };
}
async function inspectContainer(name: string, installation: string) {
  const raw = await new Promise<string>((resolve, reject) =>
    execFile(
      join(process.env.LOCALAPPDATA!, "Programs/DockerDesktop/resources/bin/docker.exe"),
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", "inspect", name],
      { windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 },
      (error, stdout) => (error ? reject(Error("quality_container_unavailable")) : resolve(stdout)),
    ),
  );
  const value = JSON.parse(raw)[0];
  checkOwnedContainer(value, name, installation);
  assert.equal(value.State.Running, true);
}
async function images() {
  const pw = await import(
    pathToFileURL(
      join(
        process.env.USERPROFILE!,
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
      ),
    ).href
  );
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
    await page.route("**/*", (route: { abort: () => Promise<void> }) => route.abort());
    await page.setContent(
      '<html><body style="background:white;color:black;text-align:center;padding:90px 20px;font:36px Arial"><h1>ZEHN MORGEN</h1><p>KALK &amp; SANDSTEIN</p><p>CHARDONNAY &amp;<br>WEISSER BURGUNDER</p><h2>20 &nbsp; 23</h2><p>NAHE<br>GERMANY</p></body></html>',
    );
    const label = await page.screenshot({ type: "png" });
    await page.setContent('<html><body style="background:white"></body></html>');
    const blank = await page.screenshot({ type: "png" });
    return { label, blank };
  } finally {
    await browser.close();
  }
}
try {
  assert.equal(process.platform, "win32");
  assert.equal(process.env.WINESNAP_OWNED_QUALITY_PIPE, "1");
  assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    assert.ok(bytes <= 32768);
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  try {
    keys = validateOwnedKeys(JSON.parse(input.toString("utf8")));
  } finally {
    input.fill(0);
  }
  for (const chunk of chunks) chunk.fill(0);
  assert.ok(keys.openai && keys.gemini);
  for (const value of [keys.openai, keys.gemini, keys.jwtSecret, keys.dbPassword])
    privateIds.add(value);
  await prepareDirectory();
  try {
    const info = await lstat(reportFile);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 128000);
    const prior = liveQualityReportSchema.parse(JSON.parse(await readFile(reportFile, "utf8")));
    report.cases = prior.cases.filter((c) => c.outboundAttempts === 1);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const name of ["winesnap-owned-web", "winesnap-owned-auth", "winesnap-owned-gateway"])
    await inspectContainer(name, keys.installationId);
  await cleanupPriorFixtures();
  if (report.cases.length === liveQualityIds.length) {
    report.finished = true;
    report.cleanupCompleted = false;
    report.failure = "owned_ai_quality_incomplete";
    // The prior report remains authoritative, including cleanup and failed/unknown cases.
    report = liveQualityReportSchema.parse(JSON.parse(await readFile(reportFile, "utf8")));
    report.cleanupCompleted = true;
  } else {
    const publicKey = ownedToken(keys, "anon"),
      serviceKey = ownedToken(keys, "service_role");
    const clients = (
      url: string,
      key: string,
      options = { auth: { persistSession: false, autoRefreshToken: false } },
    ) => {
      assert.equal(url, ownedApi);
      return createClient(url, key, { ...options, global: { fetch: checkedFetch } });
    };
    const admin = clients(ownedApi, serviceKey),
      auth = clients(ownedApi, publicKey);
    async function actor(token: string) {
      const user = ok(await auth.auth.getUser(token)).user;
      assert.ok(user);
      const fixture = fixtures.find((candidate) => candidate.userId === user?.id);
      assert.ok(fixture);
      assertFixtureOwner(user, fixture);
      return user;
    }
    const env = (name: string) =>
      ({
        SUPABASE_URL: ownedApi,
        SUPABASE_ANON_KEY: publicKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        OPENAI_API_KEY: keys!.openai,
        GEMINI_API_KEY: keys!.gemini,
        OPENAI_LABEL_MODEL: AI_MODELS.labelReading,
        GEMINI_FAST_MODEL: AI_MODELS.fast,
        GEMINI_TRANSIENT_RETRY_ENABLED: "false",
        WINESNAP_OWNED_BACKEND_ENABLED: "true",
      })[name];
    const factory: typeof createAiClient = (workload) =>
      createAiClient(workload, env, checkedFetch, (sample) => {
        assert.ok(active);
        active.observation = sample;
      });
    const dependencies = {
      env,
      createClient: clients,
      requireAccess: createAiAccessGuard(env, clients),
      aiClient: factory,
    };
    const fast = factory("fast", env);
    const chef = createChefHandler({
      enabled: () => true,
      authorize: async (token) => ({ owner: (await actor(token)).id, admin }),
      complete: async (body, observe) => {
        const response = await createAiClient("fast", env, checkedFetch, (sample) => {
          assert.ok(active);
          active.observation = sample;
          observe?.(sample);
        }).complete(body, 45000);
        return { response, model: fast.model, observation: active?.observation ?? undefined };
      },
    });
    const handlers = {
      "/api/ai/analyze-wine": createLabelReader(dependencies),
      "/api/ai/ask-winesnap": createAsk(dependencies),
      "/api/ai/wine-suggestions": createSuggestions(dependencies),
      "/api/chef": chef,
    };
    dispatch = async (request) => {
      const url = new URL(request.url);
      assert.equal(url.origin, ownedApp);
      await actor((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
      const handler = handlers[url.pathname as keyof typeof handlers];
      assert.ok(handler);
      return handler(request);
    };
    const pictures = await images();
    globalThis.fetch = checkedFetch;
    const backend = await acceptQualityFixtures(async ({ owner, peer, wine, version }) => {
      for (const user of [owner, peer]) {
        await actor(user.token);
        privateIds.add(user.id);
        privateIds.add(user.email);
      }
      for (const fixture of fixtures)
        for (const value of Object.values(fixture))
          if (typeof value === "string" && /^[a-f0-9-]{36}$/.test(value)) privateIds.add(value);
      for (const id of [wine.id, version.id, version.recipe_id]) privateIds.add(id);
      ok(
        await owner.app
          .from("wines")
          .update({
            producer: "Synthetic cellar",
            wine_name: "QA Chardonnay",
            vintage: null,
            is_public: false,
          })
          .eq("id", wine.id),
      );
      ok(
        await owner.app.rpc("food_memory_change", {
          _action: "add",
          _id: randomUUID(),
          _entry: { attribute: "ingredient", value: "svamp", direction: -1 },
        }),
      );
      const empty = { recipeVersionId: null, sessionId: null, sessionRevision: null };
      const post = async (path: string, body: object) => {
        const response = await dispatch(
          new Request(ownedApp + path, {
            method: "POST",
            headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        active!.routeStatus = response.status;
        assert.ok(response.ok);
        return response.json();
      };
      const recipe = (action: "generate" | "adapt") =>
        post("/api/chef", {
          action,
          requestId: randomUUID(),
          context: action === "adapt" ? { ...empty, recipeVersionId: version.id } : empty,
          prompt: "En enkel tomatsoppa utan svamp. Bevara tomat som ingrediens. Svara pa svenska.",
          servings: 2,
          maxMinutes: 20,
        });
      for (const id of liveQualityIds) {
        if (report.cases.some((c) => c.id === id && c.outboundAttempts === 1)) continue;
        const row = freshQualityCase(id);
        report.cases.push(row);
        active = row;
        const started = Date.now();
        await checkpoint();
        try {
          if (id === "LIVE-01" || id === "LIVE-02") {
            const data = await post("/api/ai/analyze-wine", {
              imageBase64: (id === "LIVE-01" ? pictures.label : pictures.blank).toString("base64"),
              mimeType: "image/png",
              language: "sv",
            });
            const identity = data.wine.identity;
            if (id === "LIVE-01") {
              assert.match(String(identity.producer?.value ?? ""), /zehn\s+morgen/i);
              assert.equal(String(identity.vintage?.value), "2023");
              assert.match(data.wine.label_text, /zehn\s+morgen/i);
            } else {
              for (const field of ["producer", "wine_name", "vintage", "country", "region"])
                assert.equal(identity[field]?.value ?? null, null);
              assert.equal(identity.grape_varieties?.length ?? 0, 0);
            }
          } else if (id === "LIVE-03" || id === "LIVE-04") {
            const data = await recipe(id === "LIVE-03" ? "generate" : "adapt");
            assert.equal(data.draft.servings, 2);
            assert.ok(data.draft.totalMinutes <= 20);
            assert.ok(data.draft.ingredients.some((i: { name: string }) => /tomat/i.test(i.name)));
            assert.ok(
              data.draft.ingredients.every(
                (i: { name: string }) => !/svamp|mushroom/i.test(i.name),
              ),
            );
          } else if (id === "LIVE-05") {
            const session = ok(
              await owner.app.rpc("kitchen_save_session", {
                _id: randomUUID(),
                _version_id: version.id,
                _expected_revision: 0,
                _request_id: randomUUID(),
                _state: {
                  status: "running",
                  activeStep: 1,
                  servings: 4,
                  checkedIngredientIds: [],
                  timers: [],
                },
              }),
            );
            privateIds.add(session.id);
            try {
              const data = await post("/api/chef", {
                action: "chat",
                requestId: randomUUID(),
                conversationId: randomUUID(),
                conversationRevision: 0,
                context: {
                  recipeVersionId: version.id,
                  sessionId: session.id,
                  sessionRevision: session.revision,
                },
                message:
                  "Vilket steg ar aktivt och hur mycket tomat behovs for de valda fyra portionerna? Svara kort pa svenska. Andra ingenting.",
              });
              assert.match(data.answer, /\b800\b/);
              assert.match(data.answer, /tomat/i);
              assert.match(data.answer, /steg\s*2|andra|r[o\u00f6]r\s+om|sjud|koka|puttra/i);
              const after = ok(
                await owner.app
                  .from("cooking_sessions")
                  .select("state")
                  .eq("id", session.id)
                  .single(),
              );
              assert.deepEqual(after.state, session.state);
            } finally {
              ok(
                await owner.app.rpc("kitchen_save_session", {
                  _id: session.id,
                  _version_id: version.id,
                  _expected_revision: session.revision,
                  _request_id: randomUUID(),
                  _state: { ...session.state, status: "abandoned", timers: [] },
                }),
              );
            }
          } else if (id === "LIVE-06") {
            const data = await post("/api/ai/ask-winesnap", {
              message:
                "Finns verifierad information om argang och aktuellt pris for mitt valda vin? Gissa inte. Svara kort pa svenska om vad som ar okant.",
              language: "sv",
              context: { source: "wine", wineId: wine.id, route: "/wine/" + wine.id },
            });
            const answer = data.message.content;
            assert.match(answer, /okänd|okant|sakna|inte|ingen|underlag|osäker/i);
            assert.doesNotMatch(
              answer,
              /\b(?:19|20)\d{2}\b|\b\d+(?:[.,]\d+)?\s*(?:kr|SEK|EUR|USD)\b/i,
            );
          } else if (id === "LIVE-07") {
            const data = await post("/api/ai/wine-suggestions", {
              wineId: wine.id,
              language: "sv",
            });
            assert.ok(data.suggestions.length > 0);
            for (const suggestion of data.suggestions) {
              assert.ok(SUGGESTION_CATALOG.some((s) => s.catalog_id === suggestion.catalog_id));
              assert.equal(suggestion.identity_verified, true);
              assert.match(suggestion.source_url, /^https:\/\//);
              assert.equal(Object.hasOwn(suggestion, "price"), false);
            }
          } else {
            const session = ok(
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
            const note = "Jag gillar svamp och jag ogillar svamp. Det beror pa hur den lagas.";
            ok(
              await owner.app.rpc("kitchen_save_session", {
                _id: session.id,
                _version_id: version.id,
                _expected_revision: session.revision,
                _request_id: randomUUID(),
                _state: { ...session.state, status: "completed" },
                _feedback: { rating: 4, note },
              }),
            );
            const source = ok(
              await owner.app
                .from("cooking_feedback")
                .select("id")
                .eq("session_id", session.id)
                .single(),
            );
            privateIds.add(session.id);
            privateIds.add(source.id);
            const confirmed = ok(
              await owner.app.from("food_signals").select("id").eq("status", "confirmed"),
            );
            const data = await post("/api/chef", {
              action: "extract",
              requestId: randomUUID(),
              context: empty,
              feedbackId: source.id,
            });
            const candidates = ok(
              await owner.app
                .from("food_signals")
                .select("status,source_excerpt")
                .eq("source_feedback_id", source.id),
            );
            assert.equal(candidates.length, data.candidateCount);
            assert.ok(
              candidates.every(
                (c: { status: string; source_excerpt: string }) =>
                  c.status === "pending" && note.includes(c.source_excerpt),
              ),
            );
            const after = ok(
              await owner.app.from("food_signals").select("id").eq("status", "confirmed"),
            );
            assert.deepEqual(
              after.map((c: { id: string }) => c.id).sort(),
              confirmed.map((c: { id: string }) => c.id).sort(),
            );
          }
          assert.equal(row.outboundAttempts, 1);
          row.passed = true;
          row.failureKind = "none";
        } catch {
          if (row.failureKind !== "request_blocked")
            row.failureKind =
              row.routeStatus && row.routeStatus >= 400 ? "http_error" : "content_gate";
        } finally {
          row.durationMs = Date.now() - started;
          active = null;
          await checkpoint();
        }
      }
    });
    report.backendVerified = backend.completed;
    report.cleanupCompleted = backend.cleanupCompleted;
    report.finished = true;
    report.completed =
      backend.completed && report.cases.length === 8 && report.cases.every((c) => c.passed);
  }
} catch {
  report.failure = "owned_ai_quality_incomplete";
  report.completed = false;
} finally {
  globalThis.fetch = nativeFetch;
  active = null;
  keys = undefined;
  for (const chunk of chunks) chunk.fill(0);
  if (!report.completed) report.failure = "owned_ai_quality_incomplete";
  if (directorySafe) await checkpoint();
  const safe = liveQualityReportSchema.parse(report);
  process.stdout.write(JSON.stringify(safe) + "\n");
  if (!safe.completed) process.exitCode = 1;
}
