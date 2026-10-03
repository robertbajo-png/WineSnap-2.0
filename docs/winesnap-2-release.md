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

### Final-pass accessibility fixes and remaining gates, 2026-10-03

The scan-description label now targets its textarea and its hint is connected
with `aria-describedby`. The restaurant menu textarea now has an explicit,
localized accessible name (Wine list / Vinlista) and a connected hint. These
are focused source fixes, not a completed keyboard, screen-reader or contrast
audit, and require frontend publication before they can be verified live.

The release signoff is still withheld. A fresh Lovable project tab displayed
`Reconnecting` and subsequent read attempts failed. No new production SQL,
permission changes or signing requests were executed in this pass. The exact
seven live database-linter findings, authenticated signing denial, anonymous
access to intentionally shared images and existing-client service-worker
activation remain unverified. The earlier 106-test CI pass remains evidence
for the previous application revision, not for these new accessibility edits.

GitHub Quality subsequently passed all steps for application commit `3286908`
on main (run `37121844333`): typecheck, lint, tests and production build. The
local targeted lint also passed after normalizing working-copy line endings;
that normalization produces no tracked diff. This supersedes the preceding
test-evidence limitation for the accessibility changes, but does not confirm
their publication or remove the outstanding production release gates.

### Live privilege review and anonymous Storage HTTP tests, 2026-10-03

Lovable's completed read-only production review was read in its project UI.
The signing policy remains restrictive and the bucket private. Its linter
returned types/counts, not per-object identifiers; the following object mapping
is inferred from live definitions and grants, not exact linter object output:

- RLS-without-policy on `ai_rate_limits`: intentional client denial.
- Anonymous SECURITY DEFINER access to `is_public_wine_photo(text)`:
  intentional boolean-only shared-photo helper.
- Authenticated SECURITY DEFINER access to that helper and the three social
  discovery functions: intentional, with authenticated identity checks,
  public-only discovery and bounded results.
- Extension-in-public: live `pg_net` 0.20.0, not evidence that moving the
  historical UUID extension would resolve this particular finding.

Live schema checks report no CREATE privilege on `public` for the client roles.
Sensitive AI/memory/trigger functions are not executable by PUBLIC, anon or
authenticated. This does not justify dismissing the extension finding: the
follow-up found platform-owned `net` functions, tables and queue sequence with
PUBLIC privileges. Queue/response contents were not read or printed.

Actual anonymous production HTTP tests used one already-public shared image
(four shared photos were available), without creating or sharing anything:

- Download with cache nonce: HTTP 200, image/jpeg, 40,222 bytes.
- Public bucket URL: HTTP 400, consistent with a private bucket.
- Single signing and image-resize signing: HTTP 400, object not found.
- Batch signing: HTTP 200 envelope, but item-level access error and null
  signedURL. This is a denied signing request, not a successful bearer URL.

These results verify anonymous shared download and signing denial. They do
not prove authenticated-owner signing denial. No JWTs, keys or image paths
are included in this report.

### Platform-owned pg_net follow-up and remaining signoff, 2026-10-03

The follow-up reports 12 pg_net-owned SECURITY INVOKER functions owned by
`supabase_admin`, with default PUBLIC EXECUTE. The `net` queue/response tables
and queue sequence also have PUBLIC privileges. The sole active price-check
job runs as `postgres`; removing inherited rights without preserving explicit
schema/function/table/sequence rights would break the job. No application
wrapper calling `net.*` was found.

Actual anonymous REST requests for both net tables returned HTTP 406 PGRST106:
only `public` and `graphql_public` are exposed. This limits observed exposure,
but is not a GraphQL test or a complete proof of isolation. The migration role
is neither superuser nor a member of the platform owner. No ineffective REVOKE,
extension removal, cron modification or security weakening was attempted.
Owner-level privilege hardening needs platform support, or an explicitly
reviewed risk decision; it is not recorded as fixed.

Publishing main `19326f1` was approved with `Publish once`, not persistent
approval. The updated Wine list label was observed in the published restaurant
SSR view before the unauthenticated client redirected to login. This is live
evidence of the label fix, not an exact deployed commit identifier or a
completed authenticated accessibility check. Lovable confirmed the source
revision and no source/data changes, but did not supply a definitive completed
deployment revision.

