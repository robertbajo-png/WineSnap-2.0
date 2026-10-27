# Owned Local WineSnap on Windows

Date: 2026-10-25. Owner-approved local installation, not a production cutover.
This supersedes hosted WineSnap-test setup as the active runtime on this PC.

## Open and Use

- App: http://127.0.0.1:5212/
- Local confirmation/recovery inbox: http://127.0.0.1:8026/
- Browser API: http://127.0.0.1:54323/
- Register a new account in the app and confirm it through the local inbox.
  Minimum password length is 12 characters. Existing cloud accounts/passwords
  and wines have NOT been imported. The local installation starts empty.
- Messages stay on this PC; they are NOT delivered to Gmail or other real
  mailboxes. The login screen includes a local-inbox link in owned builds only.
- Services bind to loopback only. No public tunnel, router rule, LAN exposure,
  production DNS change or phone-accessible HTTPS address is configured.
- The existing production site and hosted test database are not modified.

## Components and Persistence

Docker Desktop's Linux engine runs actual PostgreSQL 17, Supabase Auth (GoTrue),
PostgREST, Supabase Storage, Mailpit, a fixed nginx gateway and the existing
standalone WineSnap Node app. This is not the synthetic recovery harness or
Supabase CLI's development backend. Official self-hosting references:
[Supabase Docker](https://supabase.com/docs/guides/self-hosting/docker),
[self-hosting responsibilities](https://supabase.com/docs/guides/self-hosting).

Only containers labelled `winesnap.scope=owned-windows-local` and the exact
installation ID are accepted. Persistent volumes are `winesnap-owned-database`,
`winesnap-owned-images` and `winesnap-owned-mail`. Neither Start nor Update removes
them. Setup initializes only an empty owned database, stores its installation
identity, and applies repository migrations in order with SHA-256 checksums.
Changing an already-applied migration fails rather than silently replaying it.

Containers run non-root, read-only, without Linux capabilities or application
logs. Only the app/gateway join an egress-capable bridge; DB/Auth/Storage/SMTP
stay on the internal bridge with no published ports. Gateway Host/Origin guards
protect API and inbox. These controls do not defend against the Windows owner
or anyone with Docker-administrator access.

Auth uses real email confirmation, password hashing, expiring user JWTs and
database RLS. Storage uploads use the user's JWT and ownership policies. Direct
label downloads are restricted; `/api/wine-image` rechecks owner/public-share
and account-erasure status before and after serving bytes without browser cache.
Revoked public shares stop serving images. Do not restore signed public URLs.

Mailpit persists a bounded local inbox: at most 100 messages and seven days.
No relay/forwarding is configured. See
[Mailpit storage](https://mailpit.axllent.org/docs/configuration/email-storage/).

## Operation

Run these scripts using PowerShell 7 from the repository:

```powershell
./scripts/run-owned-windows.ps1 -Action Start
./scripts/run-owned-windows.ps1 -Action Resume
./scripts/run-owned-windows.ps1 -Action Verify
./scripts/run-owned-windows.ps1 -Action RestartApp
./scripts/run-owned-windows.ps1 -Action Update
./scripts/run-owned-windows.ps1 -Action Backup
./scripts/run-owned-windows.ps1 -Action Maintain
# Disposable local fixtures, no provider calls:
./scripts/run-owned-windows.ps1 -Action Features
# Explicit live Gemini acceptance; up to eight AI scenarios:
./scripts/run-owned-windows.ps1 -Action FeaturesAi
```

Start reuses the installed app image; Update deliberately rebuilds the app and
recreates its stateless container. Both preserve local DB/image/mail volumes.
Component images must already be present locally; the helper resolves their IDs
and never implicitly pulls a newer service image. Component-version upgrades
need explicit acceptance, not a blind tag refresh. The installer does not expose
a general-purpose SQL, Docker, URL or credential argument.

`install-owned-windows-startup.ps1` now installs the current user's limited,
interactive `WineSnap Owned Local` scheduled task. At Windows sign-in it starts
Docker if needed, resumes the existing stack, restores RAM credentials and runs
the hidden watcher. A two-minute trigger retries after supervisor termination;
exclusive physical file locks allow only one active supervisor. No administrator login or stored Windows
password is used. Only the exact old WineSnap shortcut is retired after task
verification. See the 2026-10-27 addendum for state migration and recovery checks.
The watcher verifies every minute, runs privacy/price maintenance hourly and
creates a backup daily, with ten-minute failure backoff. It does not restart
services deliberately stopped outside the startup script. Startup after an
actual Windows reboot remains an operational observation, not a simulated proof.

The old `WineSnap Local Test.lnk`, old local test watcher and its app/tunnel are
retired separately after owned-local acceptance. Their persisted files are kept;
never delete the hosted test project, old credentials or unrelated Docker data.

## Credentials and Backups

`%USERPROFILE%\WineSnapOwned\backend.dpapi` contains local-only DB/JWT/job
credentials, encrypted for the current Windows user with private ACLs. It is not
a hosted Supabase key. If data volumes exist but this key is missing, setup fails
closed; do not regenerate it or reset the database. Never print/decrypt it into
chat, shell output or a plaintext host file.

Already-authorized OpenAI/Gemini slots are reused in memory from the copied
Windows-encrypted `%USERPROFILE%\WineSnapOwned\ai-keys.clixml`. No hosted test
API/DB key is imported.
The app receives only a private RAM file, not server/provider keys in browser
settings, Docker arguments or its environment. The frontend contains only the
local anon JWT. AI still sends deliberate AI requests to external providers;
database locality does not mean offline AI or EU-only processing. Existing AI
privacy/supplier gates remain independent. Initial backend setup made no live
model calls. The subsequent scan/feature checkpoints below deliberately use the
authorized providers; they do not certify future billing or availability.

Backup briefly stops local writers, captures a real custom-format `pg_dump`
(including Auth hashes and platform schemas), role definitions without role
passwords, image-file bytes and local root configuration. It resumes services
and verifies them in `finally`. Provider keys and inbox messages are excluded.
Archive bytes pass through private process pipes, then are immediately encrypted
as `%USERPROFILE%\WineSnapOwned\backups\owned-*.dpapi`; a decrypt/hash roundtrip
verifies encryption. Retention is seven copies/seven days. Sanitized reports
contain only filenames, counts and status, never archive or credential payloads.

These are same-PC/current-Windows-user backups. Version 2 now supports the
isolated restore rehearsal described below. Off-device recovery, portable key
escrow and a production recovery/cutover procedure have NOT been accepted.
Do not call the earlier synthetic restore harness proof of restoring this dump;
the owned rehearsal restores the actual encrypted archive instead.
The owner explicitly deferred hosted-test export/password setup; it is not a
prerequisite for using this separate empty local backend.

## Verified Checkpoint

The owned-local acceptance run passed 24 checks using disposable synthetic
accounts and a real image, then cleaned them up. It exercised confirmation SMTP,
wrong/correct passwords, email password recovery, real JWT/RLS ownership, private
and public/revoked images, export/erasure, mobile/desktop browser login/cellar and
persistence of account, share ID and exact image bytes after service restarts.
Browser requests to nonlocal origins were blocked and counted: zero occurred.
Local maintenance returned no failures or remaining work; the first encrypted
full DB/image backup passed its roundtrip. Reports live under
`%LOCALAPPDATA%\WineSnapOwned\*-status.json`, outside Git.

Public release remains separate: production migration and rollback, supplier
sign-off, real outbound SMTP, public TLS/access controls and independently
accepted recovery are not implied by this local installation.

## Owner Account and Real Scan

Later on 2026-10-25, the owner entered/submitted their own new password in the
local registration UI. The local SMTP confirmation link completed normal
sign-in; no administrator account creation, password reset or credential
extraction was used. The existing WineSnap OpenAI connection read the approved
Zehn Morgen original: producer, vintage 2023, Nahe and Chardonnay/Weisser Burgunder
matched the image. One private wine, one photo row and one Storage object were
saved under that owner. Browser reload retrieved the stored 400 x 1471 image.

The strict label reader left wine type unclassified rather than claiming an
inference was label text; the white-wine filter therefore does not include it
until the type is confirmed. This is not an OCR guarantee for other labels.
Testing also exposed the photo lightbox being trapped below the bottom nav by
a page stacking context. It now uses the existing Radix portal/dialog primitives,
viewport-constrained containment, an accessible close action and focus return.
No production/hosted-test request or deployment is part of this checkpoint.

## Remaining Feature Acceptance

The owned backend passed 19 grouped feature scenarios, including eight live AI
scenarios. `Features` runs the eleven non-provider groups; `FeaturesAi` explicitly
adds wine chat/history, grounded personal recommendations, similar wines,
restaurant text-menu analysis, Chef memory chat with idempotent replay, recipe
draft generation, adaptation without changing a saved recipe/session, and exact
feedback-source extraction into pending Food Memory evidence.

The deterministic groups cover owner-scoped cellar editing, notes/aroma
intensities, wishlist duplicate protection, public sharing/revocation, immutable
recipe versions and stale-write denial, Cook Mode portions/checklists/timers,
pause/history/feedback, three distinct meal ratings without inventory mutation,
Food Memory correction/forget/reset and family membership/sharing revocation.
The Chef safety tripwire returns without contacting a provider. This verifies a
technical guard, not the safety of food or medical advice.

Tests create only tagged, synthetic local accounts; deletion checks both exact
email and run metadata before removing them. They never reuse or reset the real
owner account, modify operator gates, redirect credentials, invoke a hosted-test
wrapper or write plaintext sessions/credentials. Cleanup completed with no
failures. Only counts, check names and sanitized statuses are retained in
`features-status.json` / `featuresai-status.json` under the private local directory.
Do not schedule `FeaturesAi`: it intentionally incurs provider requests. Existing
bounded 503 retry behavior can produce more provider HTTP requests than scenarios.

This run found and fixed an old hosted-test-only retry check in the common AI
client. The owned server now passes its explicit owned flag; only the exact
Docker gateway is additionally accepted. Other cloud/loopback targets still fail
closed. No provider key, model pin, retry count/deadline or production runtime
configuration changed. Public share taste bars also now reuse the same bounded
zero-to-ten meter as the rest of WineSnap instead of the old five-point scale.

In the actual owner's browser, cellar producer search and empty results, price
refresh with an unconfirmed candidate, recipe-editor unit conversion/cancel,
empty Food Memory and real sommelier chat/history after reload were checked.
The formatted answer and composer fit a 390 x 844 mobile viewport without
horizontal overflow or covering bottom navigation. The price candidate was NOT
manually accepted. No artificial rating or food preference was added to the owner.

These checks do not replace physical-device camera/background-timer tests,
full offline/multitab acceptance on this new origin, supplier sign-off or an
independent restore of the new backup format. Public release gates remain open.

## Browser Acceptance Follow-Up, 2026-10-26

The local wine-memory endpoint completed a real Gemini extraction against a
synthetic tasting note: liking acidity and disliking oak were stored as two
signals, and anonymous reads were denied. These are Wine Memory signals, not
Food Memory confirmations. No real owner's preferences were added or reset.

The actual browser also refused a stale Cook Mode write after another tab had
opened the same session. It displayed the explicit other-tab conflict and
offered to fetch the update; the server's original step was retained. This is
not yet a complete offline/reconnect or remote-conflict acceptance.

A separate foreground browser check changed two portions to three (400 g became
600 g), checked the ingredient and started a one-minute timer. After a full
reload, all three were retained and the timer continued from its remaining time
rather than restarting. Pause then retained 19 seconds. The 390 x 844 view had no
horizontal overflow. This does not verify device sleep or a background alarm.

The public share page was checked at 390 x 844: its six taste bars represented
5/10, 1/10, 8/10, 6/10, 2/10 and 0/10 as 50%, 10%, 80%, 60%, 20% and 0%. No
horizontal overflow occurred. Only the disposable synthetic wine was shared;
the owner's wine remained private.

Reusable browser fixtures use these manual commands:

```powershell
./scripts/run-owned-windows.ps1 -Action BrowserPrepare
./scripts/run-owned-windows.ps1 -Action BrowserInspect
# Simulate a concurrent server update of this exact synthetic session only:
./scripts/run-owned-windows.ps1 -Action BrowserConflict
# Optional: one real Gemini extraction scenario, never scheduled.
./scripts/run-owned-windows.ps1 -Action BrowserMemory
# Required after the browser session, including after interrupted testing.
./scripts/run-owned-windows.ps1 -Action BrowserCleanup
```

Preparation sends a one-use sign-in email only to Mailpit. The backend-only
helper does not launch a browser or export passwords, sessions or API keys.
Synthetic passwords are derived in memory with a domain-separated local HMAC;
they are not saved or typed into a browser. A private cleanup manifest is
persisted immediately after account creation and is independent of success or
failure reports. An active manifest cannot be replaced by another preparation.
Deletion requires the exact fixture ID, synthetic email and administrator-set
`app_metadata` run marker. User-editable metadata alone is never accepted.

`BrowserInspect` also reports ingredient-check counts and bounded timer state,
without returning credentials or raw recipe data. `BrowserConflict` moves only
the manifest's owned synthetic session to its first step, using that session's
current expected revision. A mismatched owner/version is rejected before any
write. It prepares a reconnect-conflict scenario; the browser must separately
be put offline and its local state/reconnect behavior verified before declaring
that scenario accepted. No real owner's cooking session is used.

Regression checks cover those cleanup guards, repeated cleanup and failure to
save a manifest. A live repeat-prepare was deliberately rejected, then inspection
still retrieved the original session, confirming cleanup information survived.
Source validation passed: 950 tests in 100 files, lint, TypeScript, synthetic
build, independent runtime smoke and client budget. The build is not deployed
over the installed owned app or any cloud site.

The browser tool cannot directly emulate offline mode. Windows browser control
previously stopped because it could not safely determine the current URL; a
later retry on the identified local Chrome window timed out awaiting computer
access. No network setting or security protection was changed. Full airplane-mode
reload/reconnect, device sleep/background alarms and
physical camera acceptance remain open; unit tests or opening `offline.html`
must not be described as equivalent to those real-browser/device checks.

## Actual Owned Backup Restore, 2026-10-26

New owned archives are version 2. They include an `owned-logical-v1` manifest:
per-table SHA-256 fingerprints over sorted row hashes in all 75 application/platform tables, logical
column order/types, schema/function/table privileges, policies, roles and role
memberships, views, sequences, and storage-file names/sizes/content hashes.
The archive and manifest remain Windows-encrypted; reports contain only counts
and statuses. New archive files also receive explicit private ACLs.

Logical comparison preserves every live column and privilege. It ignores opaque
type-descriptor IDs and compacts dropped column-number holes, as `pg_dump` does.
ACL arrays are compared by grantor, grantee, privilege and grant option rather
than physical array/OID order. No schema, grant, table or Auth hash is excluded
to make a failed comparison pass.

Run manually using PowerShell 7:

```powershell
./scripts/run-owned-windows.ps1 -Action Backup
./scripts/rehearse-owned-recovery.ps1
# Or select an exact existing basename, never an arbitrary path:
./scripts/rehearse-owned-recovery.ps1 -BackupFile owned-20261026-182028679.dpapi
```

The latter file passed actual restoration: all 75 tables and their row hashes,
Auth password hashes/identities, grants/policies/functions/role memberships and
share IDs matched. One restored storage file matched its content hash and was
downloaded through the restored Storage service; anonymous access was denied.
A synthetic account created only inside the clone could sign in, was denied for
a wrong password, and could not read the original private wines with its real
GoTrue JWT through PostgREST. The owner's password was neither read, entered nor
reset; matching its stored hash is not a claim that the owner logged into the
clone. All temporary containers and the network were removed afterward.

The restore wrapper reads only private, bounded, same-user DPAPI archives under
`%LOCALAPPDATA%\WineSnapOwned\backups`. It passes decrypted bytes through private
stdin, never a plaintext host file or shell argument. SQL dump parts are hashed
and validated; storage tar entries are parsed with Python's standard `tarfile`
without host extraction. Traversal, links, special files, duplicates and size
overruns fail closed. Python uses the existing bundled runtime, with no package
install or network dependency. Only compatible version-2 logical manifests are
accepted; legacy/draft archives are not silently upgraded or marked verified.

The destination uses randomly named, run-labelled, non-root, read-only containers
on one internal Docker network, with no published ports, no permanent volumes
and no host data mounts. Database/storage writes exist only in bounded tmpfs.
It uses pinned images already installed locally and fresh clone DB/JWT secrets;
source root configuration is validated and discarded, not installed in the
clone. Provider keys are never loaded. Restore itself does not connect to or
stop the running owned database/app; creating a new backup briefly quiesces
writers and resumes them in `finally` as before.

Roles restore under the original `postgres` bootstrap identity. Only the exact
duplicate `CREATE ROLE postgres` is skipped because `initdb` already created it;
every ALTER/GRANT failure is fatal. Database restore uses
`--exit-on-error --single-transaction`. These choices follow the
[PostgreSQL restore guidance](https://www.postgresql.org/docs/17/backup-dump.html)
and [pg_restore reference](https://www.postgresql.org/docs/17/app-pgrestore.html).
The initializer now provides both `/tmp` and the vendor's standard Unix socket
directory, and waits for final TCP readiness, not its temporary init server.
The same default-socket support is included for future fresh owned installs;
an existing DB container/volume is not replaced or reinitialized. See the
[official entrypoint](https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh).

Operational boundaries remain: this is a same-PC restore rehearsal, not an
in-place restore command, portable backup or off-device disaster recovery.
Before a real replacement is exposed, current erasure receipts must be
reconciled so an old backup cannot revive deleted accounts. SMTP delivery,
supplier sign-off, public TLS, rollback/cutover and physical-device acceptance
remain independent gates. Rehearsal reports are saved privately as
`%LOCALAPPDATA%\WineSnapOwned\restore-status.json`; do not schedule this test or
treat it as permission to touch production.

Final source validation passed 972 tests in 101 files, lint, TypeScript, the
synthetic build, independent runtime smoke and client budget. The existing
owned installation and its watcher were healthy after the rehearsal; no
restore-labelled containers or networks remained. No production deployment,
provider request or hosted-test connection was part of this restore checkpoint.

## Owned offline browser acceptance (2026-10-26)

Run `scripts/run-owned-windows.ps1 -Action Offline` manually for the real owned
app at `http://127.0.0.1:5212`. The owner explicitly approved a separate
Playwright browser for this test. It does not reuse a normal Chrome session,
touch production or contact the abandoned hosted test project.

The wrapper verifies the owned stack and waits up to five minutes for its
operation lock. An administrator-tagged synthetic fixture is recorded in the
existing private cleanup manifest before setup continues. Cleanup matches its
exact user ID, synthetic email and administrator-written run metadata. The
browser is closed and fixture cleanup is attempted in `finally`; after a hard
process crash, recover with the existing `BrowserCleanup` action. Never schedule
this acceptance or substitute a real user account.

The browser waits for the app's actual service worker to activate before
opening Cook Mode. Context-level offline emulation and local request failures
simulate network loss; neither navigator state nor online/offline events are
spoofed. Chromium can report `onLine=true` after service-worker navigation, so
an actual failed health request verifies the outage. Independent SDK reads
confirm the fixture's server revision remains unchanged throughout offline
edits, reload and navigation. External and AI requests are blocked.

The acceptance groups cover normal login and a generic cached shell,
offline edits, reload preservation of step/servings/ingredient/paused timer,
private cellar exclusion, one idempotent reconnect write, recovery without an
online event, both explicit
conflict choices, desktop layout and logout erasure of the private offline
copy. The initial complete run passed its nine groups, with fixture cleanup,
zero page errors and zero external requests. Screenshots are under
`dist/owned-offline`; the credential-free result is saved privately as
`%LOCALAPPDATA%\WineSnapOwned\offline-status.json`.

The cooking workspace also gains bounded retry after transient network errors
while pending, visible and still owned by the active account. Delays back off
from 5 to 30 seconds; returning to the foreground can retry immediately. Every
attempt retains the session's idempotency key and rechecks server access.
Conflicts, invalid state and access denial do not qualify for automatic retry;
closing the workspace removes its timer and event listeners. This does not
enable background AI, offline wine scanning or guaranteed mobile timer alarms.

Host-specific verification notes: the broad `Update` control process reached
its 20-minute ceiling on this Windows machine. Independent HTTP checks then
confirmed the running app and the new `2026-10-26-cooking-reconnect` service
worker. The follow-up `Offline` operation performs the normal labelled-stack,
installation and API checks and restores the web container's private RAM keys
before testing. No database restore or data-volume replacement was used.

The separate portable Windows/Node-24 synthetic runtime check timed out twice
on its first health request at the existing 30-second limit. That is not a
passing local smoke result. The same synthetic Node-runtime check, full test
suite, lint, typecheck, builds and client budget passed in Ubuntu/Node-22 GitHub
Quality for commit `dcc2884`; both push and pull-request Quality and Database
Safety runs were green. The actual owned target is the separately tested Linux
container, not the copied native-Windows fixture. These results remain separate
from public release approval and physical-device acceptance.

Post-update acceptance completed at `2026-10-26T22:15:21Z`: all ten browser
groups passed against the updated owned app, including the internet-outage
case with no online event. Stack/database/auth/storage/application checks were
healthy; fixture cleanup completed, page errors and external requests were
zero, and no real account, production or hosted test was changed. The mobile
390px and desktop 1440px layouts were checked, including horizontal overflow.
The focused retry/authorization/offline-boundary run also passed all 18 tests.

## Native Windows smoke readiness (2026-10-27)

The native Windows/Node-24 synthetic smoke reproduced the first-health timeout,
then passed both runtime variants on a diagnostic rerun. The old readiness
probe checked the static manifest, which Nitro can serve before initializing
its lazy application handler. Static readiness was therefore not proof that
the app had started; the precise cause of the intermittent Windows delay is
not established.

The checker now waits for `/api/health` within the existing 120-second startup
budget. Each probe is bounded by the remaining budget; ordinary requests keep
their 30-second Windows and 10-second non-Windows limits. Only transport failures
and HTTP 503 are retried during startup. Process exits, unexpected responses and
security assertions fail immediately. Diagnostics contain only process state,
log size, error-code names and boolean error markers, never raw server logs.
Seven regression tests cover dynamic readiness, cold startup, retry boundaries,
process failure and fail-closed security behavior.

The corrected checker passed both native Windows variants: six SSR routes,
404, static assets, three authentication guards, an unconfigured cron, and a
configured cron refusing a missing secret. It uses only a copied synthetic
artifact on a temporary loopback port, fake credentials and blocked outbound
fetch. No login, AI request, database write, application deployment or Docker
operation is part of this check. This resolves the native smoke checkpoint,
not the separate broad `Update` controller timing note or public release gates.

Post-fix validation passed 990 tests in 104 files, TypeScript, a fresh synthetic
build, both native runtime variants and the client budget. Both variants also
passed against the previous synthetic artifact. The local integrated ESLint
formatter did not finish and was stopped; all other ESLint rules passed in a
separate run, and standalone Prettier approved all four changed files. No lint
configuration was weakened. The unchanged GitHub Quality workflow retains full
integrated lint on Ubuntu/Node-22.

## Windows Supervisor and Internet Preparation (2026-10-27)

The previous AppData location was redirected by the desktop app's MSIX context:
opening `backend.dpapi` and asking Windows for its final handle path resolved to
the Codex package's `LocalCache/Local/WineSnapOwned`. Task Scheduler did not see
that file. This was a real startup failure, not missing user credentials.
`migrate-owned-windows-state.ps1` copied 28 allowlisted files, including encrypted
backend/provider state and backups, to `%USERPROFILE%\WineSnapOwned`. Ciphertext
hashes matched without decrypting the files; owner/SYSTEM-only ACLs were applied.
Windows handle-path inspection confirmed this destination is not redirected.
No database/image volume was moved or replaced. Legacy state remains untouched
for migration rollback; its duplicate backup archives must be included in the
final retention/cleanup decision before public release.

All owned wrappers and browser-fixture manifests now agree on that physical
root. `Resume` refuses missing or foreign containers and does not initialize
volumes, replay migrations or rebuild images. Its actual initial run took about
15 seconds. `Update` reads the complete migration history once, validates every
checksum before applying missing entries transactionally, and rejects changed
or foreign history. The real update passed in about 13 seconds with all 37
migrations already installed and zero newly applied. `RestartApp` passed in
about seven seconds; the owned account, wine and image counts remained one each.
These timings are observations, not performance guarantees under host load.

The supervisor has private cross-session file locks, limited interactive Task
Scheduler ownership, logon/recovery triggers, private atomic heartbeat reports
and separate operation deadlines. Child operations wait for a stdin handshake
until assigned to a kill-on-close Windows job. Closing or terminating the
supervisor therefore also ends its operation descendants instead of leaving an
orphaned PowerShell process holding the operation lock. The next resume can
restart matching services after an interrupted job. These mechanisms follow
[Windows job-object behavior](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

The task runs at normal process priority, not with elevated user rights. Its
two-minute recovery trigger may start another short-lived instance, but the
exclusive private session lock admits only one supervisor. Native job/power
helpers are compiled during installation into the private runtime directory;
startup loads only the source/CLR-version-specific assembly after verifying its
SHA-256 sidecar. Routine startup does not invoke the compiler. Missing or changed
helpers fail closed and require rerunning the startup installer.

`WineSnap Docker Engine.lnk` in the current user's Startup folder starts the
already installed Docker Desktop independently and hidden when necessary.
The WineSnap task only waits for its fixed local Linux engine. Docker Desktop
is deliberately not a child of the supervisor's kill-on-close job: stopping
WineSnap must not stop the shared engine or other applications.

While healthy on AC power, the watcher holds a reversible system power request.
It does not change the global power plan, keep the display on, inhibit manual
sleep or guarantee service through closing the lid, logout or power loss. The
request is released when unhealthy/on battery at a watch check, or on process
exit. See [PowerSetRequest](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-powersetrequest).
The task needs a signed-in Windows user; no unattended SYSTEM service or Windows
autologin is installed. Full cold-boot/logon acceptance still requires an actual
owner-initiated Windows restart.

Crash-recovery acceptance completed at `2026-10-27T21:47:36Z`. Only the verified
supervisor process (30572) and its operation descendants were terminated at
`21:43:43Z`; the running data services were not stopped. The existing scheduled
recovery trigger, without a manual start, launched supervisor 58408. It resumed
the same installation and completed a fresh healthy watch round with healthy
maintenance/backup reports and its AC power request active. This verifies
process-crash recovery, not cold boot, logoff, full-PC failure or public access.

The task still uses the installed Codex-bundled PowerShell and Node executables.
Their paths must remain available; a runtime replacement or removal requires
reinstalling the startup entry and matching native helpers. This is a
current-user desktop installation, not an independent always-on Windows service.

Read-only health check:

```powershell
./scripts/get-owned-windows-status.ps1
```

It checks task identity/state, the actual supervisor process, heartbeat freshness
and job health, without loading keys or contacting a hosted backend. To stop the
supervisor intentionally for maintenance, disable its exact task before stopping
it; stopping it alone is followed by the recovery trigger. Re-enable/start the
same task afterward. Never stop Docker globally or unrelated containers.

Internet preparation uses only the proposed `https://winesnap.boleoai.se`, separate
from the apex site and the old Lovable production. DNS inspection found Cloudflare
nameservers and no existing record for this subdomain. No DNS, account or Access
policy has been changed. Cloudflare login/account acceptance is still required.
No public tunnel is installed or running for the owned backend.

The optional `VITE_OWNED_PUBLIC_ORIGIN` routes a specifically approved browser
origin to `/backend` on that same HTTPS origin, preserving the two local app
origins and the fixed server-side Docker gateway. Synthetic builds ignore it,
and hosted backends cannot enable it. It is not set in the current owned build.
The prepared nginx route denies foreign hosts/origins, Auth administration,
mailbox paths and maintenance hooks. Its real isolated Docker acceptance passed
13 HTTP routing/denial cases; the temporary container had no published ports and
was removed. This is not proof of a live TLS certificate or Cloudflare Access.

The pinned connector configuration requires Access JWT validation on the actual
hostname ingress rule, with a deny catchall, following
[Cloudflare's Access origin parameters](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/).
Account-specific tunnel credentials, exact owner access, auth redirect settings,
external denial/authenticated acceptance and persistence remain to be completed
after authorized dashboard access. Do not use an unprotected or temporary tunnel
as a substitute, expose the local inbox, enable public registration or certify
the wider release gates from this preparatory checkpoint.
