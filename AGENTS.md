# WineSnap Repository Guidance

- Read `docs/development-plan.md` before starting or continuing development.
  It is the canonical approved roadmap; dated plans are historical evidence.
  Follow the first unblocked task, preserve its stable DEV-ID and update its
  board, verification evidence and exact handoff after each meaningful step.
  Log material plan changes and reasons; never mark human use, installation or
  provider checks complete from source/tests alone. Do not depend on chat memory.

- Continue development in Codex using this Git repository. Do not send tasks,
  source code or credentials to Lovable, or reintroduce its build wrapper,
  preview-auth broker or AI gateway.
- The default Vite configuration uses the standalone Node runtime. Public build
  configuration lives under `config/independent`; no implicit production `.env`.
  `npm run build:check` is a synthetic offline smoke artifact, not a deployable app.
- Reuse the existing React/TanStack routes, mobile layout and Supabase contracts.
  The Chef prototype is separate from WineSnap, not a replacement frontend.
- Keep provider credentials only in server/Edge secret managers. Direct AI uses
  `OPENAI_API_KEY` and `GEMINI_API_KEY`; never expose them as `VITE_*` settings.
- Production data and the existing published site must remain intact until an
  owned destination, complete export, isolated restore and rollback are verified.
  Do not promote the empty test project or blindly replay migration histories.
- The current Windows installation uses its own initially empty local backend,
  `winesnap-owned-local`, through `scripts/run-owned-windows.ps1`.
  The owner abandoned hosted WineSnap-test (`pzniyupmgwvlldvztzqh`); its old
  wrappers are historical/manual tools, not the default runtime. Never print
  keys or ask for them in chat, or silently resume a hosted test connection.
- Run typecheck, lint, Vitest, synthetic Node build/runtime and client budget.
  Security-sensitive changes need focused regression tests; UI changes need
  desktop/mobile browser verification. Do not equate mocked AI with live AI.
- Follow the user's standing preference to commit and push completed work.
  Do not automatically merge or deploy while production gates remain unresolved.

Current handoff: DEV-06's approved fresh backup
`owned-20261123-095116903.dpapi` was restored in isolation on November 23.
75 tables, Auth hashes and identities, grants/policies/functions, share IDs
and one stored object matched; disposable cleanup passed. The existing app
returned HTTP 200 and the exact rollback image is still pinned under
`winesnap-owned:planning-rollback-159aea19e2ed`. This is not cross-device
recovery or authorization to install. Next: await separate approval for the
owned Update; recheck candidate CI, held backup, rollback and pending migration
before executing the runbook's `Update -RequirePlanningMigration`. This guard
checks the exact scope and rollback again under the operation lock. DEV-06
remains uninstalled, old production untouched,
public tunnel paused and owner bottle test deferred.

Previous handoff: DEV-06's isolated exact-image web rollback passed. The
candidate saved a plan in the real disposable backend; replacing just that
web container with the current installed image left both fixture plans,
recipes, ledger and schema unchanged. The old image signed in and started
Cook Mode. Browser backstop and cleanup passed; no live application, data,
backup or tunnel changed. Next: obtain the approved maintenance window and
verify a fresh encrypted backup by restoring that exact archive in isolation.
The actual update requires approval and a fresh preflight. DEV-05's owner
bottle test stays deferred. See the canonical plan and local update runbook.

Previous handoff: DEV-06 has a read-only owned Windows update preflight and
`docs/owned-planning-local-update.md`. The installed ledger matched all 37
previous migrations and had only the additive week-plan migration pending.
The app answered on loopback and the previous running web image exists.
No tag, backup, rollback activation or installed change was made. An exact
pre-update backup and matched isolated restore, retained rollback image and
rehearsed web-only replacement, and local delivery gates still apply. Do not
return the owner to the old export code after real plans exist. DEV-05's
bottle test stays deferred. See the canonical plan before continuation.

Previous handoff: DEV-06's `--planning-db` probe verified 38 migrations, real
GoTrue/PostgREST browser save and reload, pinned-version Cook Mode, revision
conflicts, account isolation, private export, missing versions, and the
pending-erasure/owner-only cascade. A separate networkless PostgreSQL cluster
restored the whole disposable database and roles with matching relations and
catalog. All 60 focused Vitest tests and 11 mocked Chromium checks passed.
No installed app or real data was changed, and DEV-05's owner bottle test is
still deferred. Next: prepare additive local migration and rollback delivery
without applying it before the local gates are met. See the canonical plan.

Previous handoff: DEV-06 adds Veckoplan under Mer i koket in source. The UI
plans exact recipe versions and servings, derives editable purchases, and
keeps a draft in memory until explicit save. Revision conflict and uncertain
save recovery require a read and never automatically replay a write.
Synthetic Chromium covered the planner and list at 320, 390 and 1440 px
with 125% text, explicit recovery/reconnect and exact-version Cook Mode.
No installed app, real account, old production or hosted test change.
Next: isolated migrated PostgREST/browser and backup/restore acceptance for
the new table, then local delivery only after the applicable release gates.
The DEV-05 owner bottle test stays deferred. See the canonical plan.

Previous handoff: DEV-06 adds private week-plan persistence in source. Additive
migration 20261118200000_kitchen_week_plans.sql, owner RLS, revisioned and
idempotent save RPC, pinned-version client reads, export and erasure coverage
are in place. The owned database backup already captures all relations; a
new-schema restore is not verified on the owner's actual installation. All 33
focused API/domain/privacy tests passed. Corrected 2869e67 has green Quality
and Database Safety push/PR CI (2,005 tests, one existing skip; 38 synthetic
migrations and owner/revision/erasure checks). No database update, install, old
production or hosted test change. Next: Kitchen planner/list UI, conflict
recovery and exact-version Cook Mode, then offline/browser acceptance. Bottle
test remains deferred. See the current DEV-06 plan handoff.