A subsequent request to verify GraphQL exposure, publication completion and
whether an existing owner session was usable remained in the chat input;
connection failures prevented confirmed submission. Do not treat those checks
as dispatched or passed. Authenticated-owner signing, existing-client SW
activation and the remaining keyboard/screen-reader/contrast review are still
open. Final release signoff remains withheld. No production migration or
user-data changes were made in this review.

### GraphQL isolation and preview-build diagnosis, 2026-10-03

The previously unsent follow-up was subsequently submitted and its completed
Lovable report read. An actual anonymous request to `/graphql/v1` returned
`pg_graphql extension is not enabled.` There was no introspection result or
exposed net table/function. Together with the earlier REST schema denial,
this closes the observed REST/GraphQL exposure check, not owner-level pg_net
hardening or every possible future exposure path. Do not perform a cron-breaking
REVOKE with the migration role or treat the platform's inherited grants as fixed.

The Lovable UI subsequently displayed Build unsuccessful / Preview is out of
date for docs-only `82cd7ee`. A requested diagnosis rebuilt exactly that revision
successfully (`bun run build`, exit 0, 5.81 seconds) and passed `tsgo --noEmit`.
It found no build-errors log and no reproducible source/build error. No repair
or source modification was made by Lovable. Its later reply describes the
previous publish as successful, but no immutable deployed revision was provided;
the earlier tool-status limitation remains documented above.

The language provider now updates the document's `lang` when the selected
language changes, and initial language loading handles denied localStorage
access instead of throwing. Local typecheck, lint and all 106 tests passed for
this focused fix; the production build and live publication are tracked below.
This is not a complete screen-reader/contrast audit.

Owner-signing still needs an authenticated production session. Lovable's sandbox
has none; no administrative impersonation/session creation was authorized or
attempted. User approval and the user's own account identifier have been
requested for a temporary image-test session, to be ended afterward. Browser
policy does not allow visiting Chrome's internal service-worker page; no
workaround was attempted. Existing-client SW activation remains unverified.

### Published language fix verified, 2026-10-03

Application commit `cf431f2` passed the complete local check (typecheck, lint,
106 tests and production build, exit 0) and GitHub Quality main run
`37135855148`. It was pushed to main and the working branch. Lovable confirmed
that revision, requested publication and received `Publish once` approval.

In the actual published login page, the Swedish heading initially had HTML
lang=en before this release. After publication and reload/client hydration,
the heading is Swedish and `document.documentElement.lang` is sv. This directly
verifies the language fix live; normal English SSR before hydration is not
mistaken for a failed client-language update. Tab from the email field focuses
the password field and document width does not exceed the viewport. Screenshot
evidence is stored outside Git as `WineSnap-published-language-20261003.png`.

This live behavior confirms the source fix is published without asserting an
immutable deployment ID. Owner signing remains pending the requested human
approval/account identifier. No new auth session was created. SW activation in
previously open clients, broader accessibility review and platform-owned pg_net
privilege hardening remain distinct open items; final signoff is not inferred
from the successful publication or test suite alone.

### Authenticated owner image test completed, 2026-10-03

The user explicitly approved a temporary session for their own existing
production account. Lovable received an Allow once approval, not persistent
access. Its completed report confirms tests with a real owning user JWT against
an existing private wine-label photo in production `mervdrbnwgreaifobasw`:

| Operation | Actual result |
| --- | --- |
| Normal download with cache nonce | HTTP 200, image/jpeg, nonempty content |
| object.sign | HTTP 400 not_found, no signed URL |
| object.sign_many | HTTP 200 envelope; item access error and null URL |
| render.image_sign with 100x100 cover resize | HTTP 400 not_found, no signed URL |

This closes the previously pending owner-signing check. The batch HTTP 200 is
not successful signing: its item was denied. No password, permissions, sharing,
wine data, code, migration, cron or publication was changed; no account was
created. No email, object path, token or secret is recorded in this document.
The report was read in the Lovable UI; this is delegated production test
evidence, distinct from Codex's direct published-page observations.

