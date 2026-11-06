// Private stdin only: invoke through test-owned-terra.ps1, never directly.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ownedApi,
  ownedApp,
  ownedToken,
  validateOwnedKeys,
  checkOwnedContainer,
} from "./lib/owned-backend.mjs";
import { acceptOwnedFeatures } from "./lib/owned-features.mjs";
import {
  createTerraEvaluationFactory,
  createSolImageEvaluationFactory,
  solModel,
  terraModel,
  type TerraSample,
} from "./lib/terra-evaluation-client";
import { createAiAccessGuard } from "../supabase/functions/_shared/aiAccess";
import { createLabelReader } from "../supabase/functions/analyze-wine/handler";
import { createHandler as createAsk } from "../supabase/functions/ask-winesnap/handler";
import { createHandler as createTaste } from "../supabase/functions/taste-suggestions/handler";
import { createHandler as createSimilar } from "../supabase/functions/wine-suggestions/handler";
import { createHandler as createRestaurant } from "../supabase/functions/restaurant-match/handler";
import { createHandler as createSignals } from "../supabase/functions/extract-preference-signals/handler";
import { createChefHandler } from "../src/lib/chef.server";

type Fixture = { id: string; email: string; token: string; app: SupabaseClient };
type Context = {
  owner: Fixture;
  peer: Fixture;
  wine: { id: string };
  version: { id: string };
  session: { id: string };
  feedback: { id: string };
};
type Case = { name: string; passed: boolean; status?: number; durationMs: number; detail?: string };
const imageOnly = process.env.WINESNAP_OWNED_TERRA_IMAGE_ONLY === "1";
const solImage = process.env.WINESNAP_OWNED_SOL_IMAGE === "1";
const evaluationModel = solImage ? solModel : terraModel;
const imageAttempts = Number(process.env.WINESNAP_OWNED_TERRA_IMAGE_ATTEMPTS ?? 3);
const report = {
  project: "winesnap-owned-local",
  model: evaluationModel,
  completed: false,
  productionTouched: false,
  configurationChanged: false,
  realAccountsChanged: false,
  liveProvider: true,
  imageOnly,
  labelObservations: [] as {
    scenario: string;
    nameTranscribed: boolean;
    producerMatches: boolean;
    producer: string | null;
    vintage: string | null;
    splitYearTranscribed: boolean;
  }[],
  cases: [] as Case[],
  samples: [] as (TerraSample & { scenario: string })[],
  backend: undefined as unknown,
  cleanupCompleted: false,
  phase: "preflight",
  failure: undefined as string | undefined,
};
const nativeFetch = globalThis.fetch;
let keys: ReturnType<typeof validateOwnedKeys> | undefined,
  scenario = "availability";