Previous handoff: the owner asked to skip the pending bottle test and continue.
DEV-05 stays open, no actual usage pass or release is claimed. DEV-06 source
work started with the pure week-plan and deterministic shopping model in
src/features/planning/domain.ts. It reuses exact owned recipe versions, kitchen
serving/unit logic, unknown quantities and basis-scoped list edits. No planner
database, UI, local install or public change. Next is owner-scoped revisioned
persistence and associated export/deletion/backup scope, then Kitchen UI and
exact-version Cook Mode. See the current DEV-06 plan handoff before continuing.
All 25 focused tests passed; Quality/Database Safety were green on push/PR
at e869e8f (1,992 tests passed, one existing skip).

Previous handoff, November 18 afternoon: DEV-05 is Pagar, app remains f9bb532.
Passive request/response and guard counters narrowed two focused timeouts to
the peer kitchen startup before memory reads. The final focused run passed all
19 checks at 15:22:37 UTC under the same timeout and guards. Peer memory,
family and meal panels rendered in the original mounted documents before
held replies were released. No prior content or notices appeared afterwards;
fixture table/cache isolation and exact cleanup passed. This is not a full
browser sweep or proof that the intermittent cause was fixed. All 154
focused script tests and scoped lint passed; app code/install unchanged. Real
owner scan/review/save/reopen is the next acceptance pass. Do not repeat
the broad suite to chase the earlier timeout. Production, hosted test, paused
tunnel and the real owner account were untouched. Keep the audit enabled.
The running owned artifact inventory found no separate picomatch package or
recognizable references; it had no source maps, so this is not an absence
guarantee. Quality runs both unchanged, required audits after code/build checks
when the relevant installs succeeded. An audit failure still fails Quality.
Quality and Database Safety were green on push/PR at 2a2e7f2 (1,984 tests
passed, one existing skip). npm did not report the advisory in that run;
the unchanged lock and still-open upstream advisory are not remediation.
The loopback backend was healthy; the owner viewer was closed and left closed.

Previous handoff, November 18 morning: DEV-05 is Pagar, installed app remains f9bb532.
Five installed PilotDemoAccept checks (mocked AI, real fixture saves and a
byte-identical reopened private image) and ten installed Offline checks passed.
Full PilotAccept had 91 passing checks but timed out in the account-switch
sequence. The new non-live AccountIsolationOnly scope passed 15 checks before
the original memory tab stayed loading during the peer read with an old reply
held. No leakage was visible, but the late-reply proof did not complete. Both
failed runs cleaned up their exact fixture accounts. Diagnose the observed
peer read on the original document; do not relax/reload away the proof or
rerun the broad suite merely to locate it. No new live AI or app install.
Quality CI currently stops at the unchanged picomatch dependency advisory
GHSA-fc5q-39xc-vjpf; no patched version was listed. Keep the audit enabled.
Preserve the existing ready owner viewer. Owner scan/review/save/image is still
the first unobserved usage pass; no human acceptance claimed. See the canonical
handoff for evidence; old production, hosted test and paused tunnel untouched.

Previous handoff, November 17 (historical): DEV-04 technical scope is complete and DEV-05 is
Pagar. The owned local app was updated from clean f9bb532 at 21:39:49 UTC, after
fresh owner Check, encrypted backup owned-20261117-212540616.dpapi and successful
isolated same-PC restore/cleanup. Dark-v1/origin label retained, loopback only,
37 migrations matched/none new. Full CI green on push/PR for that source. Seven
installed anonymous AI route probes denied access with no-store and no metrics.
All 11 installed Features checks and exact two-account cleanup passed, zero new
paid requests. Fresh after-update owner Check/scoped logout passed at 21:50:32
UTC. A single launch from the validated WineSnap lokalt shortcut reached ready/
authenticated with an advancing heartbeat at 21:54:08 UTC, viewer run
d2984091-ec18-47a7-9036-627490d812a2, internet paused and zero blocked requests.
The read-only supervisor was fully healthy. Reuse the active viewer; do not
force-close or reinstall over it. Next: actual owner usage pass for scan/review/
save/image in the canonical plan. No human pass, fresh full browser sweep or
second-PC recovery is claimed. No old production, hosted test, tunnel, password,
provider or model change. Do not replay the eight successful live cases.

Previous handoff, November 16 (historical): DEV-03 technical acceptance remains complete;
DEV-04 is Pagar. Shared optional content-free AI observations and sommelier taste
context minimization are implemented. All eight bounded live cases passed from
source 606f712 at 17:06:59 UTC using real owned Auth/RLS and native existing
providers; exactly eight attempts, no fallback/retry. Exact tagged-fixture cleanup
and absence checks passed. Do not rerun successful paid cases. An earlier
zero-provider preflight failure was fixed and is documented, not a pass.
Full Quality/Database Safety on push/PR passed: 176 files, 1,980 tests, one existing
platform skip; two existing Chef lint warnings. These are source/live gates,
not installed browser, free-form semantic, medical or human-use certification.
The real viewer remained ready/authenticated/operator-active with a fresh
heartbeat at 17:02:39 UTC, same run 5f469d75-212d-4305-a737-93f24c6fc54f. Installed
app is still b7dc0b2. One safe-closure request is outstanding; do not force-close
or update over it. Final read-only supervisor check was fully healthy with a
fresh heartbeat at 17:10:13 UTC. After verified closure: fresh Check, encrypted backup/isolated
restore, Update, affected installed checks and validated shortcut Open/heartbeat.
Read the current canonical handoff and docs/ai-quality.md before doing so. No old
production, abandoned test, tunnel, passwords, models or credentials changed.

