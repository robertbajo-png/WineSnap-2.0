# DEV-03 Core Experience Checkpoint

Scope: source and isolated synthetic frontend work, followed by the November 13
owned installation checkpoint below. Earlier source sections describe their
recorded stage, not the latest installed state. Source-only tests, installed
fixture checks, actual owner authentication and human usage are separate evidence.
Old production, abandoned hosted test and internet activation remain excluded.

## First Source Slice

- The wine-detail bottle and gallery thumbnails now use contain, not cover:
  tall labels/bottles remain inspectable without cropping their top or bottom.
- Unbroken wine names, origins, grapes and aroma labels can wrap within their
  existing columns. The approved dark palette, home and camera layout remain.
- The back control uses the existing translated label and tooltip.
- Gallery editing defaults to read-only and requires explicit owner editability
  plus a signed-in user. The detail page also hides edit/delete controls for a
  non-owner. Existing Auth, RLS, image access and storage rules are unchanged;
  hiding controls is not an authorization boundary.
- Public sharing is unavailable in owned/private builds and on loopback or
  otherwise unsuitable origins. The menu explains this before any mutation.
  The click handler independently rechecks availability before querying/updating
  a wine. Existing public flags and legacy share IDs are not changed or revoked.
- The service-worker revision is prepared for the next owned update. No running
  owner's browser is reloaded or updated automatically.

## Verification Method

The focused unit suite covers public-sharing availability and read-only/owner
gallery controls, alongside the existing aroma controls. Its latest run passed
three files / 22 tests. Earlier overloaded local runs were interrupted, not
counted as passes. Full CI and browser results must be recorded separately.

`scripts/check-core-experience-browser.mjs` accepts only a synthetic frontend
artifact with the known fake URL/key markers and no hosted project URL. Its
server has outbound fetch blocked and listens on a separate random loopback
port, never the installed app/API/inbox ports. Browser data comes from mocked
fixture GETs; no real login, owner session, user image or AI provider is used.
It checks long labels and contained media at 320/390/1440 px and 125% root text,
disabled local sharing, keyboard return and read-only gallery controls. Ignored
screenshots and a credential-free status report live in `dist/core-experience`.
This is source UI evidence, not installed backend/RLS or physical-device proof.

On this slow Windows checkout, the compiled fixture can also be exported with
the Dockerfile's separate `artifact` target and the same fake public URL/key.
That target copies only `dist/independent-runtime`; the normal final `runtime`
stage remains the default. No image needs to be started or connected to an owned
network. The existing Docker build-input allowlist remains unchanged. Never pass
server/provider secrets as build arguments or run this fixture as the real app.
An earlier full development-image export was cancelled after compilation; it is
not a completed export or installation.

## Observed Source Acceptance

- The isolated artifact export completed successfully. The deployment contract
  suite passed four tests, including the artifact-only copy and unchanged final
  non-root runtime stage. These are separate from the 22 focused UI/domain tests.
- The source browser check passed all six cases: full bottle/long-label layouts
  at 320, 390 and 1440 px with 125% root text; unavailable local sharing and menu
  keyboard return; read-only gallery; full-height contained photo and focus return.
- Browser page errors, forbidden external requests and mutations were all zero.
  Its isolated server/browser were closed and cleanup was confirmed. No provider
  request, real login, installed-app rebuild or real owner data was involved.
- The three detail screenshots and mobile photo view were visually inspected.
  They contain deliberately long synthetic names and a synthetic bottle only.
- Full GitHub Quality and Database Safety passed for `eb7a011` and the final
  source/tooling checkpoint `5e866da`, both push and PR. This includes typecheck,
  lint, the full unit suite, synthetic build/runtime and client budget, not a
  new real-owner or installed-feature acceptance.

## Second Source Slice: Gallery And Late Responses

- Gallery loading, empty, read error and offline states are distinct. Fresh reads
  use request generations; reconnect may reload metadata but never retries a
  save/delete. A keyed owner/wine/editability boundary removes old photos, crop
  files and lightboxes immediately when context changes.
- Photo writes capture and server-verify the normal owner's JWT before creating
  an immutable account client. Privacy status, wine ownership and current view
  are checked between steps. Existing Storage operation policies already allow
  list/upload/update/delete while blocking direct downloads; none are changed.
- Saves reuse scan reconciliation, a stable metadata UUID, the same private path
  and Blob. A lost upload can explicitly retry the same bytes; a lost insert
  reply is read back before another insert. Pending attempts lock new selections
  and stay only in memory, with a keep-this-page-open warning.
