import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const snapshotProject = "pzniyupmgwvlldvztzqh";
export const snapshotTables = [
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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
export function snapshotTablesFor(version) {
  assert.ok([1, 2].includes(version));
  return version === 1
    ? snapshotTables
    : [
        ...snapshotTables,
        "kitchen_recipes",
        "kitchen_recipe_versions",
        "cooking_sessions",
        "cooking_feedback",
      ];
}

export function validateSnapshot(snapshot) {
  assert.ok(record(snapshot));
  const tables = snapshotTablesFor(snapshot.version);
  assert.equal(snapshot.project, snapshotProject);
  assert.ok(Number.isFinite(Date.parse(snapshot.createdAt)));
  assert.ok(record(snapshot.tables));
  assert.deepEqual(Object.keys(snapshot.tables).sort(), [...tables].sort());
  for (const table of tables) {
    const rows = snapshot.tables[table];
    assert.ok(Array.isArray(rows) && rows.length <= 20000);
    assert.ok(rows.every((row) => record(row) && Object.keys(row).length <= 150));
  }
  assert.ok(Array.isArray(snapshot.accounts) && snapshot.accounts.length <= 2000);
  const owners = new Set();
  for (const account of snapshot.accounts) {
    assert.ok(record(account) && uuid.test(account.id));
    assert.ok(
      account.email == null || (typeof account.email === "string" && account.email.length <= 320),
    );
    assert.ok(account.user_metadata == null || record(account.user_metadata));
    for (const key of ["created_at", "last_sign_in_at"]) {
      assert.ok(
        account[key] == null ||
          (typeof account[key] === "string" && Number.isFinite(Date.parse(account[key]))),
      );
    }
    assert.ok(!owners.has(account.id.toLowerCase()));
    owners.add(account.id.toLowerCase());
  }
  assert.ok(Array.isArray(snapshot.files) && snapshot.files.length <= 10000);
  const paths = new Set();
  let bytes = 0;
  for (const file of snapshot.files) {
    assert.ok(record(file) && ["wine-labels", "avatars"].includes(file.bucket));
    assert.ok(
      typeof file.path === "string" && file.path.length <= 1024 && !/[\\\x00]/.test(file.path),
    );
    const parts = file.path.split("/");
    assert.ok(parts.length >= 2 && owners.has(parts[0].toLowerCase()));
    assert.ok(parts.every((part) => part && part !== "." && part !== ".."));
    const path = `${file.bucket}/${file.path}`;
    assert.ok(!paths.has(path));
    paths.add(path);
    assert.ok(typeof file.base64 === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(file.base64));
    const content = Buffer.from(file.base64, "base64");
    assert.equal(content.toString("base64"), file.base64);
    bytes += content.length;
    assert.ok(bytes <= 50 * 1024 * 1024);
    assert.equal(createHash("sha256").update(content).digest("hex"), file.sha256);
  }
  return snapshot;
}

// JSON values are data parameters inside PL/pgSQL, never interpolated SQL literals.
const json = (value) =>
  `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString("hex")}','hex'),'UTF8')::jsonb`;

export function snapshotRestoreSql(input) {
  const snapshot = validateSnapshot(input);
  const accounts = snapshot.accounts.map((account) => ({
    id: account.id,
    email: account.email ?? null,
    created_at: account.created_at ?? snapshot.createdAt,
    last_sign_in_at: account.last_sign_in_at ?? null,
    raw_user_meta_data: account.user_metadata ?? {},
  }));
  const statements = [
    "BEGIN; SET search_path=public,extensions; SET session_replication_role=replica;",
    `INSERT INTO auth.users SELECT * FROM jsonb_populate_recordset(NULL::auth.users,${json(accounts)});`,
  ];
  for (const table of snapshotTablesFor(snapshot.version)) {
    statements.push(`DO $restore$
      DECLARE value jsonb := ${json(snapshot.tables[table])}; columns text;
      BEGIN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(value) r, LATERAL jsonb_object_keys(r) k
          WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema='public' AND c.table_name='${table}' AND c.column_name=k))
          THEN RAISE EXCEPTION 'unsupported_snapshot_columns'; END IF;
        SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) INTO columns
          FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'
            AND is_generated='NEVER';
        EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1)',
          '${table}',columns,columns,'${table}') USING value;
        IF EXISTS (SELECT to_jsonb(t) FROM public.${table} t EXCEPT
          SELECT to_jsonb(e) FROM jsonb_populate_recordset(NULL::public.${table},value) e)
          OR EXISTS (SELECT to_jsonb(e) FROM jsonb_populate_recordset(NULL::public.${table},value) e
            EXCEPT SELECT to_jsonb(t) FROM public.${table} t)
          THEN RAISE EXCEPTION 'snapshot_rows_differ'; END IF;
      END $restore$;`);
  }
  statements.push(`SET session_replication_role=origin;
    DO $constraints$ DECLARE c record; BEGIN
      FOR c IN SELECT conname,conrelid::regclass AS relation,pg_get_constraintdef(oid) AS definition,convalidated
        FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',c.relation,c.conname);
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s%s',c.relation,c.conname,c.definition,
          CASE WHEN c.convalidated THEN ' NOT VALID' ELSE '' END);
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',c.relation,c.conname);
      END LOOP;
    END $constraints$;`);
  for (const [index, file] of snapshot.files.entries()) {
    const hex = Buffer.from(file.base64, "base64").toString("hex");
    statements.push(`DO $image$ DECLARE object oid; BEGIN
      object := lo_from_bytea(0,decode('${hex}','hex'));
      PERFORM lo_export(object,'/tmp/winesnap-image-${index}');
      IF encode(sha256(pg_read_binary_file('/tmp/winesnap-image-${index}')),'hex') <> '${file.sha256}'
        THEN RAISE EXCEPTION 'image_restore_differs'; END IF;
      PERFORM lo_unlink(object);
    END $image$;`);
  }
  statements.push(`COMMIT; SELECT json_build_object('tables',${snapshotTablesFor(snapshot.version).length},'accounts',${accounts.length},
    'rows',${Object.values(snapshot.tables).reduce((count, rows) => count + rows.length, 0)},'files',${snapshot.files.length});`);
  return statements.join("\n");
}
