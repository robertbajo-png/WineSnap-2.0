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

### Authenticated restaurant retest, 2026-10-03

The deployment instruction for `restaurant-match` and preview commit `6d632e3`
was accepted by Lovable. Its final deployment/build reply could not be read
because editor tabs repeatedly lost their browser debugging connection. No
specific deployed function version or frontend commit is inferred from this.

The actual authenticated WineSnap preview restaurant flow now succeeds with
the same three-wine menu that previously failed. For grilled salmon and a
650 SEK budget, Louis Jadot Bourgogne Pinot Noir (2022, 590 SEK) ranked first
at 75%, followed by Zehn Morgen Chardonnay & Weisser Burgunder (2023, 490 SEK)
at 59%. Vietti Barolo Castiglione (2021, 990 SEK) appeared last, explicitly
marked over budget and weak for the dish. All names, vintages and prices
matched the supplied menu. These are application estimates, not independently
validated sensory ratings.

The scan named `Releasekontroll` appeared in history, survived a page reload
and reopened with the same three results and input values. No preference
feedback, wishlist save or deletion was performed in this retest. Captured
browser warning/error logs were empty. Screenshot evidence is stored outside
Git as `WineSnap-restaurant-release-20261003.png` in the parent workspace.

Both GitHub Quality runs for `6d632e3` (37088164292 and 37088164478) completed
successfully. Remaining release gates are confirmation of the latest preview
build, wishlist duplicate-guard UI verification, responsive checks, frontend
publication, the production October 2 signing policy after publication, and
authenticated checks on the published origin. Do not report release completion
or apply the signing policy before the compatible frontend is published.

### Published frontend verification, 2026-10-03

The user published the frontend in Lovable. The public origin
`https://wine-scene-snap.lovable.app/sw.js` returned HTTP 200 with JavaScript
and cache version `2026-10-03`, replacing the previously observed `v1`.
This confirms the updated service worker is served, not an exact frontend
commit identifier or successful activation in every existing client.

In an authenticated browser session on the published origin, the cellar
contained all 9 wines and all 9 image elements loaded successfully from blob
URLs. The production restaurant history displayed the saved `Releasekontroll`
scan with three choices and the 75% Bourgogne Pinot Noir recommendation.
Captured browser warning/error logs were empty. Evidence is stored outside
Git as `WineSnap-published-history-20261003.png` in the parent workspace.

The compatible download-based frontend is now demonstrably live. The October 2
production signing policy remains unverified and was not applied in this pass:
Lovable's editor still failed to expose usable project controls. Wishlist UI
duplicate protection, responsive checks, post-policy image/share verification
and remaining authenticated release checks are still outstanding. Publication
alone is not the final release signoff.

### Responsive review and signing-policy approval, 2026-10-03

The published restaurant form and saved results were visually checked at
390 x 844 and 1440 x 900. Document width matched viewport width at both sizes;
no horizontal overflow or obvious text collisions were observed in those
views. The temporary viewport override was reset. This is a focused responsive
check, not a complete accessibility audit of all routes.

Lovable subsequently confirmed production project `mervdrbnwgreaifobasw` and
that the signing policy did not yet exist. Its approval dialog showed the
exact SQL from `20261002090000_disable_label_signing.sql`. An `Allow once`
action was attempted, but browser control timed out before its result could
be read. Successful execution and migration-history recording are still
unconfirmed; do not infer either from the approval attempt or rerun blindly.

### Wishlist normalization regression, 2026-10-03

The local concurrent-save key now uses the same normalized vintage as the
database row. Numeric `2023` and string `"2023"` therefore share one in-flight
request, as do `"NV"` and a missing vintage, both stored as null. Different
vintages remain distinct and a failed lookup does not block retries. Four
new tests cover these cases; all eight wishlist tests pass. This change still
does not provide cross-device database uniqueness and has not been confirmed
in the published frontend. It requires the next frontend publication.

### Production signing-policy confirmation, 2026-10-03

Lovable's completed migration reply was read in the project UI. It reports
successful execution in production `mervdrbnwgreaifobasw`, followed by SQL
verification in `pg_policies` and `pg_policy`: the policy is RESTRICTIVE,
SELECT, for `{anon, authenticated}`, with the exact operation-denial expression
from the reviewed migration. The `wine-labels` bucket remains private.

The Cloud tool registered the execution as version `20261003083028`, not the
original filename's version `20261002090000`. Its generated migration file
`20261003083028_3d137b11-ee61-411b-bc1a-60017229d20c.sql` was fetched and reviewed;
its SQL matches the original idempotent policy. Both files are retained and
the remote changes were merged without overwriting them. This supersedes the
previous unconfirmed approval status; do not rerun the production migration
merely because the original filename's version is absent from history.

Local typecheck, lint and all 106 tests passed for the wishlist normalization
change. The merged main `ceefd0b` passed all GitHub Quality steps, including
production build, in run 37112341562. The redundant slow local build was stopped
after the complete CI result was verified.

Post-policy authenticated download/share checks and owner-signing denial
still require direct verification against production. Publication of the
latest wishlist normalization change is also still unconfirmed: browser
control disconnected before the latest preview/publication workflow could
be completed. SQL policy verification is not a substitute for those final
application checks. Lovable also reported seven existing database-linter
findings, including public-schema extensions and callable SECURITY DEFINER
functions; their exact definitions and privilege requirements need review
before classifying them as harmless or release-blocking.

### Post-policy published image check, 2026-10-03

The user reported another frontend publication. In the authenticated published
app, eight AI recommendations were visible from the earlier generation.
After navigating to the cellar with the production signing policy active,
all nine image elements loaded successfully as blob URLs (9 of 9, with
nonzero natural width). Screenshot evidence is stored outside Git as
`WineSnap-post-policy-cellar-20261003.png` in the parent workspace.

Browser control lost its debugger connection during the subsequent wishlist
baseline check, before any wishlist save or preference feedback was performed.
The published duplicate-save regression is therefore not yet verified. Nor
does successful owner image display prove owner-signing denial or anonymous
shared-image access; those remain separate production checks. The exact latest
frontend commit was not independently identified in this pass.

### Published wishlist duplicate regression, 2026-10-03

The authenticated published wishlist contained five entries before the test.
Saving the existing recommendation `Grant Burge - Hillcot Merlot 2021`
succeeded; its button displayed `Sparat` and was disabled. After a full page
reload, the same recommendation was saved again through the normal UI.
The wishlist then contained six entries in total and exactly one Grant Burge
entry. This verifies the published sequential duplicate guard across reloads,
not simultaneous independent-device uniqueness or the mixed-type vintage
case covered by unit tests. No preference feedback or deletions were performed.
The single new test wishlist entry remains; the five prior entries are intact.
Evidence is stored outside Git as `WineSnap-wishlist-regression-20261003.png`.

A preliminary local review found that social-discovery SECURITY DEFINER
functions are intentionally granted to authenticated users, reject a null
`auth.uid()` and filter discoveries to public profiles. This does not resolve
the complete production linter report: exact live definitions and privileges
still need checking. Browser access to Lovable failed before the remaining
production signing/shared-image and linter checks could be completed.
