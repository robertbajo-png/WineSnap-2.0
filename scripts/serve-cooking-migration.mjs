import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
if (
  process.argv.slice(2).some((arg) => !["--chef", "--chef-conflicts", "--meals"].includes(arg)) ||
  process.argv.length > 3
)
  throw new Error("Unsupported migration review");
const conflicts = process.argv.includes("--chef-conflicts");
const meals = process.argv.includes("--meals");
const chef = conflicts || process.argv.includes("--chef");
const version = meals
  ? "20261025090000"
  : conflicts
    ? "20261024223000"
    : chef
      ? "20261024220000"
      : "20261024200000";
const migrationName = meals
  ? "meals_households"
  : conflicts
    ? "chef_conflict_status"
    : chef
      ? "ai_chef_food_memory"
      : "cooking_core";
const sql = await readFile(
  new URL(`../supabase/migrations/${version}_${migrationName}.sql`, import.meta.url),
  "utf8",
);
const body = `BEGIN;
DO $guard$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>0 OR (SELECT count(*) FROM public.wines)<>0 OR
    ${meals ? "to_regclass('public.kitchen_diners') IS NOT NULL OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024223000')" : conflicts ? "to_regclass('public.chef_requests') IS NULL OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024223000')" : chef ? "to_regclass('public.chef_requests') IS NOT NULL OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024200000')" : "to_regclass('public.kitchen_config') IS NOT NULL"} THEN
   RAISE EXCEPTION 'Only the verified empty WineSnap-test target may install this candidate';
 END IF;
END $guard$;
${sql}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('${version}','${migrationName}',ARRAY[$source$${sql}$source$]);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT to_regclass('public.${meals ? "kitchen_diners" : chef ? "chef_requests" : "cooking_sessions"}') IS NOT NULL AS installed,
 (SELECT ${meals ? "meals_enabled" : chef ? "chef_enabled" : "enabled"} FROM public.kitchen_config) AS enabled;
`;
const server = createServer((request, response) => {
  if (request.url !== "/migration.sql") {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body, () => server.close());
});
server.listen(5212, "127.0.0.1", () =>
  console.log(
    "Read-only cooking migration review at http://127.0.0.1:5212/migration.sql (one request)",
  ),
);
server.on("error", () => {
  console.error("Migration review listener unavailable");
  process.exitCode = 1;
});