Previous handoff, November 15 (historical): DEV-03 technical acceptance is complete; DEV-04 is
Pagar. The read recovery is installed from clean b7dc0b2, with verified same-PC
backup/restore. All 91 isolated source browser cases and the focused installed
normal-Auth/RLS recovery passed. The focused run at 20:43:07 UTC observed one Auth
tag verification, five scoped reads, two argument-free read-only access checks
and one other-tab fixture edit; recovery kept the document/search without another
write. Exact fixture cleanup passed, with no AI/external/page/fixture errors.
Earlier failed/interrupted full/focused runs are retained, not passes; no new
full 95-case pass is claimed. Prior 94 installed checks remain separate evidence.
Fresh actual-owner Check/scoped logout passed at 20:47:28 UTC. The validated
existing local shortcut was launched once; run 5f469d75-212d-4305-a737-93f24c6fc54f
reached ready/authenticated/viewerRunning/operatorActive with a fresh heartbeat
at 20:50:53 UTC. Duplicate focus passed and the read-only supervisor was fully
healthy at 20:51:54 UTC, internet paused. Preserve/reuse this viewer; never
force-close/reinstall over it. Final helper commit 1444528 passed full Quality/
Database Safety on push/PR: 173 files, 1,943 passing tests, one existing platform
skip; typecheck/lint (two existing warnings), security, synthetic build/runtime
and client budget passed. Read the canonical latest handoff for later evidence.
DEV-04 has 33 fixed synthetic quality cases and a content-free deterministic CLI,
not live-provider/semantic or human-use proof. Next: bounded action observations
and the guarded live cohort in docs/ai-quality.md. Old production, hosted test,
provider credentials/models, passwords and paused tunnel remain unchanged.
Earlier pending/source-only/open-viewer statements below are historical.

Current access decision, 2026-11-12: the owner abandoned mobile/password setup
for now and requested local-only development. The owned tunnel is deliberately
stopped with supervisor recovery disabled. Do not restart it, reset passwords or
reopen passkey enrollment on generic continuation requests. Use the private
`open-owned-local.ps1` wrapper and `Start menu > Projektverktyg > WineSnap lokalt`
shortcut for the real existing owner account; never replace it with a synthetic demo. The wrapper
uses CurrentUser-protected operator access and normal loopback GoTrue Auth/RLS,
not a public or anonymous login bypass. Never run its private worker directly or
print grants/tokens/browser state. See `docs/local-development-access-2026-11-12.md`.

Latest installation, 2026-11-15: the viewer was already safely closed. Fresh
actual-owner Check/scoped logout, encrypted backup `owned-20261115-190049361.dpapi`
and isolated 75-table/one-image same-PC restore passed with cleanup. Update from
clean `2d6f0f7` completed at 19:02:49 UTC, retaining dark-v1/public-origin labels,
37 matched/zero new migrations, loopback ports and disabled tunnel/recovery.
All 94 installed fixture checks and exact two-account cleanup passed first run,
including the deeper memory saved/read-error, actual revision conflict, lost
forget/reset, late-view/account probes and normal peer RLS. Memory expected
budgets matched five client writes/six RPCs/five commits; account memory used one
held commit and two verified peer memory reads. Both family/meal panels and the
memory panel rendered after switching, with zero withheld cache-conflict views.
Eight AI replies/one price request were mocked, never live provider/catalog
scenarios. No helper fix, owner-content mutation or password/provider/production/
hosted-test change occurred. Fresh post-update owner Check/scoped logout passed.
First Open reached verification but was then closed, cause unknown. One launch
through the verified existing local Start-menu shortcut then reached ready/
authenticated/viewerRunning/operatorActive; duplicate focus passed. Supervisor
fully healthy at 19:09:17 UTC, internet paused. Keep this viewer open and reuse it.
Same-run server verification advanced to 19:10:12 UTC with a fresh authenticated
heartbeat, active viewer and zero blocked requests.
Canonical handoff has the exact evidence. Earlier pending/source-only statements
below are historical. Next source work remains explicit read-only recovery for a
genuine local edit conflict; DEV-03/human use/public release are not complete.

Earlier installation, 2026-11-15: explicit owner request and observed safe viewer
closure allowed Update from clean `724e1d6`, completed at 16:21:48 UTC. Fresh
actual-owner Check, encrypted backup `owned-20261115-161834495.dpapi` and isolated
75-table/one-image restore passed with clone cleanup. Dark-v1/public-origin
labels are retained, all ports loopback-only, 37 migrations matched/zero new.
Tunnel/recovery, passwords, providers, old production and hosted test unchanged.
All 86 extended installed fixture checks and exact two-account cleanup passed.
Eight AI replies/one price request were mocked. The late-account proof verified
both original documents' peer-JWT reads before releasing two committed replies;
one peer panel was withheld by a cache-revision guard, not fully rendered. Helper
`54c23d8` recognizes only that exact hidden-panel state without reloading away
the proof; the later independent memory read explicitly reloads. Five earlier
failed runs remain failures, all with successful fixture cleanup. Full local
Vitest passed 166 files/1,770 tests, typecheck/lint passed (two existing warnings),
and full Quality/Database Safety passed on push/PR. Fresh actual-owner Check with
scoped logout passed at 16:40:03 UTC, then visible Open/authentication and same-run
duplicate focus passed; supervisor fully healthy at 16:42:13 UTC. Keep the real
viewer open and reuse it. UI automation could list the WineSnap window but
binding failed on fresh/recovered selection, so Memory-tab navigation was not
performed or verified; the owner can select Kitchen > Memory. Canonical handoff
has current evidence; earlier installed/source-only statements below are
historical. Do not imply the multi-tab usability issue, deeper installed memory
faults, live AI or human usage are verified by these fixture checks.

