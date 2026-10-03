# WineSnap 2.0 release

## Environment check

On 2026-09-30 Lovable reported the production project as
`mervdrbnwgreaifobasw`. It reported that migrations dated September 23-28
were not applied, the wine-labels bucket was still public, and the new AI
conversation and preference extraction functions were not deployed.
This is a deployment prerequisite, not a successful release.

## Rollout order

1. Confirm a recoverable database backup and rehearse pending migrations in the
   separate test project. Never reset the production database.
2. Inspect migration history and apply only missing migrations in this order:
   - `20260923090000_harden_ai_and_wine_images.sql`
   - `20260924090000_add_wine_memory_foundation.sql`
   - `20260925090000_add_ask_winesnap.sql`
   - `20260926090000_add_recommendation_feedback.sql`
   - `20260927090000_add_social_discovery.sql`
   - `20260928090000_add_restaurant_menu_mode.sql`
   - `20261001090000_restrict_memory_table_grants.sql`
3. Run the read-only invariant checks in `supabase/tests/step1_security.sql`
   through `step6_restaurant_menu.sql`. Test real JWT owner/non-owner access
   in the separate test environment.
4. Deploy `analyze-wine`, `extract-preference-signals`, `ask-winesnap`,
   `taste-suggestions`, `wine-suggestions`, and `restaurant-match` from the
   reviewed commit. Confirm the managed gateway key is present without
   exposing its value.
5. Verify authenticated AI calls and private/shared images before publishing
   the matching frontend to `wine-scene-snap.lovable.app`.
6. Test scan confirmation, tasting notes, Ask, recommendations, discovery,
   restaurant text/photo analysis, and wishlist saves on the published app.
7. After the download-based frontend is live, apply
   `20261002090000_disable_label_signing.sql`. This prevents new bearer image
   tokens, not previously issued tokens; those remain valid until expiry.
   Verify owner/shared downloads and denied signing via Storage HTTP.

## Release evidence

Local validation on 2026-10-01 passed: TypeScript, ESLint, production build,
75 Vitest tests, and a PostgreSQL rehearsal of all 26 migrations and six
invariant scripts. Owner/non-owner restaurant history, legacy share/image
preservation, and restaurant feedback-to-memory checks also passed.
The rehearsal found inherited platform grants on memory tables; migration
`20261001090000_restrict_memory_table_grants.sql` fixes those grants.
Hosted JWT, Storage HTTP, and deployment remain unverified.

### Production backup check, 2026-10-01

Direct inspection of WineSnap's Lovable Cloud Database > Backups showed a
restore point dated 2026-10-01 02:26:27 UTC and earlier daily restore points.
No restore was attempted; listing a restore point is not a restore rehearsal.
A fresh export was requested in Cloud > Overview > Advanced settings >
Export project data. The UI confirmed "Database export started" and said a
temporary download link would be emailed when ready. Export completion,
download integrity, and a restore rehearsal are still pending.

The export dialog explicitly directs users to download Storage files
separately. Do not treat the database export as a backup of bottle images.
The signed-in Supabase organization showed WineSnap-test
(`pzniyupmgwvlldvztzqh`) as paused; WineSnap production was inspected in
Lovable Cloud, not in that test project's dashboard. No production migration,
Edge Function deployment, or frontend publication was performed.

### Export download and test resume, 2026-10-01

Cloud Storage showed private bucket `database_export_01_10_26` containing
`wine-scene-snap_261001.backup` (372 KB). The export downloaded locally as
`wine-scene-snap_261001.backup.zip` (381210 bytes). ZIP metadata was readable
and its backup payload began with the PostgreSQL custom archive magic `PGDMP`.
SHA256 of the downloaded ZIP:
`8038E0BE791738337FF35CB3ABF0B162FBEA3CA3E1ED6367ABD1F7D442D029BB`.
These checks establish a downloaded archive, not a successful restore.
The archive contains production data and must stay outside version control.

Resume was requested and confirmed for the named WineSnap-test project.
Its dashboard then showed startup status "Checking..."; a subsequent
unauthenticated Auth health request returned HTTP 401. This establishes
gateway reachability, not successful JWT or database tests. Browser control
disconnected before the remaining checks could run. No production migrations
or publication were performed, and Storage image backup remains pending.

For a local PostgreSQL rehearsal, run `node scripts/rehearse-migrations.mjs`
with a dependency directory containing `embedded-postgres` and `pg` as the
optional first argument. This creates an isolated temporary database, applies
all migrations, runs all six invariant scripts, and tests owner isolation,
legacy shares/images, and restaurant feedback. It does not simulate hosted
JWT verification or Storage HTTP and does not connect to production.

### Release checks, 2026-10-02

