# Core States And Explicit Recovery

Stage 4 of the guided pilot plan, completed on 2026-11-06. Scope is the repository and the separately
owned Windows app only. The old production, hosted test, provider defaults and
private internet gate are unchanged.

## Implemented

- Shared accessible loading, offline, pending and error notices with explicit
  recovery actions. Read errors are not presented as empty collections.
- Scan analysis keeps a failed image for manual retry; reconnecting does not
  repeat a paid request. The camera layout is unchanged.
- Wine saving retains one owner-bound ID and successful upload. A missing save
  response triggers a read reconciliation, not another insertion. An uncertain
  outcome locks editing/discard until an explicit save check resolves it. No
  possibly referenced image is deleted after a transport error.
- Scan review and selected input are held in memory, not promised as durable
  offline drafts. Closing/reloading the page can discard unsaved review data.
- Chef keeps failed prompts and requires review or discard of a generated draft
  before another generation. History retrieval has a separate error state and
  cannot erase a successful response or repeat the AI request.
- Recipe editors retain drafts on save failure and reuse their version ID on
  explicit retry. Cook Mode distinguishes local state, pending synchronization,
  verified synchronization and errors, preserving existing conflict choices.
- Food Memory hides unavailable/stale records while offline or after a failed
  read. Mutation controls return only after a successful fresh read; reconnecting
  never repeats a mutation or AI extraction.
- Kitchen, Chef-memory and meal writes use a captured, verified account token
  and the approved owned-origin API mapping, not mutable global auth state.

## Verification

Focused tests cover save reconciliation, account-bound clients and writes,
structured provider failures, and accessible scan/notice rendering. The first
local Vitest run passed seven files (35 assertions) but one worker failed to
start. Full CI subsequently passed at frontend source `fb8829e`: typecheck,
lint, all tests, dependency security, database safety, synthetic build/runtime,
client budget and the separate prototype build. That supersedes the incomplete
local run, not actual browser acceptance.

The disposable pilot browser suite now includes synthetic failures for memory
reads, Chef quota/history, recipe save, image analysis and lost wine-save replies.
It uses actual fixture-owned database writes but mocked AI replies, never paid
provider calls. Its screenshots and reports contain synthetic fixture data only.

## Owned Installation Receipt

- The fresh encrypted archive `owned-20261106-131754767.dpapi` passed isolated
  restoration at 13:30 UTC: 75 tables, Auth hashes/identities, grants/policies/
  functions, rows/share IDs, one stored image and real-JWT owner isolation.
  Temporary resources were removed; the running installation was not stopped.
- The prior running app image was retained as
  `winesnap-owned:core-states-rollback-20261106`. No rollback was performed.
- Owned Update completed at 13:43 UTC with dark-v1, the existing approved HTTPS
  origin and device-access binding preserved. Database, Auth, Storage and app
  checks passed. All 37 migrations were retained; zero new migrations ran.
- The first browser run found a real recipe-return regression: the kitchen
  listened only to native hashchange, not internal router navigation. It passed
  its first three layout checks, then timed out on the return view. There were
  no external/provider requests or page errors, and exact fixture cleanup passed.
  The follow-up observes router location changes while keeping the timer/clock
  interval independent of navigation. It requires renewed acceptance.
- Corrected candidate `2d98270` passed all Quality and Database Safety workflows
  and was installed at 14:13 UTC. The service-worker revision is now
  `2026-11-06-core-states-2`; existing cookie/cache isolation is unchanged.
  Dark UI, public origin and device binding remain intact; zero new migrations.
- Independent Offline acceptance completed at 14:40 UTC with all ten checks:
  actual browser network loss, offline edits/reload, private-cellar cache denial,
  one reconnect revision, silent reconnect retry, both explicit conflict choices,
  desktop recovery and logout erasure. External requests, AI requests and page
  errors were zero. Exact fixture cleanup passed. The probe also verified the
  network was blocked after reload rather than relying on navigator.onLine alone.
- Final PilotAccept completed at 15:03 UTC with all 56 checks, including the
  original responsive/journey regression at 360/390/430/1024/1440 px and all six
  core-state recovery scenarios. No external/provider requests or page errors
  occurred. Exact fixture cleanup passed; no real account was used or changed.
- The six synthetic AI replies exercised quota/manual retry, independent history
  failure, recipe review/save recovery, identical-image reanalysis and text scan.
  Manual Chef retry reused its request ID; recipe save reused its version ID.
  Reconnecting repeated neither a paid request nor a memory mutation.
- A real fixture-owned wine INSERT committed before its reply was deliberately
  lost; the first read reconciliation was also interrupted. The review stayed
  locked, then manual checking found the existing row. Exactly one wine INSERT
  and one memory mutation occurred. The image analysis was mocked and its review
  discarded: this is not a new live-provider or image-upload/save acceptance.
- Error screenshots were checked at 360/1440 px; the uncertain-save view was
  checked at 390 px. Text and controls fit. Capture requires loaded target content
  and painted wine-return pixels, not unrelated global spinners/network idleness.
  The fixed scan overlay is checked by its visible main surface, not HTML height.
- Test-only capture/history races found during earlier runs were corrected,
  without removing semantic checks or claiming those failed runs had passed.
  Screenshots remain ignored under dist; no login state, HAR or trace is exported.

Stage 5 remains pending: the broader five end-to-end journeys, including actual
original-label image save and memory correction/forgetting/account-switch checks.
Stage 6 guided human pilots also remains separate.

Passing these checks does not approve public release, physical-device camera/
timers or deferred off-device recovery. Normal app updates still use the owned
wrapper; neither the old production nor hosted test is a deployment target.