The November 15 owned memory-fault follow-up is now prepared/unit-tested, not
executed against the installation. Exact tagged-fixture JWT/body/method/owner
guards bound save/reread, actual correction-conflict, lost forget/reset and
late-view/account probes. The normal existing peer UI sign-in is reused; one
extra still-mounted memory document must read with a server-verified peer JWT
before its single held commit is released. A withheld cache-conflict panel is
reported separately, never successful memory rendering. No reload or injected
browser session bypasses the proof. Guarded requests drain before route removal;
the extra document closes first. Six exact-owner memory/Chef cascades are checked
after tagged-account cleanup. Four focused files/131 tests and full local Vitest
(168 files/1,847 tests), typecheck and lint passed; two existing Chef warnings
remain. The first CI test-formatting failure is not accepted; `caf78e4` corrects
it and passed full Quality/Database Safety on push/PR, including synthetic build/
runtime, client budget and security. Focused tests/full CI cover the final teardown
order; the earlier full local run predates that small refinement. No installed
wrapper, real user/data/key, AI,
fixture, password, internet or production action occurred. Keep the owner viewer
open; next independent work reviews multi-tab cache conflicts with isolated
source tests. Canonical handoff separates preparation from installed evidence.

The concurrent-startup cache follow-up is now source-verified, not installed.
Two isolated same-owner tabs reproduced the old false conflict before the fix.
Verified startup refresh may reuse a complete validated newer same-owner cache
inside its IDB transaction without a write/merge; actual edits retain strict CAS.
Owner/generation, offline age and cache validation remain. A reused pending
attempt skips only initial automatic sync; normal startup/manual sync remain.
Five focused files/61 tests, full local Vitest (171 files/1,884 tests), typecheck
and lint passed (two existing Chef warnings). The new artifact passed all 89
isolated kitchen cases, retaining 85, with 517 simulated reads/eleven RPC writes
and one synthetic IDB seed edit. Real backend/AI, forbidden calls/writes and page/
fixture errors were zero; cleanup passed. Standard-text tab screenshots at
320/390/1440 and the prior 125% layout cases are distinct evidence. The old failed
report is retained. All 339 tar paths/types and local ancestors were checked,
with previous artifacts/reports preserved. Full Quality/Database Safety passed
for `b872891` on push/PR, including synthetic build/runtime, client budget and
security checks.
No owned wrapper, installed update, real user/key/account/provider, password or
internet/production change occurred. Keep the viewer open; next source work is
explicit read-only recovery for a genuine local edit conflict, not silent
cross-tab merging or write replay. Installed acceptance remains separate.

Earlier installed checkpoint, 2026-11-14 local time: the owner safely closed the viewer;
Status confirmed closure and normal lock release without a forced process stop.
Fresh pre-update actual-owner Check passed, including scoped logout. Encrypted
backup `owned-20261113-231907992.dpapi` and its isolated same-PC restore passed:
75 tables, one image, Auth hashes/identities, permissions/functions, rows/share
IDs and real-JWT isolation matched; the clone was cleaned. This is not off-device
recovery. Update from clean `05172af` retained dark-v1/public-origin labels,
matched 37 migrations and ran zero new ones. The tunnel/recovery remain disabled.
All 69 installed PilotAccept checks passed and both exact fixtures were removed;
eight AI replies and one price request were mocked, never sent to providers or
the catalog. Two injected read failures recovered without another price request.
The price probe now precedes scan-created fixture wines; its first order-dependent
failure is not accepted as a pass. Full Quality/Database Safety passed for
`58a76ef` (155 files, 1,545 tests, one existing skip). No app rebuild is needed
for this test-helper-only follow-up.

