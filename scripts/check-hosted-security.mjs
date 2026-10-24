import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Intentionally pinned to the disposable test environment, never production.
const url = "https://pzniyupmgwvlldvztzqh.supabase.co";
const credentials = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], "utf8"))
  : {
      publicKey: process.env.WINESNAP_TEST_PUBLISHABLE_KEY,
      secretKey: process.env.WINESNAP_TEST_SECRET_KEY,
    };
assert.ok(credentials.publicKey && credentials.secretKey, "Test credentials required");
let activeCheck = "fixture setup";
let physicalDeletionAt = null;
const storageResponses = [];
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(target.origin, url, "Hosted tests may only contact WineSnap-test");
      const response = await fetch(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (
        target.pathname.startsWith("/storage/v1/object/") &&
        (!init?.method || init.method === "GET")
      ) {
        // Never retain request headers, URLs, tokens or file/user identifiers.
        const headers = Object.fromEntries(
          ["cache-control", "cf-cache-status", "age", "vary", "x-cache", "expires", "content-type"]
            .map((name) => [name, response.headers.get(name)])
            .filter(([, value]) => value !== null),
        );
        storageResponses.push({
          check: activeCheck,
          status: response.status,
          requestCache: init?.cache ?? "default",
          cacheNonce: target.searchParams.has("cacheNonce"),
          sinceDeletionMs: physicalDeletionAt === null ? null : Date.now() - physicalDeletionAt,
          headers,
        });
      }
      return response;
    },
  },
};
const admin = createClient(url, credentials.secretKey, options);
const anon = createClient(url, credentials.publicKey, options);
const users = [];
const objects = [];
let failures = 0;
let passed = 0;
let cleanupFailures = 0;
let completed = false;
const results = [];
const ok = ({ data, error }) => {
  if (error) throw new Error(`API failure (${error.code || error.status || "unknown"})`);
  return data;
};
async function check(name, test) {
  activeCheck = name;
  try {
    await test();
    passed++;
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch {
    failures++;
    results.push({ name, passed: false });
    console.log(`FAIL ${name}`);
  } finally {
    activeCheck = "fixture setup";
  }
}
try {
  for (let i = 0; i < 4; i++) {
    const email = `winesnap-release-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    users.push({ id: user.id });
    const client = createClient(url, credentials.publicKey, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    users[i].client = client;
    ok(
      await client
        .from("profiles")
        .update({
          username: `test_${user.id.replaceAll("-", "").slice(0, 12)}`,
          is_public: i === 0,
        })
        .eq("id", user.id),
    );
  }
  const [owner, stranger, hiddenA, hiddenB] = users;
  const legacy = `test+/${randomUUID()}`;
  const path = `${owner.id}/${randomUUID()}.png`;
  const wine = ok(
    await owner.client
      .from("wines")
      .insert({
        user_id: owner.id,
        wine_name: "Synthetic release test",
        is_public: false,
        share_id: legacy,
        notes: "PRIVATE SYNTHETIC NOTE",
        image_url: path,
      })
      .select()
      .single(),
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=",
    "base64",
  );
  ok(
    await owner.client.storage.from("wine-labels").upload(path, png, {
      contentType: "image/png",
      cacheControl: "0",
    }),
  );
  objects.push(path);
  ok(
    await owner.client.from("wine_photos").insert({
      wine_id: wine.id,
      user_id: owner.id,
      url: path,
      storage_path: path,
      kind: "label",
    }),
  );
  await check("owner JWT reads private wine", async () =>
    assert.equal(ok(await owner.client.from("wines").select("id").eq("id", wine.id)).length, 1),
  );
  await check("other JWT cannot read private wine", async () =>
    assert.equal(ok(await stranger.client.from("wines").select("id").eq("id", wine.id)).length, 0),
  );
  await check("anonymous base table access denied", async () =>
    assert.ok((await anon.from("wines").select("id")).error),
  );
  await check("owner downloads private image", async () =>
    assert.ok(ok(await owner.client.storage.from("wine-labels").download(path)).size),
  );
  await check("other JWT cannot download private image", async () =>
    assert.ok((await stranger.client.storage.from("wine-labels").download(path)).error),
  );
  await check("anonymous cannot download private image", async () =>
    assert.ok((await anon.storage.from("wine-labels").download(path)).error),
  );
  ok(await owner.client.from("wines").update({ is_public: true }).eq("id", wine.id));
  await check("legacy share ID resolves", async () =>
    assert.equal(
      ok(await anon.from("public_wines").select("id").eq("share_id", legacy))[0]?.id,
      wine.id,
    ),
  );
  await check("public view excludes private notes", async () =>
    assert.ok((await anon.from("public_wines").select("notes")).error),
  );
  await check("anonymous downloads shared image", async () =>
    assert.ok(
      ok(await anon.storage.from("wine-labels").download(path, {}, { cache: "no-store" })).size,
    ),
  );
  for (const [name, client] of [
    ["owner", owner.client],
    ["anonymous", anon],
  ]) {
    await check(`${name} cannot sign image`, async () =>
      assert.ok((await client.storage.from("wine-labels").createSignedUrl(path, 60)).error),
    );
  }
  await check("batch signing denied", async () => {
    const result = await owner.client.storage.from("wine-labels").createSignedUrls([path], 60);
    assert.ok(result.error || result.data.every((item) => !item.signedUrl));
  });
  ok(await owner.client.from("wines").update({ is_public: false }).eq("id", wine.id));
  await check("unshare denies fresh anonymous download", async () =>
    assert.ok(
      (
        await anon.storage
          .from("wine-labels")
          .download(path, { cacheNonce: randomUUID() }, { cache: "no-store" })
      ).error,
    ),
  );
  await check("unshare removes lookup", async () =>
    assert.equal(ok(await anon.from("public_wines").select("id").eq("share_id", legacy)).length, 0),
  );
  await check("owner still downloads after unshare", async () =>
    assert.ok(
      ok(await owner.client.storage.from("wine-labels").download(path, {}, { cache: "no-store" }))
        .size,
    ),
  );
  ok(
    await owner.client.from("follows").insert({ follower_id: owner.id, following_id: stranger.id }),
  );
  ok(
    await hiddenA.client
      .from("follows")
      .insert({ follower_id: hiddenA.id, following_id: hiddenB.id }),
  );
  await check("unrelated private follow relation hidden", async () =>
    assert.equal(
      ok(await stranger.client.from("follows").select("follower_id").eq("follower_id", hiddenA.id))
        .length,
      0,
    ),
  );
  await check("participant sees private follow relation", async () =>
    assert.equal(
      ok(await hiddenB.client.from("follows").select("follower_id").eq("follower_id", hiddenA.id))
        .length,
      1,
    ),
  );
  await check("public profile relation visible to authenticated user", async () =>
    assert.equal(
      ok(await hiddenB.client.from("follows").select("follower_id").eq("follower_id", owner.id))
        .length,
      1,
    ),
  );
  await check("anonymous sees no follows", async () => {
    const result = await anon.from("follows").select("*");
    assert.ok(result.error || result.data.length === 0);
  });
  const quotaArgs = {
    _user_id: owner.id,
    _function_name: `release-${randomUUID()}`,
    _limit: 20,
    _window_seconds: 3600,
  };
  await check("authenticated clients cannot invoke service quota RPC", async () =>
    assert.ok((await owner.client.rpc("consume_ai_quota", quotaArgs)).error),
  );
  await check("atomic quota permits exactly 20 of 32 requests", async () => {
    const values = (
      await Promise.all(Array.from({ length: 32 }, () => admin.rpc("consume_ai_quota", quotaArgs)))
    )
      .map(ok)
      .flat();
    assert.equal(values.filter((v) => v.allowed).length, 20);
    assert.equal(values.filter((v) => !v.allowed).length, 12);
  });
  await check("client cannot forge memory signals", async () =>
    assert.ok(
      (
        await owner.client.from("taste_signals").insert({
          user_id: owner.id,
          source: "explicit_profile",
          attribute: "grape",
          direction: "like",
          value_text: "Chardonnay",
        })
      ).error,
    ),
  );
  ok(
    await admin.from("taste_signals").insert({
      user_id: owner.id,
      source: "explicit_profile",
      attribute: "grape",
      direction: "like",
      value_text: "Chardonnay",
    }),
  );
  await check("owner reads their memory signals", async () =>
    assert.equal(
      ok(await owner.client.from("taste_signals").select("id").eq("user_id", owner.id)).length,
      1,
    ),
  );
  await check("stranger cannot read memory signals", async () =>
    assert.equal(
      ok(await stranger.client.from("taste_signals").select("id").eq("user_id", owner.id)).length,
      0,
    ),
  );
  await check("verified user can look up their own role", async () =>
    assert.equal(
      ok(await owner.client.rpc("has_role", { _user_id: owner.id, _role: "user" })),
      true,
    ),
  );
  await check("verified user cannot look up a peer role", async () =>
    assert.equal(
      ok(await owner.client.rpc("has_role", { _user_id: stranger.id, _role: "user" })),
      false,
    ),
  );
  await check("user JWT cannot invoke privileged erasure RPC", async () =>
    assert.ok((await owner.client.rpc("request_account_erasure", { _user_id: stranger.id })).error),
  );
  await check("erasure request hides a previously public synthetic share", async () => {
    ok(await owner.client.from("wines").update({ is_public: true }).eq("id", wine.id));
    assert.equal(ok(await anon.from("public_wines").select("id").eq("share_id", legacy)).length, 1);
    ok(await admin.rpc("request_account_erasure", { _user_id: owner.id }));
    assert.equal(ok(await anon.from("public_wines").select("id").eq("share_id", legacy)).length, 0);
  });
  await check("stale owner JWT cannot read wines after erasure request", async () =>
    assert.equal(ok(await owner.client.from("wines").select("id").eq("id", wine.id)).length, 0),
  );
  await check("stale owner JWT cannot download the image after erasure request", async () =>
    assert.ok(
      (await owner.client.storage.from("wine-labels").download(path, {}, { cache: "no-store" }))
        .error,
    ),
  );
  await check("stale owner JWT cannot freshly fetch the image after erasure request", async () =>
    assert.ok(
      (
        await owner.client.storage
          .from("wine-labels")
          .download(path, { cacheNonce: randomUUID() }, { cache: "no-store" })
      ).error,
    ),
  );
  await check("stale owner JWT cannot recreate a wine", async () =>
    assert.ok(
      (
        await owner.client
          .from("wines")
          .insert({ user_id: owner.id, wine_name: "Blocked synthetic wine" })
      ).error,
    ),
  );
  await check("peer JWT remains active after another user's erasure request", async () =>
    assert.equal(
      ok(await stranger.client.from("profiles").select("id").eq("id", stranger.id)).length,
      1,
    ),
  );
  await check("anonymous cannot reuse shared image URL after erasure request", async () =>
    assert.ok(
      (await anon.storage.from("wine-labels").download(path, {}, { cache: "no-store" })).error,
    ),
  );
  await check("service physically deletes the synthetic image", async () => {
    assert.ok(ok(await admin.storage.from("wine-labels").info(path)));
    ok(await admin.storage.from("wine-labels").remove([path]));
    physicalDeletionAt = Date.now();
    assert.ok((await admin.storage.from("wine-labels").info(path)).error);
  });
  await check("fresh image request denied after physical deletion", async () =>
    assert.ok(
      (
        await owner.client.storage
          .from("wine-labels")
          .download(path, { cacheNonce: randomUUID() }, { cache: "no-store" })
      ).error,
    ),
  );
  await check("previous image URLs denied within 65 seconds after physical deletion", async () => {
    assert.notEqual(physicalDeletionAt, null, "Physical deletion must succeed first");
    const deadline = physicalDeletionAt + 65000;
    while (true) {
      const ownerRead = await owner.client.storage
        .from("wine-labels")
        .download(path, {}, { cache: "no-store" });
      const publicRead = await anon.storage
        .from("wine-labels")
        .download(path, {}, { cache: "no-store" });
      assert.ok(
        Date.now() <= deadline,
        "Image revocation observation exceeded the deletion window",
      );
      if (ownerRead.error && publicRead.error) break;
      assert.ok(
        Date.now() < deadline,
        "Previously fetched image URL still readable after deletion window",
      );
      await new Promise((resolve) => setTimeout(resolve, Math.min(10000, deadline - Date.now())));
    }
  });
  completed = true;
} finally {
  // Only synthetic fixtures created in this invocation may be removed.
  const cleanup = async (operation) => {
    try {
      ok(await operation());
    } catch {
      cleanupFailures++;
    }
  };
  if (objects.length) await cleanup(() => admin.storage.from("wine-labels").remove(objects));
  for (const user of users) {
    await cleanup(() => admin.from("wines").delete().eq("user_id", user.id));
    await cleanup(() => admin.auth.admin.deleteUser(user.id));
    await cleanup(() => admin.from("privacy_erasure_receipts").delete().eq("user_id", user.id));
  }
  const report = {
    checkedAt: new Date().toISOString(),
    project: "pzniyupmgwvlldvztzqh",
    completed,
    passed,
    failed: failures,
    cleanupFailures,
    scope: "Hosted Auth JWT, Storage HTTP and database RPC; no AI, UI or production deployment",
    results,
    storageResponses,
  };
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/hosted-security-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined, storageResponses: undefined }));
}
if (!completed || failures || cleanupFailures) process.exitCode = 1;
