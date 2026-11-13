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

Current access decision, 2026-11-12: the owner abandoned mobile/password setup
for now and requested local-only development. The owned tunnel is deliberately
stopped with supervisor recovery disabled. Do not restart it, reset passwords or
reopen passkey enrollment on generic continuation requests. Use the private
`open-owned-local.ps1` wrapper and the `WineSnap lokalt` desktop shortcut for the
real existing owner account; never replace it with a synthetic demo. The wrapper
uses CurrentUser-protected operator access and normal loopback GoTrue Auth/RLS,
not a public or anonymous login bypass. Never run its private worker directly or
print grants/tokens/browser state. See `docs/local-development-access-2026-11-12.md`.

Installed checkpoint, 2026-11-13: the owned frontend was updated from the clean
`e4740ff` checkout, preserving dark/public-origin labels with zero new migrations.
The tunnel remains disabled. Fresh encrypted backup/isolated restore and 65
installed fixture checks passed, including mocked-AI chat cancellation and real
fixture collector insert reconciliation/revision-guarded editing. Last-page
closure cleanup passes unit and isolated headed-browser checks; this is not a
new real-owner closure test. V2 actual-owner Check, visible Open, duplicate focus
and a later authenticated heartbeat passed. The `WineSnap lokalt` shortcut targets
the current wrapper. Reuse/focus this viewer; never force-close it for another
update. The earlier DEV-02 activation passed; current reactivation is reopened
below. Broader DEV-03 review and actual owner usage remain.
Overview price-refresh account/deadline guards and explicit read recovery are
now source-tested (15 isolated browser cases, 83 focused tests, full CI green
for `b6738f9`), not installed
over the still-open owner viewer. Next source review is remaining family/meal
states; safe activation of this follow-up remains separate. See the canonical
plan's current installation checkpoint; older source-only pending statements
are historical.

Current installation continuation: the owner safely closed the viewer and its
lock released normally. Fresh Check has not passed: owned Resume contention and
severe host resource pressure were observed. The frontend is still `e4740ff`;
do not claim an update, fresh owner login or backup acceptance. The read-only
`inspect-owned-operation-lock.ps1` can classify only the owned operation lock;
never remove it or terminate a holder merely because it is busy. A close-after-
flush stdin helper passes unit/host binary and a full 1 MB Docker digest probe;
fresh backup/restore are not accepted yet. Family/meal read cancellation and
coalescing pass 16 focused tests, all 29 isolated kitchen browser checks and full
CI for `5e07b8d` (1,542 passing tests, one existing skip). An earlier readiness
timeout remains failed evidence. The latest read-only supervisor status is
healthy; fresh actual-owner Check and installation are still pending. Read the canonical current handoff
before retrying. No Windows/Docker restart or unrelated-process stop is approved.
The completed-headless-Check fallback may close only its own private kill-on-close
job after current-run owner verification and scoped logout are proved. It retains
the original 30-second grace and verifies process/output completion. Never apply
this fallback to the visible Open viewer or accept an incomplete/foreign report.

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