Post-update owner activation passed on November 14 morning: fresh headless Check
verified the real owner and scoped probe logout at 07:52:39 UTC. Visible Open
then showed the real owner/home. Duplicate Open focused the same run/window;
later Status verified ready/authenticated/viewerRunning/operatorActive and a
fresh advancing server heartbeat (07:57:12 to 07:57:36 UTC), internet paused and
zero blocked requests. Verification advanced again to 07:59:38 UTC; the read-only
supervisor check was fully healthy at 07:59:48 UTC. Keep this viewer open;
reuse/focus it, never force-close
or rebuild it for another update. This is normal owner Auth/RLS, not a public
login bypass or actual human usage acceptance. The earlier failed Checks and
resource pressure remain historical failures, not proof that HTTP 200 is login.
Read the canonical handoff for current supervisor evidence and the next task.
No Windows/Docker restart, unrelated-process stop, lock deletion, password reset
or tunnel activation is approved.
The DEV-03 family/meal mutation slice is now source-verified, not installed over
the open owner viewer. The shared read
lifecycle is installed and source-verified with 16 focused tests and 29 isolated
kitchen cases; these are distinct from the narrower installed fixture coverage.
The read-only `inspect-owned-operation-lock.ps1` classifies only the owned lock;
never terminate a holder merely because it is busy. The close-after-flush stdin
helper passed a full 1 MB synthetic Docker digest probe, backup and restore.
The completed-headless-Check fallback may close only its own private kill-on-close
job after current-run owner verification and scoped logout are proved. It retains
the original 30-second grace and verifies process/output completion. Never apply
this fallback to the visible Open viewer or accept an incomplete/foreign report.
The November 14 morning follow-up batches only the fixed seven-service Resume/
Verify inspection, retaining all existing container checks before any starts.
Starts use validated immutable IDs in dependency order. Three focused files /
49 tests passed; the first run's existing migration-read timeout was not waived.
Full Quality/Database Safety passed for `eb6fc7a` (push/PR), 156 files / 1,574 tests
and one existing skip; the first CI test-formatting failure was corrected.
The supervisor has verified the new batch and reported fully healthy after Open;
its earlier busy report was not a proved proxy outage. The helper needs no
frontend rebuild. See the canonical handoff rather than older pending status.
DEV-03 family/meal mutation follow-up is now source-verified, not installed:
owner-keyed state, bounded cancellable writes, stable in-memory attempt IDs and
invitation tokens, read reconciliation before explicit retry, and truthful
post-write read-failure notices. Five focused files / 41 tests and all 43 extended
isolated kitchen browser checks passed, including 320/390/1440px at 125% text.
Six RPC requests/five commits were simulated; no real backend/AI was contacted,
and process cleanup passed. Full Quality/Database Safety passed for `d7b9d9a`
(push/PR), 158 files / 1,606 tests and one existing skip. Earlier fixture query/
cache/selector and launch-timeout failures remain failed evidence. Local typecheck
was interrupted under load, not counted as passing; CI typecheck passed separately.
No schema/RPC/RLS change is needed. Preserve the owner viewer until safe closure
and the normal Check/backup/restore/Update/installed-acceptance gates.
The next conflict-read/rename follow-up is also source-verified (`2e21e97`):
explicit bounded read-only recovery, preserved committed-result notices and
owner-held rename drafts pinned to the original revision. Pending rename controls
are disabled; failed shared reads hide records without deleting typed drafts.
Seven focused files / 65 tests and all 56 isolated kitchen checks passed at
320/390/1440px and 125% text, with seven
simulated RPCs/six commits, 213 mocked reads, zero real backend/AI/forbidden calls
or page/fixture errors, and confirmed process cleanup. Full Quality/Database
Safety passed on push/PR: 160 files, 1,619 tests and one existing skip. No frontend
update, backend/schema, real account, password or internet change was made.
Keep the real owner viewer open. The pairing audience follow-up is now also
source-verified (`498f909`): owner-keyed state, revision/kind-scoped adult-wine
opt-in, no silent re-enabling after child selection/read errors, and explicit
missing-profile reset while incomplete-context results are withheld. Authorized
shared profiles and deterministic ranking remain. All 64 isolated kitchen cases
passed at 320/390/1440px and 125% text: 304 mocked reads, seven simulated RPCs/six
commits, no real backend/AI/forbidden requests or page/fixture errors, cleanup
confirmed. Full Quality/Database Safety passed on push/PR: 161 files / 1,635
tests and one existing skip, including 46 tests in the three affected files.
The extra local focused run was interrupted, not passed. A directory export
failed with EOF after compilation; the cached tar export/extraction succeeded.
The earlier browser run reproduced the old checkbox bug and remains failed
evidence. No real viewer, schema, account, provider, password or internet change.
Explicit pairing choices/returns are now source-verified: UI `aa1c154` passed all
72 isolated kitchen checks at 320/390/1440px and 125% text, with 367 mocked reads,
seven simulated RPCs/six commits, zero real backend/AI/forbidden calls or page/
fixture errors and confirmed cleanup. Missing recipes retain an actionable
selector; wine mode requires an explicit bottle rather than silently choosing a
replacement. Return links pin the chosen version and only retain a matching
cooking context. Pure follow-up `d1a85c4` retains unknown origin portions instead
of guessing; its absence case is unit-tested, not a new UI-browser case. Full CI
passed (push/PR), 161 files / 1,643 tests and one existing skip, including 49 tests
in the three affected files. The extra local render run was interrupted, not
passed. No installed update, schema, account, provider, password or internet change.
Owned PilotAccept household/meal/pairing regression helpers are now prepared in
source, not executed against the installed app. They verify the immutable fixture
tag through normal local Auth before forwarding, use an auxiliary completed
session without altering the original cooking state, bound all fault writes,
and verify exact-owner household/meal cascades after tagged-account cleanup.
Prepared cases include lost replies/double submit, pending rename, saved/read
failure, child-wine opt-in, explicit bottle/pinned recipe links, actual-RPC
revision conflict, late view replies and three peer-RLS reads. Unit mocks do not
prove these installed behaviors. Local full Vitest passed: 162 files / 1,699
tests; five focused files / 83 tests, typecheck and full lint also pass.
Full Quality/Database Safety passed for `b363b14` (push/PR), with 162 files /
1,698 passing CI tests and one existing platform skip. Synthetic build/runtime
and client budget passed; four existing Chef lint warnings remain.
No fixture, browser, account, provider or runtime was started/changed.
The late-account-write follow-up is now prepared/unit-tested in source, not run
against the installed app. It holds one committed profile save and one revision-2
meal edit, signs into the existing peer fixture through normal UI in a control
tab, and requires peer-JWT reads in both original still-mounted documents before
releasing either reply. Further writes/stale reconciliation are blocked/counted;
old drafts/notices, document replacement and partial page cleanup fail the probe.
No session injection or saved browser state is added. Existing logout/peer checks
and tagged-account cleanup remain. Five focused files / 107 tests and local full
Vitest (163 files / 1,727 tests), typecheck and full lint passed. Four existing
Chef warnings remain. The interrupted older full run has no retained outcome.
Full Quality/Database Safety passed for `6358f87` (push/PR), with 163 files /
1,726 passing CI tests and one existing platform skip. Synthetic Node build/
runtime, client budget and security checks passed; public release stays blocked.
QA dependencies were restored from the unchanged lockfile, without install
scripts, in ignored `.qa-account-regression.local`; the dangling root dependency
junction now points there, not OneDrive or the missing external QA directory.
No installed runtime, real account/key/provider, password or internet change was
made. Memory recovery is now implemented/source-verified, not installed: owner-
keyed state, bounded verified-token reads/writes, cancellation, retained conflict
drafts and committed-result notices. Unknown replies require explicit read and
nonwriting completion; no mutation/reset/AI replay is automatic. The existing
fresh-read helper and account scope are reused. The final isolated kitchen run
passed all 85 checks at 320/390/1440px and 125% text, retaining the prior 72,
including visible keyboard recovery above the mobile nav. Eleven RPCs/nine
commits and 438 reads were simulated; real backend/AI, forbidden requests and
page/fixture errors were zero, with confirmed cleanup. Mobile/desktop memory
screenshots were inspected. Seven focused files / 83 tests, full local Vitest
(166 files / 1,767 tests), typecheck and full lint passed. Two existing ChefPanel
warnings remain. Initial red/API typing and fixture owner/dialog-timing failures
are not accepted runs; prior artifacts/reports remain in ignored local dist.
Full Quality/Database Safety passed for `cdf7cc0` (push/PR), 166 files / 1,766
passing CI tests and one existing platform skip. Synthetic Node build/runtime,
client budget and security checks passed; public release remains blocked.
Keep the real owner viewer open. Next non-disruptive DEV-03 source preparation:
extend the existing owned memory-control fixture for these read/uncertain/
conflict/late states with ordinary tagged-account Auth/RLS, not real owner data
or provider evaluation. Installed acceptance still needs
safe closure and the normal Check/backup/restore/Update/fixture/owner gates. Do
not infer installed acceptance from the 85 synthetic cases or start DEV-04 yet.

