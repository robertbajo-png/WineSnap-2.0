import { afterAll, beforeAll, expect, test } from "bun:test";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createServer } from "node:net";

const owner = randomUUID();
const stranger = randomUUID();
const admin = randomUUID();
const hiddenA = randomUUID();
const hiddenB = randomUUID();
const privateWine = randomUUID();
const publicWine = randomUUID();
const otherWine = randomUUID();
const legacyShare = "ab+cd/efghij";
let cluster: EmbeddedPostgres;
let db: Client;
let port: number;
let migrated = 0;
let databaseDir: string;
const password = randomUUID();

async function connection() {
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
  });
  await client.connect();
  return client;
}

async function asRole(
  role: "anon" | "authenticated",
  uid: string | null,
  sql: string,
  values: unknown[] = [],
) {
  const client = await connection();
  try {
    await client.query(`SET ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
    return await client.query(sql, values);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  databaseDir = await mkdtemp(join(tmpdir(), "winesnap-db-test-"));
  cluster = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    initdbFlags: ["--encoding=UTF8"],
    onLog: () => {},
    onError: (error) => console.error(error),
  });
  await cluster.initialise();
  await cluster.start();
  db = await connection();
  await db.query(await readFile(new URL("./bootstrap.sql", import.meta.url), "utf8"));
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files.filter((name) => name < "20260830")) {
    await db.query(await readFile(new URL(file, directory), "utf8"));
    migrated++;
  }
  for (const id of [owner, stranger, admin, hiddenA, hiddenB]) {
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [
      id,
      `${id}@example.test`,
    ]);
  }
  await db.query(
    "UPDATE profiles SET username = ' Owner.Name ', is_public = true, price_min = 100 WHERE id = $1",
    [owner],
  );
  await db.query("UPDATE profiles SET username = 'owner.name' WHERE id = $1", [stranger]);
  await db.query("UPDATE profiles SET is_public = false WHERE id = ANY($1::uuid[])", [
    [admin, hiddenA, hiddenB],
  ]);
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [admin]);
  for (const [id, userId, shared, share, image] of [
    [privateWine, owner, false, "private-id", `${owner}/private.jpg`],
    [publicWine, owner, true, legacyShare, `${owner}/Public label.jpg`],
    [otherWine, stranger, true, "other-id", `${stranger}/other.jpg`],
  ]) {
    await db.query(
      "INSERT INTO wines (id,user_id,is_public,share_id,image_url,wine_name,notes,ai_raw) VALUES ($1,$2,$3,$4,$5,'Test wine','Private note','{\"secret\":true}')",
      [
        id,
        userId,
        shared,
        share,
        `https://example.supabase.co/storage/v1/object/public/wine-labels/${String(image).replaceAll(" ", "%20")}?download=1`,
      ],
    );
    await db.query("INSERT INTO storage.objects (bucket_id,name) VALUES ('wine-labels',$1)", [
      image,
    ]);
  }
  // A legacy forged association must not make the victim's image public.
  await db.query(
    "INSERT INTO wine_photos (wine_id,user_id,url,storage_path) VALUES ($1,$2,$3,$3)",
    [otherWine, stranger, `${owner}/private.jpg`],
  );
  for (const file of files.filter((name) => name >= "20260830")) {
    try {
      await db.query(await readFile(new URL(file, directory), "utf8"));
    } catch (error) {
      throw new Error(`Migration failed: ${file}`, { cause: error });
    }
    migrated++;
  }
  await db.query("INSERT INTO follows(follower_id, following_id) VALUES ($1,$2),($3,$4)", [
    owner,
    stranger,
    hiddenA,
    hiddenB,
  ]);
  console.log(`Applied ${migrated} migrations to disposable PostgreSQL`);
}, 120_000);

