# Owned Pilot Regression And UI Demo

Stage 5 regression is complete for the guided local pilot. The installed frontend remains the verified dark
candidate `2d98270`; this work adds owned-only acceptance and demo operators,
not production changes, a new AI model, public onboarding or a new data format.

## Scope

- PilotJourneys explicitly allows one original-label UI analysis and one Chef
  generation through the installed app. Its ordinary request guard blocks every
  other provider/external request. Scenario counts are not upstream billing counts.
- The image journey includes review, explicit save and a private-proxy read whose
  bytes must match the previously approved original. Chef includes explicit review,
  save and reload. No automatic paid retry or fallback is introduced.
- PilotAccept also exercises memory correction/forgetting, logout cache erasure,
  a second ordinary synthetic account and denial of the first account's recipe.
  Both administrator-tagged fixture manifests are retained for scoped cleanup.
- Image cleanup verifies the exact synthetic owner before querying referenced
  paths. Foreign, nested and unbounded paths are refused before deletion.
- PilotDemo opens the actual owned app in a separate visible, ephemeral browser
  with a normal synthetic login and clearly marked example records. Local Chef
  examples are marked as demo, not AI output. Provider/external calls and image
  uploads are blocked. It closes after 15 minutes or when the user closes it,
  then deletes only the exact tagged demo account. PilotDemoCleanup is the manual
  recovery action after an interrupted viewer. No browser login state is exported.

## Verified Evidence

- The initial attempt could not reach the Linux engine. Docker Desktop's first
  startup was cancelled; a normal launch of the existing installation recovered
  the engine. No engine reset, volume deletion or reinstall was performed.
- The existing owned stack and limited supervisor recovered, with all expected
  services healthy. The old production and abandoned hosted test were untouched.
- Features completed: 11 backend checks, zero failures or AI scenarios, exact
  fixture cleanup. App, Auth and Storage verification passed.
- The current archive `owned-20261107-170951456.dpapi` passed an isolated restore
  at 22:18 UTC: 75 tables, Auth hashes/identities, grants, policies/functions,
  rows/share IDs and one image matched. JWT isolation and temporary cleanup passed.
  This remains same-PC recovery only; deferred off-device work was not resumed.
- All 1,311 unit tests passed with normal file isolation; typecheck and lint
  passed (four existing hook-ref warnings, zero lint errors). The synthetic
  production build, Node SSR/runtime smoke and client budget passed. Quality
  and Database Safety passed on both push and PR for `ca25455`.
- One live original-label analysis verified Zehn Morgen, vintage 2023 and both
  Chardonnay/Weisser Burgunder grapes. Its first UI attempt saved and rendered
  the correct bottle but failed the test's CDP-body comparison: the observer
  returned zero bytes. This failed run was not recorded as a complete pass.
- The follow-up explicitly replayed the already-approved identity response,
  without another paid image analysis. The actual file was uploaded, saved and
  read through the private image proxy. The Blob rendered by the app matched
  all 39,438 original WebP bytes and SHA-256, not just the label or appearance.
- In that follow-up, one real Chef generation passed explicit draft review,
  private-version save and reload. The live subjourneys completed, with exactly
  one actual provider scenario (Chef) and one marked label replay. Provider
  scenarios are not a count of upstream billing requests.
- That combined run later stopped on a test-only assumption that a new memory
  entry would reset its direction. A subsequent attempt navigated away before
  sign-out completed. Tests now select the intended direction explicitly and
  wait for the actual signed-out profile before navigation; no app workaround
  or Auth/cache weakening was needed. No successful paid scenario was repeated.
- Final non-provider PilotAccept completed at 22:44 UTC: all 58 checks at
  360/390/430/1024/1440 px, keyboard/return navigation, six synthetic AI/error
  probes, memory correction/forgetting and two ordinary synthetic accounts.
  The second account could not read the first account's pinned recipe or
  memory; each logout erased its IndexedDB account record. External requests,
  unexpected AI requests and page errors were zero. Both fixtures were removed.
- Accept completed at 22:45 UTC: 24 checks including real browser login, local
  confirmation/recovery email, private/shared image access, revoked access,
  old share IDs, persistence after service restart and export/erasure. Exact
  fixture cleanup passed; no owner account/password was changed.
- Independent Offline completed at 22:45 UTC: all ten checks, including actual
  browser network loss, offline edits/reload, timer/session restoration,
  exactly-once reconnect, both conflict choices and logout erasure. No external
  or AI calls or page errors; exact fixture cleanup passed.
- Gate archive `gate-20261107-171018519.dpapi` passed its isolated restore at
  22:46 UTC: SQLite integrity, 26 tables, one file, credential recovery and
  exact temporary cleanup. No published ports, connector or DNS changes.
- Read-only operations check passed at 22:46 UTC: healthy supervisor, current
  maintenance, matching current app/gate backup rehearsals, no issues. A busy
  manual acceptance temporarily leaves supervisor health unverified; it must
  not be mistaken for a clean idle health receipt.

## Candidate And Demo

No frontend or schema change was needed during this stage. The actual installed
candidate stays `2d98270`, dark-v1, with its existing public-origin/device binding
and service-worker revision `2026-11-06-core-states-2`. No Update or migration was
run. The retained rollback image remains
`winesnap-owned:core-states-rollback-20261106`; no rollback was performed.

`run-owned-windows.ps1 -Action PilotDemo` is a manual visible viewer of that same
installed app, not another prototype or deployment. It uses an independent,
administrator-tagged example account, clearly marked sample wine/recipe and
local-only example Chef responses. The 15-minute viewer blocks paid/external
calls and image uploads, takes desktop/mobile screenshots under ignored
`dist/owned-demo`, and cleans its exact account when closed or expired. Its
credential-free ready marker records whether the viewer is currently open.
The operation lock deliberately keeps restart/maintenance actions out of the
interactive demonstration. Close the demo before another operator action.

The five core journeys are covered by the separate receipts above, not a claim
that the initial failing combined run passed. Stage 6 is the guided human pilot
and feedback iteration, not more unattended acceptance. This does
not attest physical mobile/background timers, external email, cold boot,
off-device recovery, supplier approval or public release.