The downloaded production archive was restored into isolated local PostgreSQL
using `scripts/rehearse-backup.mjs`. All eight pending migrations and
six invariant scripts passed. The 9 wines and 8 wine photos were restored;
wine IDs, share IDs and image URLs were preserved. This is an application
schema/data restore, not full Supabase platform recovery: Auth/Storage platform
contracts were mocked, with synthetic Auth IDs derived from application rows.

All 13 bottle images were downloaded separately as
`bucket-wine-labels-files.zip` (1097027 bytes), SHA256
`456AB95E1644EF126E363BC32BED655F7992BC4E12AAC23A60CB79F0D777E5AF`.
The archive stays outside version control with the database export.

WineSnap-test was resumed. Seven schema migrations dated September 23 through
October 1 were applied atomically with migration history records; all six
read-only invariant scripts passed against the hosted database. Its overview
still reported Unhealthy, so successful SQL is not proof of Storage/Auth health.
`scripts/check-hosted-security.mjs` subsequently passed 24 actual JWT/Storage
checks, including owner isolation, legacy shares, single/batch signing denial,
private follow relations, memory write denial and exactly 20 of 32 concurrent
service quota calls. All synthetic fixtures were removed. Production rollout
is not yet complete.

The test project retains a restrictive image-signing policy from its previous
release. WineImage now uses authenticated, uncached downloads and component-local
blob URLs, clears them on Auth changes, and rechecks on focus. A fresh cache nonce
is required on each download: no-store alone failed the hosted unshare test
because an intermediary retained the prior successful anonymous response.
New uploads set cacheControl to zero. Previously cached responses and signed
tokens are not retroactively revoked by this change. The new signing
policy must follow deployment of that frontend in production.

Record the migration versions, deployed commit, Edge Function versions,
published URL, and actual results of the authenticated checks. A passing
local build or a successful push alone does not confirm a production release.

If deployment fails, keep the previous frontend available and fix the failing
dependency before retrying. Do not restore public image access as a workaround.

### Production rollout and authenticated checks, 2026-10-03

PR #2 was merged as `0892fe8`. The seven production schema migrations dated
September 23 through October 1 were applied in a single transaction, with
migration history and all six invariant scripts. The production result
confirmed preservation of legacy wine fields: 9 wines and 9 wine photos after
the expected image backfill; the image bucket remains private.

Lovable reported deployment of all six AI functions from the merged code and
verified OPTIONS 200 and unauthenticated 401 responses. `ask-winesnap` was
subsequently redeployed from `53a255a` after a real authenticated answer ended
mid-word. Its output budget is now 4096; token-limited responses are rejected
before storage. An authenticated three-sentence answer completed and was read
back intact from conversation history after a page reload.

The original `54456874_400.webp` was uploaded through WineSnap's actual preview
UI. The result identified ZEHN MORGEN, NAHE, CHARDONNAY and WEISSER BURGUNDER.
It was discarded rather than stored as a duplicate. All 9 existing cellar
images loaded as authenticated blob URLs. Comparison selection updated and
the UI confirmed a saved comparison. Social discovery displayed its honest
insufficient-evidence state without making the user's profile public.

The real restaurant request initially failed with upstream HTTP 400 and
application HTTP 502. Synthetic gateway probes reproduced the failure and
confirmed that the full schema, including nullable union types and forced
tool choice, succeeds when `additionalProperties`, `maxItems`, `minimum`
and `maximum` are removed. The fix retains all menu properties and enforces
the 40-wine cap and intensity bounds in application code. Missing or truncated
tool responses fail instead of silently returning an empty successful result.
Frontend failures are translated instead of exposing raw function errors.

The October 2 signing policy was verified and recorded in WineSnap-test.
Frontend publication, the final production signing policy and authenticated
restaurant retest remain pending; these observations are not a release signoff.

The authenticated recommendation request returned eight ranked wines. A repeated
save revealed missing duplicate protection for suggestions without a cellar ID;
the two test wishlist entries were not deleted. The client now checks existing
producer/name/vintage, coalesces concurrent saves and disables successful saves.
This is not a database uniqueness guarantee for simultaneous independent clients.
The release service-worker cache version is `2026-10-03`; activation only removes
WineSnap caches and registration also handles hydration after the load event.

Restaurant fix `7414919` was pushed to main and passed GitHub Quality runs
37087362475 and 37087362476. The subsequent deploy instruction could not be
confirmed: browser control timed out, then Chrome disconnected entirely.
No successful restaurant redeployment or frontend publication is claimed.
Resume with the latest main, deploy restaurant-match, repeat the authenticated
menu test, publish the frontend, then apply the October 2 signing policy and
verify the published app. Do not apply the signing policy ahead of the frontend.
Temporary hosted-test credentials were removed from the local filesystem.
