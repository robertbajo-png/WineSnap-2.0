// Only test-owned-ai-quality.ps1 -MealPhoto supplies the existing credential.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  createMealPhotoHandler,
  createOwnedMealPhotoCompletion,
} from "../src/lib/mealPhoto.server";
import { encodeMealPhotoFrame, mealPhotoFrame } from "../src/lib/mealPhotoFrame.server";
import { mealPhotoEstimateSchema } from "../src/features/meal-photos/domain";
import {
  gradeMealPhoto,
  mealPhotoCases,
  mealPhotoFixture,
} from "./lib/meal-photo-quality-fixtures";

const project = "winesnap-owned-local";
const model = "gpt-6.2-sol";
const suite = "winesnap-meal-photo-live-v1";
const endpoint = "https://api.openai.com/v1/responses";
const auth = "Bearer synthetic-meal-photo-quality";
const acquire = globalThis.fetch;
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "dist", "meal-photo-quality-live");
const keySchema = z.strictObject({
  project: z.literal(project),
  openai: z.string().regex(/^sk-[A-Za-z0-9_-]{20,4093}$/),
});
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Row = {
  id: (typeof mealPhotoCases)[number];
  sent: boolean;
  replayGuarded: boolean;
  handlerStatus?: number;
  providerStatus?: number;
  failure?: "guard" | "credential" | "provider_http" | "network" | "handler" | "criteria";
  grade?: ReturnType<typeof gradeMealPhoto>;
};
const report = {
  suite,
  model,
  project,
  syntheticOnly: true,
  sourceHandler: true,
  authSimulated: true,
  installedAppTouched: false,
  productionTouched: false,
  configurationChanged: false,
  externalCalls: 0,
  completed: false,
  checkedAt: new Date().toISOString(),
  cases: [] as Row[],
  failure: undefined as
    | "private_input_or_local_preflight"
    | "quality_not_proven"
    | "replay_blocked"
    | undefined,
};
let reportDirectoryReady = false;

async function inputKey() {
  assert.equal(process.argv.length, 2);
  assert.equal(process.env.WINESNAP_OWNED_MEAL_PHOTO_QUALITY_PIPE, "1");
  assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of process.stdin) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(part);
      bytes += part.length;
      assert.ok(bytes <= 8192);
    }
    const raw = Buffer.concat(chunks);
    try {
      return keySchema.parse(JSON.parse(raw.toString())).openai;
    } finally {
      raw.fill(0);
    }
  } finally {
    for (const part of chunks) part.fill(0);
  }
}

async function checkPath(path: string) {
  for (let current = path; ; current = dirname(current)) {
    assert.ok(!/(?:^|[\\/])OneDrive[^\\/]*(?:[\\/]|$)/i.test(current));
    try {
      assert.equal((await lstat(current)).isSymbolicLink(), false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(current) === current) break;
  }
}

async function run() {
  const key = await inputKey();
  await checkPath(directory);
  await mkdir(directory, { recursive: true });
  await checkPath(await realpath(directory));
  reportDirectoryReady = true;
  for (const id of mealPhotoCases) {
    const row: Row = { id, sent: false, replayGuarded: false };
    report.cases.push(row);
    const { pixels, width, height } = mealPhotoFixture(id);
    const request = () =>
      new Request("http://127.0.0.1/api/ai/analyze-meal-photo", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/octet-stream",
          "X-Meal-Photo-Width": String(width),
          "X-Meal-Photo-Height": String(height),
          "X-Meal-Photo-Language": "sv",
        },
        body: pixels,
      });
    const forDigest = request();
    const frame = mealPhotoFrame(forDigest);
    assert.ok(frame);
    const png = await encodeMealPhotoFrame(forDigest, frame, AbortSignal.timeout(10_000));
    assert.ok(png);
    const expectedImage = "data:image/png;base64," + png.toString("base64");
    const transport: typeof fetch = async (target, init) => {
      try {
        assert.equal(String(target), endpoint);
        assert.equal(init?.method, "POST");
        assert.ok(new Headers(init.headers).get("authorization") === "Bearer " + key);
        assert.equal(typeof init.body, "string");
        const body = JSON.parse(String(init.body));
        assert.equal(body.model, model);
        assert.equal(body.store, false);
        assert.equal(body.stream, false);
        assert.equal(body.max_output_tokens, 2500);
        assert.equal(body.input.length, 2);
        assert.equal(body.input[0].role, "system");
        assert.equal(body.input[1].role, "user");
        assert.equal(body.input[1].content.length, 1);
        assert.equal(body.input[1].content[0].type, "input_image");
        assert.ok(body.input[1].content[0].image_url === expectedImage);
        assert.equal(body.text.format.name, "meal_photo_estimate");
        assert.equal(body.text.format.strict, true);
        assert.ok(!row.sent && report.externalCalls < mealPhotoCases.length);
        const barrier = join(directory, `attempt-${sha256(String(init.body))}.json`);
        try {
          await writeFile(
            barrier,
            JSON.stringify({ suite, id, model, at: new Date().toISOString() }),
            { flag: "wx", mode: 0o600 },
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") row.replayGuarded = true;
          throw error;
        }
      } catch {
        row.failure = "guard";
        throw new Error("Synthetic meal photo quality request blocked");
      }
      row.sent = true;
      report.externalCalls++;
      try {
        const response = await acquire(target, { ...init, redirect: "error", cache: "no-store" });
        row.providerStatus = response.status;
        if (!response.ok)
          row.failure = [401, 403].includes(response.status) ? "credential" : "provider_http";
        return response;
      } catch {
        row.failure = "network";
        throw new Error("Synthetic meal photo quality network request failed");
      }
    };
    const handle = createMealPhotoHandler({
      enabled: () => true,
      async requireAccess(req) {
        assert.equal(req.headers.get("authorization"), auth);
        return { userId: "baa00000-0000-4000-8000-000000000001" };
      },
      complete: createOwnedMealPhotoCompletion(key, model, transport),
    });
    const response = await handle(request());
    row.handlerStatus = response.status;
    if (!response.ok) {
      row.failure ??= "handler";
      await response.body?.cancel();
      break;
    }
    assert.equal(response.headers.get("cache-control"), "no-store");
    const parsed = mealPhotoEstimateSchema.parse(await response.json());
    row.grade = gradeMealPhoto(id, parsed);
    if (!row.grade.passed) row.failure = "criteria";
  }
  report.completed =
    report.cases.length === mealPhotoCases.length &&
    report.cases.every((row) => row.sent && row.grade?.passed);
  if (!report.completed)
    report.failure = report.cases.some((row) => row.replayGuarded)
      ? "replay_blocked"
      : "quality_not_proven";
}

try {
  await run();
} catch {
  report.failure = "private_input_or_local_preflight";
}
if (reportDirectoryReady) {
  try {
    const name = "run-" + report.checkedAt.replace(/[:.]/g, "-") + ".json";
    await writeFile(join(directory, name), JSON.stringify(report, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    report.failure = "private_input_or_local_preflight";
    report.completed = false;
  }
}
console.log(JSON.stringify(report));
if (!report.completed) process.exitCode = 1;