- JPEG/PNG/WebP/GIF/AVIF retain their actual MIME type/extension, within the
  existing 10 MB limit. Unsupported or oversized output is rejected before writes.
- Deletion confirms metadata removal before touching bytes, checks all current
  owner references (bounded, paginated), retains still-referenced/uncertain legacy
  paths and confirms exact-file absence through the permitted listing operation.
  Failed cleanup remains an explicit retry, not a false success or automatic job.
- Wine-detail state is keyed by wine, account and language. Leaving that context
  aborts recommendations; late results and feedback cannot populate the new view.
  Detail-page recommendation/wishlist writes use the original verified account.
  Concurrent suggestion submission is blocked; reconnect/account changes do not
  automatically start another AI request.
- New account operations have bounded network/authentication waits and private
  no-store/no-redirect requests. Existing callers without a scope keep their
  previous contracts; no provider model, role, password or database schema changes.

Focused verification passed eight files / 56 tests, including lost replies,
cross-account guards, denied metadata deletion, retained references on a later
page, uncertain cleanup, MIME validation, cancellation and existing wishlist
deduplication. Full Quality and Database Safety passed for `2de367a` (push and
PR). The earlier `9ebc470` Quality run caught a redundant abort after the
controller had already been narrowed to null; it was corrected, not waived.
The slow local typecheck attempt was interrupted; full CI supplies the current
typecheck evidence.

The extended isolated browser run passed ten cases. In addition to the original
six, it verified read-error/retry instead of false empty state, a delayed read
not replacing a newer gallery, an open crop closing on account change, and an
old AI reply not entering the next account. The latter uses deliberately invalid
synthetic sessions and two mocked AI replies, not real Auth/RLS or provider calls.
Forbidden requests, writes and page errors were zero; process cleanup passed.

## Overview Follow-up And Remaining View Inventory

Visual inspection of the new error-state screenshot caught long fact values
overflowing their mobile row. Overview facts now use semantic definition rows
with bounded label/value columns and anywhere wrapping. The window header can
wrap without shrinking its status dot/clock. Note-creation links are owner-only
with a minimum touch height, consistent with the existing gallery/edit controls.
Three overview widths are added to source browser acceptance. A fresh isolated
artifact passed all thirteen cases, with zero forbidden requests, mutations or
page errors and verified cleanup. The 320/390/1440 overview screenshots were
inspected. Full Quality/Database Safety passed for `e65f00d` (push and PR).
At that source checkpoint these changes were not installed; see the later
installed acceptance section for the current state.

The source inventory also covered the remaining core views:

| View | Reused implementation / next evidence |
| --- | --- |
| Home | Recent-wine owner/read states retained; direct cooking-cache owner check now added below; installed verification remains |
| Scan | Explicit review and insert reconciliation retained; stable upload paths/bounded account writes and expanded fault test passed below |
| Cookbook / Cook Mode | Existing version-pinned recipe, conflict/offline cache, bounded timers and return journeys are retained; rerun affected installed journeys rather than rebuilding them |
| Food memory | Generation-guarded loading, read retry, correction and forgetting exist; broader installed isolation and focus checks remain |
| Family / pairing / meals | Existing keyed kitchen workspace and scoped APIs are retained; history's missing loading/read-retry states are now addressed below; installed journeys remain |
| Prices / collector | Currency-separated totals, manual estimates/source/date and retail matching states already exist; do not replace them with invented market values; installed regression remains |

This is a source inventory, not a claim that the wider DEV-03 UI/keyboard or
installed backend acceptance has passed.

## Meal-history Read States

Meal history now uses the existing OperationNotice for initial loading and read
failures, with explicit retry of its read-only refresh. Empty history is still
shown only after data has been obtained; no write, AI request, recipe version or
meal record is changed by this status improvement.

Three component-render tests cover initial loading, error/retry and confirmed
empty history. The combined focused run passed nine files / 72 tests. Full
Quality/Database Safety passed for `3f8fa37` (push and PR); source-render tests
are not a substitute for the real installed meal-history view. The existing
owned app continues to respond
HTTP 200, while safe read-only access Status still reports the active legacy
viewer and paused internet. No fresh owner grant or forced closure occurred.

## Scan Upload Follow-up

Scan saves now retain their attempt ID after an unsuccessful upload and derive
one private owner/UUID path from it. Manual retry uploads the same Blob to
that path with upsert, rather than leaving a new uncertain file on every attempt.
Successful uploads/uncertain wine inserts still use the existing reconciliation.
Explicit identity edits/discard start a separate attempt, as before.

