# Step 2: Database security verification

Date: 2026-09-05. Local implementation and PostgreSQL verification complete.
No production migration or deployment performed.

## Changes

- Preserved existing share IDs; new IDs use URL-safe encoding. Encoded legacy IDs are retained in friend links.
- Preserved existing usernames, including legacy whitespace and spelling. New names and renames are validated by a trigger. Public lookup escapes LIKE wildcards and remains case-insensitive.
- Removed silent numeric clamping and username deletion from the migration. Invalid legacy numeric data aborts the constraint migration transaction without rewriting data or partially applying its DDL.
- Required matching photo-row owner, wine owner and storage-folder owner for public image access. Added ownership checks for photo writes and tasting-note associations.
- Decoded percent-encoded legacy image paths during photo backfill, stripping URL query and fragment components. The temporary decoding helper is removed within the migration.
- Removed obsolete client admin-role policies that called an execution-restricted helper. Clients can read their own roles but cannot promote themselves; aggregate admin statistics remain protected by the admin RPC.
- Added a repeatable database test command, pinned test-only PostgreSQL dependencies and scoped binary-package installation permissions for Windows and Linux CI.

## Evidence

The original username normalization failure was reproduced with two synthetic names that become equal after trimming. A pre-existing case-insensitive index already prevents case-only duplicates; the more general warning in the step 1 report is narrowed accordingly.

All 18 repository migrations now apply to a disposable PostgreSQL 18 cluster with synthetic data. Sixteen tests passed with 65 assertions, covering:

1. Existing names and public share IDs are preserved.
2. Anonymous readers can access only public views, without private columns.
3. Authenticated users can read and modify only their own base rows.
4. Private images stay private despite a forged legacy association.
5. Forged new photo associations are rejected.
6. Unsharing removes anonymous SQL access to the wine and its image.
7. Admin statistics reject ordinary and anonymous users.
8. Exactly 20 of 32 simultaneous requests are admitted by the analysis rate bucket.
9. Role rows are owner-readable and client privilege escalation fails.
10. New usernames are validated without rewriting existing names.
11. New share IDs are URL-safe while legacy IDs resolve in the public view.
12. Owners can manage photos and notes; foreign wine associations fail.
13. Foreign storage uploads, moves and deletes are rejected.
14. Invalid new numeric values are rejected.
15. Every rate bucket enforces its quota, expiry resets the window, and missing identities fail closed.
16. Invalid legacy values cause transaction rollback with original data intact.

Run: `bun run test:database`. Tests bind only to loopback, use random local credentials, and stop the database and remove their own temporary directory after completion. They never use the application's Supabase URL or credentials.

## Remaining Boundary

The fixture implements the Supabase database contracts needed by these migrations: roles, `auth.uid()`, storage metadata tables and folder parsing. It does not run Supabase Auth, PostgREST or Storage HTTP services. It therefore verifies real PostgreSQL policies, grants, migrations and concurrency, but not JWT handling or creation/fetching of actual signed image URLs.

Before production deployment, repeat the integration checks against a Supabase test environment matching the deployed PostgreSQL version, including signed image URL creation, unauthenticated fetching, and URL routing for legacy IDs. Previously issued signed URLs can remain valid until their expiry even after sharing is disabled; the SQL policy test does not imply immediate token revocation.

Production data has not been inspected. Existing invalid numeric values will intentionally block the constraint migration and require explicit remediation. Frontend public-view queries, migrations and edge function changes need coordinated deployment. Later plan steps remain paused.