Current migration status and cutover order:
`docs/lovable-exit-2026-10-23.md`. Earlier dated documents describe historical
preparation and must not override the current standalone default.
The current Windows backend supersedes hosted-test runtime instructions:
`docs/owned-local-windows-2026-10-25.md`. Operate only exact labelled local
containers/volumes and fixed loopback ports. Do not delete volumes, regenerate
lost root credentials, publish a tunnel or import real data automatically.
Owned runtime state now lives in `%USERPROFILE%\WineSnapOwned`, not the MSIX-
virtualized `%LOCALAPPDATA%` directory. All owned tools must use this same root;
the copied provider store is still CurrentUser-encrypted. The old state is kept
as a migration rollback copy, not an active runtime. Never fall back to generating
new backend keys when the installed volumes or original credentials exist.
`get-owned-windows-status.ps1` is the read-only supervisor check. Windows startup
uses a limited, interactive current-user task with logon and two-minute recovery
triggers. `Resume` only starts verified existing containers; `RestartApp` only
restarts the verified web container. Do not reboot Windows as an acceptance test
without a separate request. Internet preparation targets the separate proposed
`winesnap.boleoai.se` hostname and is not permission to change the apex site or
old production. Never resume the historical Quick Tunnel or expose the mailbox.
The owner declined card-backed Cloudflare Zero Trust and approved only the separate
`winesnap-owned-windows` tunnel. After action-time confirmation, its sole published
route is now `https://winesnap.boleoai.se`, behind the owner-only Authelia gate.
Do not broaden that route, expose core services or alter the old production. Its connector
credential is CurrentUser-encrypted in `internet-tunnel.dpapi` under the owned
runtime root, not in Git. Card-free Authelia gate preparation is described in the
2026-10-28 addendum and `docs/owned-internet-2026-11-01.md`. Owner credential setup,
gate restart/rollback and external anonymous denial are verified. Authenticated Chrome
acceptance now passes through the public hostname, including responsive 390px checks,
live scan/chat and disposable cooking persistence. Physical mobile/camera and outside-home
acceptance remain separate gates. Never run `create-owned-gate-key.mjs` directly: it is a
private stdin/stdout helper whose output includes gate secrets.
`run-owned-ingress.ps1` controls only the separate private gate/proxy, not a
connector or DNS. It is installed and supervised. Resume requires the
existing exact labelled resources and owner-created `internet-gate.dpapi`; it
does not provision missing resources. The gate database has its own volume for
durable regulation state, covered by a separate CurrentUser-encrypted gate archive
and isolated SQLite/key restore rehearsal, not the application-backup manifest.
Use its `Backup` and `Rehearse` actions through the PowerShell wrapper; the Node
backup envelope is private and must never be printed or run directly. The separate
`run-owned-tunnel.ps1` owns only the approved isolated connector. Its token is
tmpfs-only inside the container, never an argument, build input or Docker env.
`Stop` disables supervisor recovery for that component; `Install` explicitly
re-enables it after preflight. Never stop the shared Docker engine to test recovery.
Owner-authorized password recovery uses `reset-owned-passwords.ps1 -Action Window`
with the explicitly supplied local account email. The human chooses both passwords
in masked fields; no guessed passwords, root-key regeneration or hosted resets.
Never run its private worker directly or print its gate envelope. See
`docs/owned-password-recovery-2026-11-05.md` for partial-completion and recovery rules.
The owner chose saved-password autofill instead of passkey enrollment on
2026-11-12. Use the human-only `reset-owned-passwords.ps1 -Action Window -GateOnly`
with the explicit owner email. It requires the installed, enabled owner handoff,
changes only the gate login/session secret, and verifies the exact app identity
without changing the app password. Mobile saving needs human approval on that
device; do not access password-manager UI, reopen Enroll or claim mobile success
from a backend probe. Existing TTLs, denial rules and admin step-up stay intact.
See the saved-password addendum in `docs/owned-password-recovery-2026-11-05.md`.
Gate-only password activation and normal owner-account handoff were verified on
2026-11-12. Check Status rather than opening recovery again on generic login or
continuation requests. Mobile password-manager saving/autofill is not yet attested.
Pending password stores require a newly constructed owner/System-only protected
ACL; copying a clean `Get-Acl` object can silently leave inherited permissions.
The manual `check-owned-password-storage.ps1` probe tests the exact functions on
synthetic temporary bytes, including replacement/rollback and cleanup. A pending
encrypted hash is not an activated password or proof of a successful login.
The owner previously requested private password-free access, not public account
exposure. `configure-owned-device-access.ps1` prepares an exact existing-owner
binding and enables vendor passkeys plus a verified gate-to-GoTrue handoff.
Never run `owned-device-operator.mjs` directly: Prepare returns private enrollment
material. Real authenticator approval must remain human-only; no virtual passkeys
on the real account or exported browser state. See `docs/owned-device-access-2026-11-05.md`.
Do not equate a prepared binding or Status read with completed device enrollment.
The device opt-in adds an owner-only two-factor rule for the existing `/admin`
view so pinned Authelia exposes registration; all ordinary app routes keep their
one-factor policy. Do not use a fake/bypass rule or experimental factor policy.
The helper must verify `webauthn` capability and the exact vendor Add control,
not a generic menu button, before asking for human approval. The isolated
`check-owned-gate.mjs --device-access` probe tests this without a real passkey.
`run-owned-windows.ps1 -Action Update -PublicOrigin https://winesnap.boleoai.se`
is an explicit owned-only build/auth change, not a tunnel activation. Ordinary
updates preserve an installed public-origin label; `-LocalOnly` is the explicit
rebuild rollback. The approved public-origin update is installed. Do not run either
mode change merely to test its source. GoTrue mail verification paths must include
`/backend/auth/v1/verify` in public-origin mode; an absolute mail path replaces the
API base path. Keep that covered in the actual owned acceptance workflow.
Build-asset requests in the service worker must retain same-origin gate cookies;
omitting them returns the login portal instead of CSS/JavaScript on the owned hostname.
Keep private/no-store/Vary/redirect cache guards and the anonymous cooking-shell fetch.
Do not exempt static assets from the gate or cache owner-authenticated kitchen HTML.
Use `run-owned-windows.ps1 -Action Features` for tagged, disposable backend
fixtures. `FeaturesAi` is a separate opt-in with up to eight real AI scenarios;
never schedule it or substitute it for browser/mobile verification. Clean up
only exact fixture IDs whose email and run metadata match, never real accounts.
`ScanAccept` is another manual opt-in: it sends the previously approved original
Zehn Morgen WebP through the installed AI path with a disposable fixture, then
checks save/image/restart/erasure. Never schedule it or infer that its loopback
browser proves public-owner/mobile acceptance. Keep provider-scenario accounting
separate from the test browser's forbidden external-network counter.
`test-owned-terra.ps1` is a manual, isolated `gpt-6.1-terra` evaluation. Never
invoke `check-owned-terra.ts` directly: it consumes private stdin credentials.
The wrapper reuses CurrentUser-protected owned keys; only administrator-tagged
synthetic accounts may enter its handler dispatcher. No deployed model or
configuration is changed. `-ImageOnly` repeats the approved original-label
fixture without rerunning the other live scenarios. See
`docs/terra-evaluation-2026-11-06.md`; failed quality checks must remain failures.
`-SolImage` runs only the original-image comparison through the existing Sol
label client (at most four provider requests including its canary). It does
not enable Terra or change any running model. Sol passed all three follow-up
image checks; the ordinary label default remains Sol.
For interactive browser acceptance, `BrowserPrepare` creates a separate local
fixture and sends a normal sign-in link only to the local inbox. `BrowserInspect`
reads its cooking state; `BrowserMemory` separately makes one live Gemini
extraction scenario. Always finish with `BrowserCleanup`. The private
`browser-fixture.json` manifest is independent of status reports; only matching
ID, synthetic email and administrator-written `app_metadata` allow cleanup.
Never schedule browser fixture preparation or live AI scenarios.
`BrowserConflict` can simulate a newer server revision only for the manifest's
exact synthetic cooking session and recipe version, after all fixture-owner
checks. It is a backend test operation, not proof that a browser is offline.
`run-owned-windows.ps1 -Action Offline` is a manual Playwright acceptance against
only the owned loopback app/API. It waits for the local operation lock, creates
an administrator-tagged disposable fixture, blocks external/provider requests,
and checks real browser network loss, reload, reconnect, both conflict choices
and logout erasure. It always attempts exact-owner cleanup. Do not schedule it,
reuse a real account/session, or persist browser login state, HARs or traces.
Screenshots and a credential-free phase marker go under `dist/owned-offline`;
the sanitized final result is in the private `offline-status.json` report.
New owned backups use version 2 with the `owned-logical-v1` database/file manifest.
Use `scripts/rehearse-owned-recovery.ps1` for a same-PC, isolated restore of the
latest compatible encrypted archive, or `-BackupFile` with an exact archive
basename. It must never restore over the installed stack, expose ports, mount
permanent data, load provider keys or replay migrations. All clone resources
must match the random invocation's `owned-backup-rehearsal` labels and are
removed afterward. This is not portable/off-device or production recovery.