The normal owner JWT is verified/captured through the bounded account client.
View liveness, owner and account generation guard each save phase, feedback and
completion; leaving and returning to the same account cannot revive an old save
result. The accepted input limit is now 10 MB, matching existing Storage and
image-read limits, instead of allowing a paid analysis of an unsavable 10-12 MB
image. No provider, schema, policy or saved row is changed.

Three focused files / 41 tests passed, including identical path/Blob retry,
unsafe extensions, insert reconciliation and the exact size boundary. Full
Quality/Database Safety passed for `4a26414` (push and PR), including all 139 unit
test files. This does not attest an installed owner flow.

The fresh source browser run passed all fourteen cases. It mocked one analysis,
a lost upload reply, a manual retry and one wine/photo insert. The exact uploaded
PNG bytes, MIME, cache control, upsert and private path were checked on both
attempts; no wine insert occurred before the explicit retry. The final UI and
overview screenshots were inspected. Across the complete runner, three AI
requests and four writes are simulated; forbidden external requests/writes,
page errors and fixture errors are zero, and process cleanup passed. These are
not installed storage/RLS or live AI results. Route assertion failures are
explicitly counted; fixture-arrival waits have a deadline and cleanup runs on
failed acceptance too. No real owner session, image, account or provider key
enters the fixture.

## Wider Source Kitchen Regression

The same isolated runner now accepts an explicit `--kitchen` mode and a separate
`dist/core-kitchen-runtime` artifact. Build it through the existing artifact-only
target with the exact owned browser origin, known fake publishable key and the
existing public cooking/Chef/meals/privacy/pilot flags. This does not enable
anything in the installed app or change server/database gates.
The synthetic privacy prerequisite flags do not attest real operator/legal
approval. A reproducible source-only build from the repository root is:

```powershell
docker build --target artifact `
  --build-arg VITE_SUPABASE_URL=http://127.0.0.1:54323 `
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_runtime_check_not_a_real_key `
  --build-arg VITE_OWNED_BACKEND_ENABLED=true `
  --build-arg VITE_PRIVACY_CONTROLS_ENABLED=true `
  --build-arg VITE_PRIVACY_OPERATIONS_VERIFIED=true `
  --build-arg VITE_LOCAL_AI_ENABLED=true `
  --build-arg VITE_COOKING_CORE_ENABLED=true `
  --build-arg VITE_AI_CHEF_ENABLED=true `
  --build-arg VITE_MEALS_ENABLED=true `
  --build-arg VITE_PILOT_UI_ENABLED=true `
  --output type=local,dest=dist/core-kitchen-runtime .
node scripts/check-core-experience-browser.mjs --kitchen
```

The normal feature-gate module retains its historical hosted-test comparison
constant; the guard allows that exact source literal only in this mode, never
traffic to it. Every browser backend request is intercepted; even requests to
the installed loopback origin must have the dummy key and a synthetic identity
and are answered in memory. Only isolated app-page/static GETs are forwarded.
Unknown hosts, API routes, tables and mutations are blocked. The child server
still has outbound fetch disabled and no provider/admin credentials. Eight unit
tests verify this boundary, including read-only RPCs, peer data and delayed errors.

Scenarios cover three widths (320/390/1440), loaded hero/recipe media, cookbook
and paused Cook Mode, memory read error/retry/focus, meal-history loading/error/
empty, family/child wine restrictions and account changes. No timer, recipe,
memory or other remote write or AI call is allowed in this navigation fixture.
Screenshots/status stay ignored under `dist/core-kitchen` and use synthetic data.

The initial startup timed out and is not acceptance. A subsequent wider run
verified the nonlayout scenarios but failed the resume row at 320/390 and an
active cooking tab at 320. The resume title now wraps with stable icons; tabs
use two columns below 361 px with 48 px controls rather than squeezing labels.
The fresh artifact passed all 29 checks. Forbidden requests/mutations, simulated
writes/AI calls and page/fixture errors were zero; all reads were mocked and
process cleanup passed. The 320px cookbook/Cook Mode and 390px home screenshots
were inspected. Full Quality and Database Safety passed for `c332bf0` (push/PR),
including 141 test files, 1,439 passing tests and one existing skipped test.

Source review also found Home reading an old cooking cache before useKitchen's
account-reset effect ran. Its direct owner check now hides that recipe on the
first new-account/signed-out render. Three render regressions reproduced both
failures before the fix and now pass; the combined fixture/Home suite passed
two files / eleven tests. These are source checks, not installed-owner evidence.

