import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const version = "20261024200000";
const sql = await readFile(
  new URL(`../supabase/migrations/${version}_cooking_core.sql`, import.meta.url),
  "utf8",
);
const body = `BEGIN;
DO $guard$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>0 OR (SELECT count(*) FROM public.wines)<>0 OR
    to_regclass('public.kitchen_config') IS NOT NULL THEN
   RAISE EXCEPTION 'Only the verified empty WineSnap-test target may install this candidate';
 END IF;
END $guard$;
${sql}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('${version}','cooking_core',ARRAY[$source$${sql}$source$]);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT to_regclass('public.cooking_sessions') IS NOT NULL AS installed,
 (SELECT enabled FROM public.kitchen_config) AS enabled;
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