Lovable reports local-scope logout returned 204, refreshing that temporary
session then failed with 400, and its sandbox session file was removed. Other
sessions were not logged out. The existing access JWT still passed an immediate
user check after logout; its expiry was not measured. Therefore cleanup means
refresh was revoked and the stored test credentials removed, not immediate
invalidation of that already issued JWT or proof that every trace was erased.

Screenshot evidence is outside Git as `WineSnap-owner-image-test-20261003.png`.
All owner/anonymous image-signing checks now pass. Existing-client service-worker
activation remains unverified; broader accessibility review and platform-owned
pg_net grant hardening remain separate follow-up items. No universal release
signoff or immediate token expiry is inferred from this successful test.

### Final accessibility and platform follow-up, 2026-10-03

Lovable's fresh basic security scan reported no findings; this is not a deep
code audit. Project monitoring still contained three older issues. The Ask
composer scroll and raw error-message reports are superseded by existing
overflow-x-clip/sticky layout and localized askErrorKey handling. The admin
permission report is valid: user_roles policies still call has_role, whose
EXECUTE is revoked from authenticated. A policy query can fail even for a user's
own role row. Do not restore the unrestricted has_role RPC to clients.

Local changes add an explicit retryable admin permission-check error instead of
misreporting a query failure as lacking an admin role. Signed-out loading and
stale responses are handled. Wine statistics describe accessible wines, not an
unverified global total. Production policy repair needs separate approval and
must preserve existing roles and restrict the helper to the caller's identity.

Delegated live axe WCAG 2 A/AA checks returned zero violations on /login,
/forgot-password, /reset-password, / and /about. Login/recovery keyboard order
and field labels were checked. No new authenticated session was created, so
this does not certify every signed-in screen or screen-reader workflow.

Focused source fixes add a skip-to-content link, prominent focus-visible
outlines, named cellar search, filter pressed states, active-page navigation
and localized scan labels/hints. Slider accessible names and descriptions now
reach the focusable thumb, rather than only the wrapper. Four new server-render
regression tests cover thumb semantics and active navigation. Publication and
live verification of these new changes are recorded after their build succeeds.

Lovable's ordinary app-browser tools confirmed an active controlling /sw.js
with VERSION 2026-10-03, only that version's WineSnap caches, and the same state
after reload and after clearing/recreating caches. This was a clean browser:
it proves current installation, not an old already-open client's upgrade.
No Chrome internal-page restriction was bypassed. Existing cache cleanup also
has local tests; neither observation is mislabeled as an old-client upgrade.

pg_net remains owned by supabase_admin. Its default grants are only inferred to
be platform defaults, not confirmed by support. REST and GraphQL exposure tests
remain closed as above. Any platform-owner hardening must preserve the postgres
price cron's schema/function/table/sequence rights first. No ineffective REVOKE,
extension removal, cron change, role assignment or external support submission
was performed. This platform follow-up is unresolved, not silently fixed.

### Final frontend fixes pushed; publication verification blocked, 2026-10-03

Application commit `aca61df` is pushed to main and the working branch. The
complete local check on that final source, including the taste range label,
24px hit area and visible parent focus ring, passed: typecheck, lint, 110 tests
in 24 files and client/SSR/production build, exit 0. The four new tests passed
independently too. No production database privileges were changed.

Lovable received a request to build/publish this revision only after its build
passes, verify live skip-link/focus/axe behavior, close only the two already
resolved Ask reports, and attempt an isolated old-to-new worker lifecycle test.
The message was visibly submitted and Lovable started working. Subsequent
browser reads and screenshots repeatedly timed out; a fresh project view showed
Reconnecting. Therefore no completed publication, issue closure, live focused
UI result or old-to-new worker test result is claimed for this revision.

The explicit approval question for the production admin-policy repair remains
unanswered at this point. No migration or new auth session was created. The
pg_net platform-owner follow-up remains unresolved as described above. This
section records verified code completion and concrete external/approval
blockers, not a completed universal release signoff.