## Scan Cleanup Compatibility

Before installed acceptance, review caught a conflict between the proposed
nested initial-label path and the existing fixture's deliberately flat image
inventory. New scan saves now retain `owner/wine-UUID.extension`, the established
flat format, while keeping stable IDs, identical retry bytes and reconciliation.
No stored path is moved. Existing nested gallery files/access rules are unchanged;
fixture cleanup is not expanded to arbitrary folders. Three cross-contract tests
use the actual fixture path validator for JPEG/PNG/WebP. The combined focused
suite passed four files / 47 tests. Full CI passed for `78302b4` (push/PR).

The same review found raw HEIC/HEIF accepted by scan while the private image
reader cannot display those native original types. Scan now rejects them before
AI/storage, with a JPEG/PNG/WebP error, instead of charging for an unsavable or
unviewable original. No native decoder, migration or conversion of saved images
is introduced. The existing cropper's JPEG/PNG output remains accepted. Five
focused files / 69 tests passed. Two browser MIME-rejection cases use synthetic
PNG bytes in unsupported-type File objects; they are not HEIC decoding evidence.
A fresh artifact passed all 16 wine-browser cases, with zero forbidden requests/
writes or page/fixture errors and confirmed cleanup. The same three AI calls and
four writes are mocked; unsupported original types add neither AI nor uploads.
Full Quality/Database Safety passed for `1323d6b` (push/PR).

An earlier wine-navigation run failed and was not accepted. The final run used
a clean extraction of the synthetic artifact rather than mixed generated files.
The old generated directory was retained after checking both move paths stayed
inside the repository's dist directory and rejecting reparse points. TAR export
can avoid slow Docker per-file copying on this PC; `dist/core-wine-runtime.tar`
contains only compiled synthetic source, not owner data or an operational backup.
No owned runtime directory or saved image was moved. Safe failure diagnostics
record only phase, HTTP status/error classes and synthetic screenshots, never
browser sessions or raw server/provider errors.

## Bounded AI Session Checks

Source review found the local AI transport awaiting `getSession()` outside its
error boundary and without a deadline. A stalled SDK lookup could leave loading
open indefinitely, while an SDK rejection escaped the structured error contract.
Scoped AI requests also waited for session/user verification even when their
view had already been cancelled. The existing provider fetch deadline did not
cover those earlier waits.

The existing bounded auth helper now accepts a caller signal and invokes the
SDK lazily, checking cancellation before the request starts. Both verification
stages can stop waiting on view cancellation; cached local-session reads have
a 15-second deadline inside the transport's safe error boundary. Timers and
abort listeners are removed on success, error, timeout and cancellation. The
underlying SDK operation may finish later; its result cannot revive the cancelled
flow or construct a write client. This is not a claim of server-side cancellation.

The cached read is not authorization: verified account writes still require the
ordinary owner JWT and server `getUser` verification. Owner/current-view checks,
the hosted no-options invocation contract, explicit retries, provider defaults,
quotas and the existing 75-second AI fetch deadline are preserved. There are no
provider calls, credential changes, extra privileges or running-app changes.

The initial red run reproduced three failures. The final auth/transport suite
passed two files / 25 tests; the broader account, scan, photo and recommendation
suite passed eight files / 101 tests. Local typecheck and targeted lint passed.
Tests cover cancellation in both verification stages and local cached lookup,
late results, cleanup, the 15-second boundary, synchronous/asynchronous SDK
errors without raw diagnostic exposure and retained account/hosted contracts.
All sessions and HTTP results are synthetic. Full Quality and Database Safety
passed for `3afdbe5` (push/PR), including 141 files / 1,456 passing tests and one
existing skip. The earlier browser evidence is not presented as a rerun or live AI.

## Chat Conversation Isolation

Ask WineSnap now mounts its local chat state per authenticated owner. Account
changes and logout remove the previous messages, draft, errors, active ID and
pending controls instead of waiting for an asynchronous account-reset effect.
The existing sign-in/loading views remain; no anonymous or administrator path
is introduced.

Each transcript read or send captures a view controller; New, a conversation
switch or unmount invalidates it. Success, error and finally handlers all check
that same live view, so an old answer cannot append, restore an old draft or
release a newer send's busy state. A synchronous ref also prevents double submit.
History-list reads have an independent latest-request controller and cannot
replace a newer account/list result. History refresh failure does not remove a
successfully displayed answer. Transcript reads distinguish loading and error;
sending stays blocked after a failed load until explicit read retry or New.

