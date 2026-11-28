# Hosted Staging Preflight

Status recorded 2026-10-21. The hosted observations below were made on
2026-10-20; they are not a new authenticated session or completed acceptance run.

## Actual Hosted Observation

Using the existing signed-in Supabase dashboard session, the separate
`WineSnap-test` project (`pzniyupmgwvlldvztzqh`) was resumed on its existing Free
plan. No new project, plan upgrade, production change or migration was performed.
The dashboard identified the owner's organization and an Ireland NANO instance.

The new `supabase/operations/staging-preflight.sql` was executed there in a
read-only transaction. Its six result groups reported:

- PostgreSQL 17.6.
- Zero Auth users, wines, wine-photo rows and Storage objects.
- `wine-labels` exists and is private.
- The native Supabase migration ledger exists; neither inspected Drizzle ledger
  location exists in this test project.
- Existing wine, memory, social and collector tables have RLS enabled.
- Privacy tables/functions are absent; `has_role` exists but authenticated callers
  have no EXECUTE grant. This does not certify the function's behavior.

A separate read-only ledger query returned 31 registered migration rows. Its
virtualized result table exposed only the first rows, and the interruption
occurred before the aggregate version-list query was run. Therefore **the exact
set of pending migrations has not yet been established**. The role lookup and
privacy migrations are candidates, not authorization to replay them or repair
the ledger. No private row contents, credentials or export archive were read.

The screenshot is retained locally under ignored `dist/hosted-staging-preflight.jpg`.
The attempted DOM JSON export has an empty `rows` array and is not valid evidence
of the query results; the visible dashboard result and screenshot are the evidence.
No secret or screenshot was added to public source control.

## Reusable Read-Only Check

The SQL script returns table/RLS/grant metadata, selected function permissions,
ledger presence, bucket privacy and aggregate counts. It uses `BEGIN READ ONLY`,
a 15-second statement timeout and `ROLLBACK`. It does not execute application
functions, create accounts, upload files or schedule maintenance.

It expects an existing WineSnap base schema and Supabase platform schemas. It is
not a bootstrap for an empty hosted database. Select and verify the intended
dashboard project before executing it; SQL metadata alone does not prove which
Supabase project/origin is selected.

The isolated database checker now executes and asserts these results immediately
before and after the existing privacy migration. Both checks must return all six
groups, report the expected privacy-schema presence, and leave fixture counts
unchanged. The synthetic report includes the preflight SQL fingerprint. These
remain local/CI contract checks, not hosted JWT or Storage HTTP acceptance.

Local verification on 2026-10-21: all 33 migrations, 11 SQL invariant files and
both preflight states pass on synthetic PostgreSQL 18.4. All 390 Vitest tests,
TypeScript and full ESLint pass (the existing generated dependency backup remains
excluded from lint). Shared local dependencies are not clean-install evidence;
the feature branch's GitHub checks provide that separate gate.

## Remaining Gates

1. Reconnect Chrome or the direct Supabase integration and verify the current
   project and aggregate native migration-version list. Do not resume from stale
   query contents or infer missing versions from a row count alone.
2. Compare each missing version with actual schema/grants and source. Obtain
   explicit approval before applying missing role/privacy migrations **only** to
   the named test project. Do not enable cron, deletion or privacy-verification
   flags as part of that schema update.
3. With a verified test-only API connection, exercise real owner/stranger/anonymous
   JWT, private/shared images, signing denial, legacy shares, quota and account
   privacy flows using synthetic fixtures. Verify cleanup of only those fixtures.
4. Run browser workflows against the independently hosted staging runtime. Retain
   the existing production app and data until separately approved cutover.

At the 2026-10-21 continuation, Chrome was absent from the browser inventory and
no callable Supabase connection was exposed. The in-app prototype is still a
local UI prototype, not proof that the hosted backend tests have passed. No live
Auth/image acceptance, migration deployment or full release completion is claimed.
