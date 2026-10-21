import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Deliberately no URL/project/credential-file arguments or production fallback.
const origin = "https://pzniyupmgwvlldvztzqh.supabase.co";
assert.equal(process.argv.length, 2, "This test accepts no connection arguments");
const publicKey = process.env.WINESNAP_TEST_PUBLISHABLE_KEY;
const secretKey = process.env.WINESNAP_TEST_SECRET_KEY;
assert.ok(publicKey && secretKey, "Test-only environment credentials required");
const testFetch = (input, init) => {
  assert.equal(new URL(input instanceof Request ? input.url : String(input)).origin, origin);
  return fetch(input, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: testFetch },
};
const admin = createClient(origin, secretKey, options);
const users = [];
const objects = [];
const results = [];
let cleanupFailures = 0;
let completed = false;
const ok = ({ data, error }) => {
  if (error) throw new Error("test_api_failure");
  return data;
};
async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch {
    results.push({ name, passed: false });
    console.log(`FAIL ${name}`);
  }
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=",
  "base64",
);
try {
  for (let i = 0; i < 2; i++) {
    const email = `winesnap-image-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const fixture = { id: user.id };
    users.push(fixture);
    fixture.client = createClient(origin, publicKey, options);
    const { session } = ok(await fixture.client.auth.signInWithPassword({ email, password }));
    fixture.token = session.access_token;
  }
  const [owner, stranger] = users;
  const path = `${owner.id}/${randomUUID()}.png`;
  const upload = async (name) => {
    ok(
      await owner.client.storage
        .from("wine-labels")
        .upload(name, png, { contentType: "image/png", cacheControl: "0" }),
    );
    objects.push(name);
  };
  await upload(path);
  const wine = ok(
    await owner.client
      .from("wines")
      .insert({
        user_id: owner.id,
        wine_name: "Synthetic proxy test",
        image_url: path,
        is_public: false,
      })
      .select("id")
      .single(),
  );
  ok(
    await owner.client.from("wine_photos").insert({
      wine_id: wine.id,
      user_id: owner.id,
      url: path,
      storage_path: path,
      kind: "label",
    }),
  );
  const image = (token, value = path) =>
    testFetch(`${origin}/functions/v1/wine-image`, {
      method: "POST",
      headers: {
        apikey: publicKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path: value }),
    });
  const expectImage = async (response) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.notEqual(response.headers.get("cf-cache-status"), "HIT");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  };
  const expectDenied = async (response, status = 404) => {
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    await response.body?.cancel();
  };
  const directDenied = async (client) => {
    const result = await client.storage.from("wine-labels").download(path);
    assert.equal(result.data, null);
    assert.ok([400, 401, 403, 404].includes(result.error?.status));
  };
  await check("owner receives private PNG through non-cacheable proxy", () =>
    image(owner.token).then(expectImage),
  );
  await check("stranger cannot read private PNG", () =>
    image(stranger.token).then((r) => expectDenied(r)),
  );
  await check("anonymous cannot read private PNG", () => image(null).then((r) => expectDenied(r)));
  await check("invalid JWT is not downgraded to anonymous", () =>
    image("invalid-synthetic-token").then((r) => expectDenied(r, 401)),
  );
  await check("unsafe path cannot escape the fixed image bucket", () =>
    image(owner.token, "../other-bucket/image.png").then((r) => expectDenied(r, 400)),
  );
  await check("direct owner download is denied despite owning the image", () =>
    directDenied(owner.client),
  );
  await check("owner can still read image metadata", async () =>
    assert.ok(ok(await owner.client.storage.from("wine-labels").info(path))),
  );
  await check("owner can still upload and remove a temporary image", async () => {
    const temporary = `${owner.id}/${randomUUID()}.png`;
    await upload(temporary);
    assert.ok(ok(await owner.client.storage.from("wine-labels").info(temporary)));
    ok(await owner.client.storage.from("wine-labels").remove([temporary]));
    assert.ok((await owner.client.storage.from("wine-labels").info(temporary)).error);
  });
  ok(await owner.client.from("wines").update({ is_public: true }).eq("id", wine.id));
  await check("anonymous reads explicitly shared PNG through proxy", () =>
    image(null).then(expectImage),
  );
  await check("public sharing does not reopen direct Storage downloads", () =>
    directDenied(stranger.client),
  );
  ok(await owner.client.from("wines").update({ is_public: false }).eq("id", wine.id));
  await check("same anonymous proxy request is denied immediately after unsharing", () =>
    image(null).then((r) => expectDenied(r)),
  );
  await check("owner still reads the now-private image", () =>
    image(owner.token).then(expectImage),
  );
  ok(await owner.client.from("wines").update({ is_public: true }).eq("id", wine.id));
  await expectImage(await image(null));
  await expectImage(await image(owner.token));
  ok(await admin.rpc("request_account_erasure", { _user_id: owner.id }));
  await check("same owner JWT and image request denied immediately after erasure request", () =>
    image(owner.token).then((r) => expectDenied(r)),
  );
  await check("same anonymous image request denied immediately after erasure request", () =>
    image(null).then((r) => expectDenied(r)),
  );
  completed = true;
} catch {
  results.push({ name: "fixture setup or transition", passed: false });
} finally {
  const cleanup = async (run) => {
    try {
      ok(await run());
    } catch {
      cleanupFailures++;
    }
  };
  if (objects.length) await cleanup(() => admin.storage.from("wine-labels").remove(objects));
  for (const user of users) {
    await cleanup(() => admin.from("wine_photos").delete().eq("user_id", user.id));
    await cleanup(() => admin.from("wines").delete().eq("user_id", user.id));
    await cleanup(() => admin.auth.admin.deleteUser(user.id));
    await cleanup(() => admin.from("privacy_erasure_receipts").delete().eq("user_id", user.id));
  }
  const report = {
    checkedAt: new Date().toISOString(),
    project: "pzniyupmgwvlldvztzqh",
    completed,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    cleanupFailures,
    results,
  };
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/hosted-image-proxy-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }));
  if (!completed || report.failed || cleanupFailures) process.exitCode = 1;
}