Reads and deletes capture the normal owner JWT through the existing verified
account client, with cancellation and bounded requests. Conversation/message
reads and deletes retain explicit owner filters. Delete completion can remove
only its captured owner's row and does not reset a different current conversation
or a new account. Messages remain server-authored; no schema, RLS, provider,
quota, privilege or automatic AI retry change is made. Client cancellation stops
waiting and hides late results, not necessarily server processing/persistence.

The new isolated `--chat` fixture uses only the known dummy public key and
invalid-signature synthetic sessions. It intercepts every backend/AI request,
including requests addressed to the installed loopback API; no such request is
forwarded. Only isolated app/static GETs continue. Unknown APIs/writes/hosts and
nonfixture identities are rejected. Nine fixture-boundary tests are included.
The artifact is separate (`dist/core-chat-runtime`); screenshots/reports remain
ignored under `dist/core-chat`. Build through the artifact target with the same
owned/cooking/privacy/local-AI/pilot public flags as the kitchen example above
(Chef/meals are not needed here), export to a new TAR and extract into a clean
chat target. Never use this dummy configuration to update the real installation.

```powershell
node scripts/check-core-experience-browser.mjs --chat
```

Initial browser checks reproduced late transcript replacement after conversation
switch/New. The broader first run also had fixture errors, and two preliminary
builds rejected incomplete synthetic feature combinations; none is accepted
as passing evidence. After the source fix, nine of ten cases passed. The remaining
one-shot 503 database-read error was retried by the existing SDK, so the fixture
now supplies a deterministic 400 read failure; application retries were not
changed. The final expanded run passed all 20 checks: conversation switches,
New, concurrent old/new answers, stale errors, account switches, late history,
logout, transcript/history retry, mismatched answer IDs, unmount, captured-owner
deletes, deletion of an active pending conversation, explicit AI retry and
double submit, plus 320/390/1440px layouts at 125% text size. The 320px and 1440px
screenshots were inspected. Forbidden requests/writes, page/fixture errors were
zero; process cleanup passed. Thirteen AI requests and two deletes were mocked,
not sent to providers or real storage/databases. Seven focused files / 54 tests,
local typecheck and targeted lint passed. Full Quality and Database Safety
passed for `2afabab` (push/PR), including 142 files / 1,465 passing tests and
one existing skipped test.

At the source checkpoint the owner viewer still reported `legacy_viewer` with
internet paused; no installed change had yet occurred. The following checkpoint
supersedes that installation status, not the source-test evidence above.

## Installed Acceptance: November 13

The owned Update from clean `1f5bd5f` installed the accumulated DEV-03 changes,
including chat source `2afabab`. Dark-v1/public-origin labels were retained;
all 37 existing migrations matched and none ran anew. The web remains loopback
bound and the internet connector/recovery remain off. A current encrypted backup
and isolated same-PC restore of 75 tables/one image passed first; the prior web
image is retained under `winesnap-owned:rollback-20261113-dev03`.

Installed PilotAccept passed 61 checks across 360/390/430/1024/1440px: home,
cellar, cooking/version-pinned wine returns, unavailable-target choices,
Chef/memory/pairing/nutrition views, read errors/retry, uncertain save handling,
memory correction/forgetting, logout and peer isolation. A new manual chat probe
uses the existing guarded wrapper/tagged fixture: normal Auth/RLS history reads,
New while an old mocked answer is pending, retained current draft, and a current
mocked answer. Its 390px screenshot was inspected. The two chat responses and six
core fault responses were mocked; no provider scenario ran. Forbidden external/
AI requests, page/fixture errors were zero. Both exact test accounts/data were
cleaned. This does not claim the full twenty source races were repeated against
real backend records, nor that live AI quality or human use passed.

The new helper's local suite passed three files / 23 tests. Full Quality and
Database Safety passed for `1f5bd5f` (push/PR): 143 files / 1,467 tests and one
existing skip. Actual-owner headless Check passed before/after Update, logging
out only each probe. Visible Open, same-window duplicate focus and a later fresh,
server-verified owner heartbeat passed. DEV-02 is complete; the owner can now see
the changes in the separate real local viewer without a password request. The
shortcut/current supervisor were verified. No old production/test project,
password, account role, DNS or tunnel setting was changed.

## Collector Source Follow-Up

