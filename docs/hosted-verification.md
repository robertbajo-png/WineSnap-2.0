# Hosted Supabase verification - 2026-09-07

## Follow-up: download authorization

The working branch now downloads label bytes with `cache: no-store`, displays
component-owned blob URLs, and releases/refreshes them on Auth changes and focus.
It no longer caches transferable signed links. Stored legacy signed URLs are
parsed back into Storage paths instead of reused.

New migration `20260907100000_disable_label_signing.sql` restricts single, batch,
and transformed-image signing using Supabase's operation-aware policy helper:
https://supabase.com/docs/guides/storage/schema/helper-functions
Deploy the frontend before applying this policy; old clients need signed URLs.
Require `storage.allow_any_operation(text[])` on the target Storage version.

On 2026-09-09 this migration was applied to WineSnap-test and recorded in
supabase_migrations.schema_migrations in the same transaction. The SQL result
confirmed the RESTRICTIVE policy. The connection was recovered by resetting the
browser tool session and selecting the in-app browser directly. The previously
pasted SQL was in the AI prompt, not the SQL editor; no SQL had been submitted.

All 22 updated hosted API checks passed (exit code 0), including owner and anonymous
single signing denial, batch signing denial, shared-image downloads, immediate
post-unshare anonymous download denial and continued owner access. Fixture cleanup
completed. The 18 hosted passes below are historical results from the earlier run.
Browser rendering/Auth-switch tests and production rollout remain outstanding.
The transformed-image signing restriction is covered by local policy tests only;
it has not yet been exercised through the hosted transformation endpoint.

Previously issued signed tokens are NOT revoked by this policy. The former app
issued one-hour tokens, but API callers could request different lifetimes.
Do not claim all legacy links are invalid after one hour. Immediate legacy-token
invalidation requires a separately verified object-path migration/deletion and
cache strategy, preserving owner data. Nothing can retract already saved bytes.

## Scope

Only WineSnap-test (`pzniyupmgwvlldvztzqh`, eu-west-1) was changed.
No production database changes or Edge Function deployments were performed.

The first 20 migrations were installed from pinned commit
`5e873736d76efc4cd6ad4a92382adc0b1ac89e76`, with per-file SHA-256
verification, into an empty hosted PostgreSQL 17.6 database. The installer
removed explicit outer transaction wrappers and executed the batch atomically.
This verifies hosted schema installation, not a Supabase CLI deployment.
The temporary HTTP extension was removed afterward.

All public-schema base tables have RLS enabled. The wine-labels bucket is private.

## Results

- 18 hosted API checks passed using real Auth-issued JWTs, PostgREST and Storage.
- Owner access and denial for unrelated users verified for private wines/images.
- Anonymous access to base wine tables and private profile fields denied.
- Explicitly shared images can be signed and downloaded anonymously.
- Expired signed image URL rejected; unsharing blocks new signing and share lookup.
- A synthetic legacy-format share ID containing `+` and `/` resolves through the API.
- Follow relation visibility tested for participants, unrelated private relations and anonymous users.
- The rate-limit RPC admitted exactly 20 of 32 simultaneous authenticated requests.
  This does not test actual AI-provider calls or deployed Edge Function wiring.
- Test images and accounts were removed after the run.
- 18 local database tests passed against all 21 migrations (71 assertions).

Run the hosted checks with `bun tests/database/hosted.mjs`, providing
`WINESNAP_TEST_PUBLISHABLE_KEY` and `WINESNAP_TEST_SECRET_KEY` as environment
variables. Never commit credentials. The runner is hardcoded to this test project.

## Bug Found And Fixed

Deleting an Auth user with a wine failed with HTTP 500. The wine deletion trigger
attempted to recreate a taste profile during cascading account deletion.
Migration `20260907090000_allow_user_deletion.sql` skips recomputation when the
parent Auth user no longer exists. Local regression and real Auth API deletion
both pass. This migration is installed only in the test project (21 total).

## Remaining Work

1. Previously issued signed image URLs still return HTTP 200 after unsharing.
   Their tokens remain usable until expiry; there is no immediate revocation in
   the current implementation. Choose and implement an explicit revocation policy.
2. Validate the production upgrade path separately. Clean installation does not
   prove preservation of existing production records or CLI migration history.
   Synthetic legacy-ID lookup is not an end-to-end browser test of old links.
3. Verify deployed AI model identifiers, timeout/error behavior, and cron reporting.
4. Implement browser E2E for login, scanning, cellar, sharing and wishlist;
   complete desktop/accessibility/PWA update checks.
5. Repeat release checks using a clean dependency installation. An earlier build
   used copied dependencies with a Lovable config version older than the manifest.

The passing checks are not a production-release approval or completion of all
previously identified frontend/backend work.