`node scripts/check-owned-operations.mjs` is a manual, read-only Windows check of
supervisor health, maintenance, bounded status reports and retained archive names.
It opens no keys, decrypts no archive and starts no job or network request. Exit 2
means local operational evidence needs attention, not failed application tests.
It requires a recent matching rehearsal of the latest retained app/gate backup;
daily backup rotation can make that rehearsal pending again. It never attests
public release, portable recovery, external email, cold boot or physical mobile.
See the local-operations follow-up in `docs/owned-internet-2026-11-01.md`.

Portable recovery tooling lives under `scripts/portable`, with its own pinned
`age-encryption` dependency/lockfile. Install using `npm ci --prefix scripts/portable
--ignore-scripts`; do not install through the shared root node_modules junction.
Use only `scripts/run-owned-portable.ps1` for real snapshots and passphrases.
NEVER run `scripts/portable/worker.mjs` directly or print its output: Create and
RecoverFiles return private envelopes containing archive material/credentials.
The wrapper uses masked human-only passphrase entry, private pipes, CurrentUser
reencryption and an independent `%USERPROFILE%\WineSnapPortable` work directory.
It never writes over the active runtime or starts a tunnel. SelfTest uses a
temporary random test phrase, removes its files and creates NO usable backup.
An actual Create requires a clean committed checkout and an owner-retained
recovery phrase. RecoverFiles is a verified staging operation, not live deployment.
See `docs/portable-backup-2026-11-01.md`. Never equate an isolated rehearsal with
an actual second-PC/off-device/cutover acceptance or record legal sign-off.