afterAll(async () => {
  await db?.end();
  await cluster?.stop();
  if (
    databaseDir &&
    dirname(resolve(databaseDir)) === resolve(tmpdir()) &&
    basename(databaseDir).startsWith("winesnap-db-test-")
  ) {
    await rm(databaseDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}, 30_000);

test("storage download signing is denied even to the owner", async () => {
  const client = await connection();
  try {
    await client.query("SET ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    for (const operation of ["object.sign", "object.sign_many", "render.image_sign"]) {
      await client.query("SELECT set_config('test.storage_operation', $1, false)", [operation]);
      expect((await client.query("SELECT * FROM storage.objects")).rows).toHaveLength(0);
    }
    await client.query(
      "SELECT set_config('test.storage_operation', 'object.get_authenticated', false)",
    );
    expect((await client.query("SELECT * FROM storage.objects")).rows.length).toBeGreaterThan(0);
  } finally {
    await client.end();
  }
});

test("account deletion cascades without recreating a taste profile", async () => {
  const user = randomUUID();
  await db.query("INSERT INTO auth.users (id,email) VALUES ($1,$2)", [
    user,
    `${user}@example.test`,
  ]);
  await db.query("INSERT INTO wines (user_id,wine_name) VALUES ($1,'Deletion regression')", [user]);
  await db.query("DELETE FROM auth.users WHERE id=$1", [user]);
  expect(
    (await db.query("SELECT * FROM taste_profile WHERE user_id=$1", [user])).rows,
  ).toHaveLength(0);
  expect((await db.query("SELECT * FROM wines WHERE user_id=$1", [user])).rows).toHaveLength(0);
});

test("preserves existing usernames and public share IDs", async () => {
  expect(
    (await db.query("SELECT username FROM profiles WHERE id=$1", [owner])).rows[0].username,
  ).toBe(" Owner.Name ");
  expect(
    (await asRole("anon", null, "SELECT share_id FROM public_wines WHERE id=$1", [publicWine]))
      .rows[0].share_id,
  ).toBe(legacyShare);
});

test("anonymous readers get only public views and cannot read base tables or private fields", async () => {
  await expect(asRole("anon", null, "SELECT * FROM wines")).rejects.toMatchObject({
    code: "42501",
  });
  await expect(asRole("anon", null, "SELECT * FROM profiles")).rejects.toMatchObject({
    code: "42501",
  });
  const wines = (await asRole("anon", null, "SELECT * FROM public_wines")).rows;
  expect(wines).toHaveLength(2);
  expect(wines.some((wine) => wine.id === privateWine)).toBe(false);
  expect(wines[0]).not.toHaveProperty("ai_raw");
  expect(wines[0]).not.toHaveProperty("notes");
  expect(wines[0]).not.toHaveProperty("purchase_price");
  const profiles = (await asRole("anon", null, "SELECT * FROM public_profiles")).rows;
  expect(profiles).toHaveLength(1);
  expect(profiles[0]).not.toHaveProperty("price_min");
});

test("authenticated owners see and edit only their own base rows", async () => {
  expect((await asRole("authenticated", owner, "SELECT id FROM wines")).rows).toHaveLength(2);
  expect((await asRole("authenticated", stranger, "SELECT id FROM wines")).rows).toHaveLength(1);
  expect(
    (
      await asRole(
        "authenticated",
        stranger,
        "UPDATE wines SET notes='changed' WHERE id=$1 RETURNING id",
        [privateWine],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await asRole("authenticated", stranger, "SELECT id FROM profiles WHERE id=$1", [owner])).rows,
  ).toHaveLength(0);
});

test("follow relationships are limited to participants or public profiles", async () => {
  await expect(asRole("anon", null, "SELECT * FROM follows")).rejects.toMatchObject({
    code: "42501",
  });

  const publicRelation = "SELECT follower_id FROM follows WHERE follower_id=$1 AND following_id=$2";
  expect(
    (await asRole("authenticated", admin, publicRelation, [owner, stranger])).rows,
  ).toHaveLength(1);

  const privateRelation =
    "SELECT follower_id FROM follows WHERE follower_id=$1 AND following_id=$2";
  expect(
    (await asRole("authenticated", admin, privateRelation, [hiddenA, hiddenB])).rows,
  ).toHaveLength(0);
  expect(
    (await asRole("authenticated", hiddenA, privateRelation, [hiddenA, hiddenB])).rows,
  ).toHaveLength(1);
});

test("private images are owner-only even with a forged legacy association", async () => {
  const query = "SELECT name FROM storage.objects WHERE bucket_id='wine-labels' AND name=$1";
  expect((await asRole("authenticated", owner, query, [`${owner}/private.jpg`])).rows).toHaveLength(
    1,
  );
  expect(
    (await asRole("authenticated", stranger, query, [`${owner}/private.jpg`])).rows,
  ).toHaveLength(0);
  expect((await asRole("anon", null, query, [`${owner}/private.jpg`])).rows).toHaveLength(0);
  expect((await asRole("anon", null, query, [`${owner}/Public label.jpg`])).rows).toHaveLength(1);
});

test("rejects new photo associations to another owner's wine or path", async () => {
  const query = "INSERT INTO wine_photos(wine_id,user_id,url,storage_path) VALUES ($1,$2,$3,$3)";
  await expect(
    asRole("authenticated", stranger, query, [publicWine, stranger, `${stranger}/other.jpg`]),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    asRole("authenticated", stranger, query, [otherWine, stranger, `${owner}/private.jpg`]),
  ).rejects.toMatchObject({ code: "42501" });
});

test("unsharing a wine removes anonymous database access to its image", async () => {
  await asRole("authenticated", owner, "UPDATE wines SET is_public=false WHERE id=$1", [
    publicWine,
  ]);
  expect(
    (await asRole("anon", null, "SELECT * FROM public_wines WHERE id=$1", [publicWine])).rows,
  ).toHaveLength(0);
  expect(
    (
      await asRole("anon", null, "SELECT name FROM storage.objects WHERE name=$1", [
        `${owner}/Public label.jpg`,
      ])
    ).rows,
  ).toHaveLength(0);
  await asRole("authenticated", owner, "UPDATE wines SET is_public=true WHERE id=$1", [publicWine]);
});

test("admin statistics require admin role without granting broad base-table access", async () => {
  await expect(asRole("anon", null, "SELECT get_admin_stats()")).rejects.toMatchObject({
    code: "42501",
  });
  await expect(asRole("authenticated", stranger, "SELECT get_admin_stats()")).rejects.toMatchObject(
    { code: "42501" },
  );
  const result = (await asRole("authenticated", admin, "SELECT get_admin_stats() AS stats")).rows[0]
    .stats;
  expect(result.wines).toBe(3);
  expect(result.users).toBe(5);
  expect((await asRole("authenticated", admin, "SELECT id FROM wines")).rows).toHaveLength(0);
});

test("rate limits atomically allow exactly 20 of 32 concurrent requests", async () => {
  const results = await Promise.all(
    Array.from({ length: 32 }, () =>
      asRole("authenticated", owner, "SELECT consume_api_rate_limit('analyze-wine') AS allowed"),
    ),
  );
  expect(results.filter((result) => result.rows[0].allowed)).toHaveLength(20);
  expect(
    (
      await asRole(
        "authenticated",
        stranger,
        "SELECT consume_api_rate_limit('analyze-wine') AS allowed",
      )
    ).rows[0].allowed,
  ).toBe(true);
  await expect(
    asRole("anon", null, "SELECT consume_api_rate_limit('analyze-wine')"),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    asRole("authenticated", owner, "SELECT * FROM api_rate_limits"),
  ).rejects.toMatchObject({ code: "42501" });
  await db.query(
    "UPDATE api_rate_limits SET window_started_at=now()-interval '2 hours' WHERE user_id=$1",
    [owner],
  );
  expect(
    (
      await asRole(
        "authenticated",
        owner,
        "SELECT consume_api_rate_limit('analyze-wine') AS allowed",
      )
    ).rows[0].allowed,
  ).toBe(true);
});

test("role rows are readable by their owner but clients cannot promote themselves", async () => {
  expect((await asRole("authenticated", stranger, "SELECT role FROM user_roles")).rows).toEqual([
    { role: "user" },
  ]);
  await expect(
    asRole("authenticated", stranger, "INSERT INTO user_roles(user_id,role) VALUES ($1,'admin')", [
      stranger,
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  expect(
    (
      await asRole(
        "authenticated",
        stranger,
        "UPDATE user_roles SET role='admin' WHERE user_id=$1 RETURNING role",
        [stranger],
      )
    ).rows,
  ).toHaveLength(0);
});

test("new names are validated and normalized without altering legacy names", async () => {
  await asRole("authenticated", admin, "UPDATE profiles SET username=' New_User ' WHERE id=$1", [
    admin,
  ]);
  expect(
    (await db.query("SELECT username FROM profiles WHERE id=$1", [admin])).rows[0].username,
  ).toBe("new_user");
  await expect(
    asRole("authenticated", admin, "UPDATE profiles SET username='a' WHERE id=$1", [admin]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    asRole("authenticated", admin, "UPDATE profiles SET username='OWNER.NAME' WHERE id=$1", [
      admin,
    ]),
  ).rejects.toMatchObject({ code: "23505" });
  await asRole(
    "authenticated",
    owner,
    "UPDATE profiles SET bio='Updated biography',username=username WHERE id=$1",
    [owner],
  );
  expect(
    (await db.query("SELECT username FROM profiles WHERE id=$1", [owner])).rows[0].username,
  ).toBe(" Owner.Name ");
});

test("new share IDs are URL-safe and legacy public links still resolve", async () => {
  const result = await asRole(
    "authenticated",
    owner,
    "INSERT INTO wines(user_id,wine_name) VALUES ($1,'New scan') RETURNING id,share_id",
    [owner],
  );
  expect(result.rows[0].share_id).toMatch(/^[A-Za-z0-9_-]{16}$/);
  expect(
    (await asRole("anon", null, "SELECT id FROM public_wines WHERE share_id=$1", [legacyShare]))
      .rows[0].id,
  ).toBe(publicWine);
  await asRole("authenticated", owner, "DELETE FROM wines WHERE id=$1", [result.rows[0].id]);
});

test("owner can manage photos and notes but cannot attach notes to someone else's wine", async () => {
  const photo = await asRole(
    "authenticated",
    owner,
    "INSERT INTO wine_photos(wine_id,user_id,url,storage_path) VALUES ($1,$2,$3,$3) RETURNING id",
    [privateWine, owner, `${owner}/private.jpg`],
  );
  await expect(
    asRole("authenticated", owner, "UPDATE wine_photos SET storage_path=$1 WHERE id=$2", [
      `${stranger}/other.jpg`,
      photo.rows[0].id,
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  expect(
    (
      await asRole("authenticated", stranger, "DELETE FROM wine_photos WHERE id=$1 RETURNING id", [
        photo.rows[0].id,
      ])
    ).rows,
  ).toHaveLength(0);
  await asRole("authenticated", owner, "DELETE FROM wine_photos WHERE id=$1", [photo.rows[0].id]);
  await expect(
    asRole(
      "authenticated",
      stranger,
      "INSERT INTO tasting_notes(wine_id,user_id,rating) VALUES ($1,$2,4)",
      [privateWine, stranger],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  const note = await asRole(
    "authenticated",
    owner,
    "INSERT INTO tasting_notes(wine_id,user_id,rating) VALUES ($1,$2,4) RETURNING id",
    [privateWine, owner],
  );
  expect(
    (
      await asRole("authenticated", stranger, "SELECT * FROM tasting_notes WHERE id=$1", [
        note.rows[0].id,
      ])
    ).rows,
  ).toHaveLength(0);
});

test("storage ownership cannot be forged, moved, or deleted by another user", async () => {
  await expect(
    asRole(
      "authenticated",
      stranger,
      "INSERT INTO storage.objects(bucket_id,name) VALUES ('wine-labels',$1)",
      [`${owner}/forged.jpg`],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  const path = `${owner}/new.jpg`;
  await asRole(
    "authenticated",
    owner,
    "INSERT INTO storage.objects(bucket_id,name) VALUES ('wine-labels',$1)",
    [path],
  );
  await expect(
    asRole("authenticated", owner, "UPDATE storage.objects SET name=$1 WHERE name=$2", [
      `${stranger}/moved.jpg`,
      path,
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  expect(
    (
      await asRole(
        "authenticated",
        stranger,
        "DELETE FROM storage.objects WHERE name=$1 RETURNING id",
        [path],
      )
    ).rows,
  ).toHaveLength(0);
  await asRole("authenticated", owner, "DELETE FROM storage.objects WHERE name=$1", [path]);
});

test("new invalid domain values fail rather than being silently corrected", async () => {
  await expect(
    asRole("authenticated", owner, "UPDATE wines SET fruit=11 WHERE id=$1", [privateWine]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    asRole("authenticated", owner, "UPDATE wines SET quantity=-1 WHERE id=$1", [privateWine]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    asRole("authenticated", owner, "UPDATE wines SET vintage=0 WHERE id=$1", [privateWine]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    asRole("authenticated", owner, "UPDATE profiles SET price_min=200,price_max=100 WHERE id=$1", [
      owner,
    ]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    asRole(
      "authenticated",
      owner,
      "INSERT INTO tasting_notes(wine_id,user_id,rating) VALUES ($1,$2,6)",
      [privateWine, owner],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    asRole(
      "authenticated",
      owner,
      "INSERT INTO wishlist(user_id,wine_name,target_price) VALUES ($1,'Invalid',-1)",
      [owner],
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

test("all rate buckets enforce their configured limits and missing identities fail closed", async () => {
  for (const [bucket, limit] of [
    ["restaurant-match", 10],
    ["taste-suggestions", 10],
    ["wine-suggestions", 20],
    ["systembolaget-match", 30],
    ["wishlist-price-check", 10],
  ] as const) {
    const result = await asRole(
      "authenticated",
      admin,
      "SELECT consume_api_rate_limit($1) AS allowed FROM generate_series(1,$2)",
      [bucket, limit + 1],
    );
    expect(result.rows.filter((row) => row.allowed)).toHaveLength(limit);
  }
  expect(
    (
      await asRole(
        "authenticated",
        null,
        "SELECT consume_api_rate_limit('analyze-wine') AS allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
  await expect(
    asRole("authenticated", owner, "SELECT consume_api_rate_limit('unknown')"),
  ).rejects.toMatchObject({ code: "P0001" });
});

test("invalid legacy data aborts constraint migration without data loss or partial DDL", async () => {
  await db.query("CREATE DATABASE winesnap_invalid_fixture");
  const legacy = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "winesnap_invalid_fixture",
  });
  await legacy.connect();
  try {
    // Roles are cluster-global; reuse them while creating a second clean schema.
    const bootstrap = await readFile(new URL("./bootstrap.sql", import.meta.url), "utf8");
    await legacy.query(bootstrap.replace(/^CREATE ROLE .*;$/gm, ""));
    const directory = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => name.endsWith(".sql") && name < "20260830")
      .sort()) {
      await legacy.query(await readFile(new URL(file, directory), "utf8"));
    }
    await legacy.query("INSERT INTO auth.users(id,email) VALUES ($1,'legacy@example.test')", [
      owner,
    ]);
    await legacy.query(
      "INSERT INTO wines(id,user_id,wine_name,quantity) VALUES ($1,$2,'Legacy',-2)",
      [privateWine, owner],
    );
    const sql = await readFile(new URL("20260830122000_data_constraints.sql", directory), "utf8");
    await expect(legacy.query(sql)).rejects.toMatchObject({ code: "23514" });
    await legacy.query("ROLLBACK");
    expect(
      (await legacy.query("SELECT quantity FROM wines WHERE id=$1", [privateWine])).rows[0]
        .quantity,
    ).toBe(-2);
    expect(
      (
        await legacy.query(
          "SELECT conname FROM pg_constraint WHERE conname='wines_profile_ranges_check'",
        )
      ).rows,
    ).toHaveLength(0);
  } finally {
    await legacy.end();
    await db.query("DROP DATABASE winesnap_invalid_fixture");
  }
});