After the installed checkpoint, review found collector queries loading only the
first server page and save callbacks surviving owner changes. New acquisitions
used a server-generated ID, so retrying a lost insert reply could duplicate a
purchase. Edits lacked a revision guard, and same-tick submits could write twice.

`collectorStore` reuses the existing verified normal-JWT scoped client and
readAllPages helper. Both inventories load fully in stable order; totals are
published only after complete successful reads and row/owner checks. Keyed owner
state resets forms/data immediately. Writes have abort/current guards and a
synchronous lock. A validated immutable payload and stable acquisition UUID
survive an explicit retry; a prior uncertain write is read and compared before
any repetition. A failed read leaves the result unknown, not an assumed failure.
Unknown drafts stay read-only until reconciled; an explicit leave/reload path
remains. Edits filter on captured owner, ID and original updated_at, so another
revision is not overwritten. Conflict reload explicitly discards the draft.
Native wine/purpose selectors also have explicit accessible names.

No migration, new API, service-role client, policy change, FX conversion, market
price invention or live quote request is involved. Existing server stock checks,
manual estimate source/date/currency/confidence, zero values and unknowns remain.
Backend constraints still decide whether stock allocation can commit; client
cancellation does not promise cancellation of an already-started server write.

The isolated `--collector` runner uses a separate `dist/core-collector-runtime`
artifact, the same dummy-key/owned public flags as the chat build and an in-memory
backend. Every API request, including those addressed to the installed loopback
origin, is intercepted; no real JWT or data is used. Seven boundary tests reject
unknown hosts/APIs, nonfixture credentials and cross-owner writes. Screenshots
and safe reports stay ignored under `dist/core-collector`.

```powershell
node scripts/check-core-experience-browser.mjs --collector
```

Initial attempts hit an exact-label locator problem on the legacy native select;
those timeouts are not application evidence. After fixing the fixture locator,
the red run passed read-error recovery and reproduced five pagination/save
failures, with zero fixture errors. The final fixed artifact passed all 10
checks: complete 1,001-row inventories, loading/error/retry, lost insert reply
reconciliation, account-switch isolation, revision conflict/reload, double submit,
manual zero-estimate provenance and loaded 320/390/1440px layouts at 125% text.
Four write requests were mocked, AI requests were zero, forbidden requests/writes
and page/fixture errors were zero, and process cleanup passed. The 320/1440px
screenshots and additional 320px unknown-save/manual-provenance views were
inspected. Eight focused files / 64 tests, local typecheck and targeted lint
passed. Full CI is pending. Small lint/format failures during development were
corrected, not counted as passes.

This is source-only: the real viewer remains open on installed `1f5bd5f`. No
owner data, installed backend/frontend, old production, hosted test, password,
provider configuration or internet setting changed.

## Remaining DEV-03 Work

These are substeps of the canonical roadmap, not a competing development plan:

- The first source slice is verified; retain its checks during subsequent work.
- Gallery, overview, meal-history and scan source slices passed full CI; retain
  all sixteen wine-browser scenarios in broader core regression. Mocked auth/AI is not live-provider,
  real-JWT/RLS or installed-owner acceptance.
- Wider kitchen source checks and CI passed; retain all 29 cases alongside the
  16 wine cases. Failed startup/layout/navigation runs remain failures, not partial
  acceptance. Installed journeys and broader actual-owner use remain separate.
- The bounded AI session follow-up passes 101 focused tests, typecheck, lint and
  full CI. Keep its mocked transport evidence separate from live AI
  and from the narrower installed fixture/actual-owner checks above.
- Chat/account isolation passes all 20 isolated browser checks and 54 focused
  tests, typecheck, lint and full CI. Retain this fixture with the
  prior wine/kitchen source checks, separately from live and installed evidence.
- Collector safety now passes 10 isolated browser checks and 64 focused tests;
  full CI and a later safe owned update/installed collector acceptance remain.
- Next source review: overview price-refresh session/deadline/account guards and
  read-error recovery, then remaining family/meal states. Keep verified retail
  prices separate from user estimates and preserve unknown values/currencies.
- Review the remaining core screens, scan review/save, cookbook/Cook Mode,
  household/meal panels, memory, price provenance and keyboard/error states.
- The accumulated source changes are installed and the narrower 61-case owned
  regression passed. Broader remaining review and actual owner observations are
  still required; do not mark DEV-03 complete from installation/auth alone.
- For future updates, wait for safe owner closure, use headless Check, current
  backup/rehearsal, owned Update/fixture journeys, then visible Open/focus/heartbeat
  last. Do not interrupt the now-open real owner viewer for another rebuild.