The owner approved the guided food-and-wine pilot delivery plan on 2026-11-05:
`docs/pilot-development-plan-2026-11-05.md`. Food and wine are equal, WineSnap stays
the working name, and pilot sessions are guided on this PC rather than public
internet onboarding. Two generated light/dark design boards are under
`docs/design/pilot-2026-11-05`; they are illustrations, not implemented app screens.
The owner explicitly selected concept B (dark) on 2026-11-05. Implement the actual
app behind `VITE_PILOT_UI_ENABLED`, default off, only for the owned backend. Never
ship the raster boards as UI or revive the old Chef prototype as the real app.
The owned Update's `-PilotUi Dark` explicitly selects the new experience;
`-PilotUi Classic` is the UI rollback, independent from public-origin routing.
Ordinary updates preserve the installed `winesnap.pilot-ui` label. `PilotAccept`
is manual loopback Playwright acceptance with a tagged disposable fixture and
blocked external/AI requests, not physical-device or public-release proof.
Pilot stage 3 is installed: `docs/connected-journeys-2026-11-06.md`. Food/wine
return hashes carry only bounded IDs/servings, never arbitrary return URLs or
private memory. Resolve exact owned recipe versions and active sessions; do not
substitute a current version or another bottle for an unavailable explicit target.
The owned pilot browser check includes both directions and timer-state fingerprints.
Pilot stage 4 is installed and verified: `docs/core-states-2026-11-06.md`.
Preserve explicit AI retries, owner-bound save IDs/tokens and read reconciliation
before retrying uncertain wine inserts. Browser fault probes use synthetic AI,
not provider calls; separate Offline acceptance covers real network loss and SW.
Stage 5 broader five-journey regression is verified for the local guided pilot:
`docs/pilot-regression-2026-11-07.md`. That checkpoint used frontend `2d98270`,
superseded by the owned update recorded above;
test/demo operator changes do not require an app rebuild. `PilotJourneys` is a
manual one-label/one-Chef opt-in; `-ReplayApprovedImage` replays the existing
approved public-label response and does not resend the image to AI. Never repeat
a successful paid scenario to debug unrelated UI probes. `PilotAccept` now also
checks memory correction/forgetting and ordinary synthetic-account switching.
`PilotDemo` is a separate visible 15-minute example-account viewer, with paid and
external calls blocked. It holds the operation lock until closed/expired, then
removes its exact tagged account and images. Use `PilotDemoCleanup` after an
interrupted viewer, never general account deletion. No browser state is exported.
Stage 6 preparation is ready: `docs/guided-pilot-2026-11-09.md`. Five neutral task
cards and a blank observation method are provided; human sessions remain pending.
`PilotDemoAccept` rehearses the same guarded demo headlessly; it never counts as
a human participant or live AI. Only the pinned previously approved image is
allowed. If CDP omits multipart file bytes, the demo sends only the canonical
local fixture after a matching analysis; never forward uninspected file data.
Cleanup checks the exact fixture owner before a bounded flat-folder inventory,
including orphan uploads. Never delete other folders or record participant data
in Git. Public-release and real-mobile authentication gates remain separate.

Phase-2 recipes and Cook Mode run in the actual local app at `/kitchen`, not
the illustrative Chef prototype on port 5200. See
`docs/cooking-core-2026-10-24.md`. Keep the cooking feature gated to WineSnap-test;
its database gate is independent from UI flags. Snapshots support legacy v1
(20 tables), cooking v2 (24 tables), Chef v3 (30 tables), and meals v4 (35 tables); none is a full
platform backup. Phase-3 AI Chef and inspectable Food Memory are test-only;
see `docs/ai-chef-food-memory-2026-10-24.md`. Preserve all independent gates.
Phase-4 pairing, household invitations and private meal history are also test-only;
see `docs/meals-households-2026-10-25.md`. Never send shared diner profiles to AI
or infer permission to read another member's cellar, recipes or private memory.
Recipe nutrition is a test-only, opt-in view calculation with no persisted dietary
profile. See `docs/recipe-nutrition-2026-10-25.md`; preserve unknowns, source/state
confirmation and EU/US distinctions. No automatic child diet or health tracking.
The owner separately approved these features on the owned local backend. Its
explicit build/server flags and database gates are required; this narrow
exception does not enable any feature on hosted test or production.

Current security/privacy release gates and data-flow inventory:
`docs/security-privacy-review-2026-10-25.md`. Passing test suites is not public
release approval or proof of supplier contracts, full recovery or legal compliance.
Supplier account evidence and draft processing/risk records:
`docs/supplier-privacy-review-2026-10-25.md`. Keep supplier release sign-off separate
from working export/erasure. Fonts ship locally with their OFL notices; do not
restore external font/CDN requests or imply zero-retention/EU-only AI processing.

`npm run release:check` is a source-only, read-only preflight; exit 2 means
release remains blocked. See `docs/release-readiness-2026-10-25.md`. Never create
operator attestations, copy credentials into evidence or treat local application
backup/restore success as full platform recovery. It is not a deploy command.
The current owned-Windows follow-up is `docs/owned-release-preflight-2026-11-04.md`.
The CLI reports `ownedWindows` using existing bounded owned reports and the shared
read-only supervisor inspector, not historical WineSnapHosting/test hints. Version-2
operator evidence uses the fully pending `config/release/owned-windows.example.json`;
the owned backend responsibility gate replaces the cloud-specific Supabase gate,
not the requirement for a reviewed backend decision. Legacy version-1 evidence
remains explicitly cloud-specific. Never convert it or a healthy local report into
owned approval. The owner deferred off-device/second-PC backup checks; keep those
unverified and do not restart them on a generic request to continue.

`scripts/rehearse-local-platform-recovery.ps1` is a separate synthetic local
PostgreSQL/Auth/Storage rehearsal, not a hosted WineSnap-test export. Always use
the PowerShell DPAPI wrapper: the private Node helper's create output contains
synthetic password hashes, passwords and signing material. No hosted URL is
accepted; never generalize it to production or claim portable/off-device recovery.
See the 2026-10-25 addendum in `docs/local-windows-follow-up-2026-10-24.md`.

Use `scripts/configure-test-database.ps1` for the separate PostgreSQL credential.
Its masked Window input saves an existing test password with CurrentUser
encryption; Check reuses it through private stdin in READ ONLY mode. NetworkCheck
verifies TLS reachability without authentication, not database/backup acceptance.
Never use the destructive CI database harness against hosted WineSnap-test,
substitute API keys for this password, reset it automatically, or weaken TLS.
