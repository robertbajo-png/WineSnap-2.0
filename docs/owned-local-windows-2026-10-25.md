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
./scripts/run-owned-windows.ps1 -Action Verify
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

`install-owned-windows-startup.ps1` installs only the current user's labelled
`WineSnap Local.lnk` startup shortcut. At Windows sign-in it starts Docker if
needed, starts the local stack, restores RAM credentials and starts the hidden
watcher. No administrator login or stored Windows password is used.
The watcher verifies every minute, runs privacy/price maintenance hourly and
creates a backup daily, with ten-minute failure backoff. It does not restart
services deliberately stopped outside the startup script. Startup after an
actual Windows reboot remains an operational observation, not a simulated proof.

The old `WineSnap Local Test.lnk`, old local test watcher and its app/tunnel are
retired separately after owned-local acceptance. Their persisted files are kept;
never delete the hosted test project, old credentials or unrelated Docker data.

## Credentials and Backups

`%LOCALAPPDATA%\WineSnapOwned\backend.dpapi` contains fresh local-only DB/JWT/job
credentials, encrypted for the current Windows user with private ACLs. It is not
a hosted Supabase key. If data volumes exist but this key is missing, setup fails
closed; do not regenerate it or reset the database. Never print/decrypt it into
chat, shell output or a plaintext host file.

Already-authorized OpenAI/Gemini slots are reused in memory from the existing
Windows-encrypted WineSnap provider store. No hosted test API/DB key is imported.
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
as `%LOCALAPPDATA%\WineSnapOwned\backups\owned-*.dpapi`; a decrypt/hash roundtrip
verifies encryption. Retention is seven copies/seven days. Sanitized reports
contain only filenames, counts and status, never archive or credential payloads.

These are same-PC/current-Windows-user backups. A fully automated restore into
another isolated instance, off-device recovery, portable key escrow and disaster
recovery acceptance have NOT been implemented for this new archive format.
Do not call the earlier synthetic restore harness proof of restoring this dump.
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

The public share page was checked at 390 x 844: its six taste bars represented
5/10, 1/10, 8/10, 6/10, 2/10 and 0/10 as 50%, 10%, 80%, 60%, 20% and 0%. No
horizontal overflow occurred. Only the disposable synthetic wine was shared;
the owner's wine remained private.

Reusable browser fixtures use these manual commands:

```powershell
./scripts/run-owned-windows.ps1 -Action BrowserPrepare
./scripts/run-owned-windows.ps1 -Action BrowserInspect
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

Regression checks cover those cleanup guards, repeated cleanup and failure to
save a manifest. A live repeat-prepare was deliberately rejected, then inspection
still retrieved the original session, confirming cleanup information survived.
Source validation passed: 950 tests in 100 files, lint, TypeScript, synthetic
build, independent runtime smoke and client budget. The build is not deployed
over the installed owned app or any cloud site.

The browser tool cannot directly emulate offline mode, and Windows browser
control previously stopped because it could not safely determine the current
URL. Full airplane-mode reload/reconnect, device sleep/background alarms and
physical camera acceptance remain open; unit tests or opening `offline.html`
must not be described as equivalent to those real-browser/device checks.