const chunks: Buffer[] = [];
const directory = join(
  import.meta.dirname,
  solImage
    ? "../dist/ai-sol-image-evaluation"
    : imageOnly
      ? "../dist/ai-terra-image-evaluation"
      : "../dist/ai-terra-evaluation",
);
const progress = async (phase: string) => {
  report.phase = phase;
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "progress.json"),
    JSON.stringify({
      phase,
      model: evaluationModel,
      cases: report.cases.map((c) => ({ name: c.name, passed: c.passed })),
      providerCalls: report.samples.length,
    }),
  );
};
const sdkOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const checkedFetch: typeof fetch = async (url, init) => {
  const u = new URL(url instanceof Request ? url.url : String(url));
  assert.ok(
    u.origin === ownedApi ||
      (u.origin === "https://api.openai.com" &&
        [
          solImage ? "/v1/chat/completions" : "/v1/responses",
          `/v1/models/${evaluationModel}`,
        ].includes(u.pathname)),
  );
  return nativeFetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(20000),
  });
};
const ok = <T>(result: { data: T; error: unknown }): T => {
  assert.ok(!result.error);
  return result.data;
};
async function command(args: string[]) {
  return new Promise<string>((resolve, reject) =>
    execFile(
      join(process.env.LOCALAPPDATA!, "Programs/DockerDesktop/resources/bin/docker.exe"),
      ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", ...args],
      { windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 },
      (error, stdout) =>
        error ? reject(new Error("owned_evaluation_preflight_failed")) : resolve(stdout),
    ),
  );
}
async function check(name: string, action: () => Promise<void>) {
  scenario = name;
  await progress(name);
  const start = Date.now();
  try {
    await action();
    report.cases.push({ name, passed: true, durationMs: Date.now() - start });
  } catch (error) {
    report.cases.push({
      name,
      passed: false,
      durationMs: Date.now() - start,
      ...(error instanceof Error && /^http_\d{3}$/.test(error.message)
        ? { detail: error.message }
        : {}),
    });
  }
}
async function fixturesImages() {
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
    const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    await page.route("**/*", (route: { abort: () => Promise<void> }) => route.abort());
    await page.setContent(
      '<html lang="sv"><body style="background:white;color:black;font:26px Arial;padding:40px"><h1>VINLISTA</h1><p>Zehn Morgen Kalk &amp; Sandstein 2023</p><p>Chardonnay &amp; Weisser Burgunder, Nahe, Germany</p><p>Flaska 520 SEK</p><hr><p>Guigal Cotes du Rhone Rouge 2022</p><p>Rhone, France. Flaska 610 SEK</p></body></html>',
    );
    const menu = await page.screenshot({ type: "png" });
    await page.setContent('<html><body style="background:white"></body></html>');
    const blank = await page.screenshot({ type: "png" });
    return { menu, blank };
  } finally {
    await browser.close();
  }
}
try {
  assert.equal(process.platform, "win32");
  assert.equal(process.env.WINESNAP_OWNED_TERRA_PIPE, "1");
  assert.ok(!solImage || imageOnly);
  assert.ok(Number.isInteger(imageAttempts) && imageAttempts >= 1 && imageAttempts <= 3);
  assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
  let size = 0;
  for await (const part of process.stdin) {
    size += part.length;
    assert.ok(size <= 32768);
    chunks.push(part);
  }
  const buffer = Buffer.concat(chunks);
  try {
    keys = validateOwnedKeys(JSON.parse(buffer.toString()));
  } finally {
    buffer.fill(0);
  }
  for (const chunk of chunks) chunk.fill(0);
  assert.ok(keys.openai);
  for (const name of ["winesnap-owned-web", "winesnap-owned-auth", "winesnap-owned-gateway"]) {
    const c = JSON.parse(await command(["inspect", name]))[0];
    checkOwnedContainer(c, name, keys.installationId);
    assert.equal(c.State.Running, true);
  }
  await progress("model_access");
  const available = await checkedFetch(`https://api.openai.com/v1/models/${evaluationModel}`, {
    headers: { Authorization: `Bearer ${keys.openai}` },
  });
  if (!available.ok) throw new Error(`model_access_${available.status}`);
  assert.equal((await available.json()).id, evaluationModel);
  const factory = (solImage ? createSolImageEvaluationFactory : createTerraEvaluationFactory)(
    keys.openai,
    (value) => report.samples.push({ ...value, scenario }),
    checkedFetch,
  );
  const candidate = factory("labelReading", () => undefined);
  const ping = await candidate.complete({
    messages: [{ role: "user", content: "Reply with OK." }],
    reasoning_effort: solImage ? "low" : "none",
    max_completion_tokens: solImage ? 256 : 64,
  });
  if (!ping.ok) throw new Error(`model_generation_${ping.status}`);
  const publicKey = ownedToken(keys, "anon"),
    secret = ownedToken(keys, "service_role");
  const clients = (url: string, key: string, options = sdkOptions) => {
    assert.equal(url, ownedApi);
    return createClient(url, key, { ...options, global: { fetch: checkedFetch } });
  };
  const admin = clients(ownedApi, secret);
  const auth = clients(ownedApi, publicKey);
  const environment: Record<string, string> = {
    SUPABASE_URL: ownedApi,
    SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: secret,
  };
  const env = (name: string) => environment[name];
  const access = createAiAccessGuard(env, clients);
  const dependencies = { env, createClient: clients, requireAccess: access, aiClient: factory };
  const handlers: Record<string, (request: Request) => Promise<Response>> = {
    "/api/ai/analyze-wine": createLabelReader(dependencies),
    "/api/ai/ask-winesnap": createAsk(dependencies),
    "/api/ai/taste-suggestions": createTaste(dependencies),
    "/api/ai/wine-suggestions": createSimilar(dependencies),
    "/api/ai/restaurant-match": createRestaurant(dependencies),
    "/api/ai/extract-preference-signals": createSignals(dependencies),
    "/api/chef": createChefHandler({
      enabled: () => true,
      authorize: async (token) => {
        const u = ok(await auth.auth.getUser(token)).user;
        assert.ok(u && u.app_metadata?.owned_feature_run && u.email?.startsWith("owned-features-"));
        return { owner: u.id, admin };
      },
      complete: async (body) => ({ response: await candidate.complete(body), model: terraModel }),
    }),
  };
  const dispatch = async (request: Request) => {
    const url = new URL(request.url);
    assert.equal(url.origin, ownedApp);
    const user = ok(
      await auth.auth.getUser((request.headers.get("authorization") ?? "").replace(/^Bearer /, "")),
    ).user;
    assert.ok(
      user &&
        /^[a-f0-9-]{36}$/.test(user.app_metadata?.owned_feature_run ?? "") &&
        user.email ===
          `owned-features-${user.email?.includes("-owner-") ? "owner" : "peer"}-${user.app_metadata.owned_feature_run}@example.test`,
    );
    const handler = handlers[url.pathname];
    assert.ok(handler);
    return handler(request);
  };
  const post = async (owner: Fixture, path: string, body: object) => {
    const response = await dispatch(
      new Request(ownedApp + path, {
        method: "POST",
        headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) throw new Error(`http_${response.status}`);
    return response.json();
  };
  await progress("fixture_images");
  const images = imageOnly ? undefined : await fixturesImages();
  const originalImage = async (owner: Fixture) => {
    const image = await readFile(
      join(process.env.USERPROFILE!, "OneDrive/Desktop/Winesnap/54456874_400.webp"),
    );
    const r = await post(owner, "/api/ai/analyze-wine", {
      imageBase64: image.toString("base64"),
      mimeType: "image/webp",
      language: "sv",
    });
    const observation = {
      scenario,
      nameTranscribed: /ZEHN\s+MORGEN/i.test(r.wine.label_text),
      producerMatches: /Zehn Morgen/i.test(r.wine.identity.producer.value ?? ""),
      producer:
        typeof r.wine.identity.producer.value === "string"
          ? r.wine.identity.producer.value.slice(0, 100)
          : null,
      vintage: /^\d{4}$/.test(r.wine.identity.vintage.value ?? "")
        ? r.wine.identity.vintage.value
        : null,
      splitYearTranscribed: /\b20\b[\s\S]*\b23\b/.test(r.wine.label_text),
    };
    report.labelObservations.push(observation);
    assert.equal(observation.nameTranscribed, true);
    assert.equal(observation.vintage, "2023");
    assert.equal(observation.producerMatches, true);
  };
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url instanceof Request ? url.url : String(url));
    if (parsed.origin === ownedApp) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      scenario =
        parsed.pathname === "/api/chef"
          ? `chef_${body.action}`
          : parsed.pathname.split("/").at(-1)!;
      const start = Date.now();
      const response = await dispatch(new Request(url, init));
      report.cases.push({
        name: scenario,
        passed: response.ok,
        status: response.status,
        durationMs: Date.now() - start,
      });
      return response;
    }
    return checkedFetch(url, init);
  };
  report.backend = await acceptOwnedFeatures(keys, {
    liveAi: !imageOnly,
    progress: (p: string) => {
      report.phase = p;
    },
    beforeCleanup: async ({ owner, wine, version }: Context) => {
      if (imageOnly) {
        for (let attempt = 1; attempt <= imageAttempts; attempt++)
          await check(`label_original_repeat_${attempt}`, () => originalImage(owner));
        return;
      }
      await check("label_text", async () => {
        const r = await post(owner, "/api/ai/analyze-wine", {
          text: "Zehn Morgen Kalk & Sandstein 2023 Chardonnay & Weisser Burgunder Nahe Germany",
          language: "sv",
        });
        assert.match(r.wine.label_text, /Zehn Morgen/i);
        assert.equal(r.wine.identity.vintage.value, "2023");
      });
      await check("label_original_image", () => originalImage(owner));
      await check("blank_image_no_invented_identity", async () => {
        const r = await post(owner, "/api/ai/analyze-wine", {
          imageBase64: images!.blank.toString("base64"),
          mimeType: "image/png",
          language: "sv",
        });
        assert.equal(r.wine.identity.producer.value, null);
        assert.equal(r.wine.identity.vintage.value, null);
      });
      await check("restaurant_camera_menu", async () => {
        const r = await post(owner, "/api/ai/restaurant-match", {
          image: `data:image/png;base64,${images!.menu.toString("base64")}`,
          language: "sv",
          constraints: { dish: "Ugnsbakad fisk med citron", maxPrice: 600, mode: "balanced" },
        });
        assert.equal(r.extracted_wines.length, 2);
        assert.ok(r.picks.length > 0);
        assert.ok(r.extracted_wines.some((w: { price_amount: number }) => w.price_amount === 520));
      });
      await check("wine_preference_extraction", async () => {
        const note = ok(
          await owner.app
            .from("tasting_notes")
            .insert({
              user_id: owner.id,
              wine_id: wine.id,
              rating: 4,
              notes: "Jag gillar frisk syra och citrus. Jag ogillar mycket ek.",
            })
            .select("id")
            .single(),
        );
        const r = await post(owner, "/api/ai/extract-preference-signals", {
          tastingNoteId: note.id,
        });
        assert.ok(r.signals.length > 0);
      });
      await check("cook_mode_assistance", async () => {
        const s = ok(
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
        const r = await post(owner, "/api/chef", {
          action: "chat",
          requestId: randomUUID(),
          conversationId: randomUUID(),
          conversationRevision: 0,
          context: { recipeVersionId: version.id, sessionId: s.id, sessionRevision: s.revision },
          message: "Forklara det aktiva steget kort. Andra inte receptet eller timern.",
        });
        assert.ok(r.answer?.length > 10);
        assert.equal(r.model, terraModel);
      });
      await check("wine_chat_english", async () => {
        const r = await post(owner, "/api/ai/ask-winesnap", {
          message: "Suggest a simple dish for my saved white wine. Be brief.",
          language: "en",
          context: { source: "wine", wineId: wine.id, route: `/wine/${wine.id}` },
        });
        assert.ok(r.message?.content.length > 10);
      });
    },
  });
  const backend = report.backend as { cleanupCompleted: boolean; completed: boolean };
  report.cleanupCompleted = backend.cleanupCompleted;
  report.completed = backend.completed && report.cases.every((c) => c.passed);
} catch (error) {
  report.failure =
    error instanceof Error && /^(model_(access|generation)_\d{3})$/.test(error.message)
      ? error.message
      : "owned_terra_evaluation_incomplete";
} finally {
  globalThis.fetch = nativeFetch;
  for (const chunk of chunks) chunk.fill(0);
  keys = undefined;
  await mkdir(directory, { recursive: true });
  const tokens = report.samples.reduce(
    (sum, s) => ({
      input: sum.input + s.inputTokens,
      output: sum.output + s.outputTokens,
      cached: sum.cached + s.cachedTokens,
    }),
    { input: 0, output: 0, cached: 0 },
  );
  const final = {
    ...report,
    totals: {
      ...tokens,
      providerCalls: report.samples.length,
      estimatedUsd:
        ((tokens.input - tokens.cached + tokens.cached * 0.05 + tokens.output * 5) *
          (solImage ? 2 : 1)) /
        1e6,
    },
    checkedAt: new Date().toISOString(),
  };
  await writeFile(join(directory, "report.json"), JSON.stringify(final, null, 2));
  console.log(JSON.stringify(final));
  if (!report.completed) process.exitCode = 1;
}
