import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

// Executed only through docker exec, not published as an HTTP backup endpoint.
const project = "pzniyupmgwvlldvztzqh";
const origin = `https://${project}.supabase.co`;
const mode = process.argv.at(-1);
try {
  assert.equal(process.env.SUPABASE_URL, origin);
  assert.equal(process.env.WINESNAP_LOCAL_OPERATIONS_ENABLED, "true");
  assert.notEqual(process.getuid(), 0);
  assert.ok(["maintain", "backup", "inspect"].includes(mode));
  for (const path of ["/tmp/winesnap-ai", "/tmp/winesnap-ai/credentials.json"]) {
    const stat = await lstat(path);
    assert.equal(stat.isSymbolicLink(), false);
    assert.equal(stat.uid, process.getuid());
    assert.equal(stat.mode & 0o077, 0);
  }
  const keys = JSON.parse(await readFile("/tmp/winesnap-ai/credentials.json", "utf8"));
  assert.equal(keys.project, project);
  assert.ok(keys.cronSecret?.length >= 32 && keys.privacyCronSecret?.length >= 32);
  if (mode === "inspect") {
    console.log(JSON.stringify({ project, configured: true }));
  } else if (mode === "maintain") {
    const results = {};
    for (const [name, path, headers, body] of [
      [
        "privacy",
        "/api/privacy/privacy-maintenance",
        { authorization: `Bearer ${keys.privacyCronSecret}` },
        { execute: true },
      ],
      [
        "prices",
        "/api/public/hooks/check-wishlist-prices",
        { "x-cron-secret": keys.cronSecret },
        {},
      ],
    ]) {
      const response = await fetch(`http://127.0.0.1:3000${path}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(180_000),
      });
      const value = await response.json();
      // Only counts and safe status codes cross into the host report.
      results[name] = {
        status: response.status,
        failed: value.failed ?? value.failures ?? 0,
        remaining: value.remaining ?? (value.more_work ? 1 : 0),
        checked: value.checked ?? 0,
        completed: value.completed ?? 0,
        unmatched: value.unmatched ?? 0,
      };
    }
    const completed = Object.values(results).every(
      (r) => r.status === 200 && r.failed === 0 && r.remaining === 0,
    );
    console.log(JSON.stringify({ project, completed, results }));
    if (!completed) process.exitCode = 1;
  } else {
    let totalBytes = 0;
    const read = async (path, init = {}) => {
      assert.ok(path.startsWith("/") && !path.startsWith("//"));
      const response = await fetch(origin + path, {
        ...init,
        headers: { apikey: keys.secret, authorization: `Bearer ${keys.secret}`, ...init.headers },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      assert.ok(response.ok, "test_backup_read_failed");
      const bytes = Buffer.from(await response.arrayBuffer());
      totalBytes += bytes.length;
      assert.ok(totalBytes <= 50 * 1024 * 1024, "backup_requires_operator");
      return bytes;
    };
    const json = async (path, init) => JSON.parse((await read(path, init)).toString());
    const data = {
      version: 1,
      project,
      createdAt: new Date().toISOString(),
      tables: {},
      accounts: [],
      files: [],
      limitations: [
        "Application snapshot, not a transactional PostgreSQL backup",
        "Auth passwords, platform secrets and schema are not exported",
        "Recovery must reapply later erasure receipts before serving data",
      ],
    };
    const tables = [
      "profiles",
      "user_roles",
      "wines",
      "taste_profile",
      "tasting_notes",
      "analytics_events",
      "wishlist",
      "wine_photos",
      "restaurant_scans",
      "follows",
      "ai_rate_limits",
      "taste_signals",
      "derived_preferences",
      "ai_conversations",
      "ai_messages",
      "recommendation_events",
      "user_taste_similarity",
      "collector_lots",
      "account_erasure_jobs",
      "privacy_erasure_receipts",
    ];
    for (const table of tables) {
      const order =
        table === "taste_profile"
          ? "user_id"
          : table === "ai_rate_limits"
            ? "user_id,function_name,window_started_at"
            : table === "user_taste_similarity"
              ? "user_id,peer_user_id"
              : ["account_erasure_jobs", "privacy_erasure_receipts"].includes(table)
                ? "user_id"
                : "id";
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const page = await json(
          `/rest/v1/${table}?select=*&order=${order}&limit=500&offset=${offset}`,
        );
        assert.ok(Array.isArray(page));
        rows.push(...page);
        assert.ok(rows.length <= 20_000);
        if (page.length < 500) break;
      }
      data.tables[table] = rows;
    }
    for (let page = 1; ; page++) {
      const accounts = (await json(`/auth/v1/admin/users?page=${page}&per_page=100`)).users;
      assert.ok(Array.isArray(accounts));
      data.accounts.push(...accounts);
      assert.ok(data.accounts.length <= 2000);
      if (accounts.length < 100) break;
    }
    for (const account of data.accounts) {
      const objects = await json("/rest/v1/rpc/privacy_account_storage_objects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _user_id: account.id, _limit: 501 }),
      });
      assert.ok(Array.isArray(objects) && objects.length <= 500);
      for (const object of objects) {
        assert.ok(["wine-labels", "avatars"].includes(object.bucket_id));
        const bytes = await read(
          `/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${object.name.split("/").map(encodeURIComponent).join("/")}`,
        );
        data.files.push({
          bucket: object.bucket_id,
          path: object.name,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          base64: bytes.toString("base64"),
        });
      }
    }
    console.log(JSON.stringify(data));
  }
} catch {
  console.error("Local test operation failed; no credentials or private records reported.");
  process.exitCode = 1;
}
