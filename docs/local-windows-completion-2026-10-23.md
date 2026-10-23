# Local WineSnap Completion

Date: 2026-10-23. Applies only to the Windows app at
http://127.0.0.1:5210/ and hosted WineSnap-test
(`pzniyupmgwvlldvztzqh`). Production hosting, DNS, accounts, storage and database
remain unchanged. This is the latest local status; earlier same-day migration
notes describe previous checkpoints.

## Six Work Items

1. **Local AI transport is complete.** All six AI actions use the local Node
   server in this installation: label reading, chat, personal and similar-wine
   suggestions, restaurant matching and preference extraction. Shared handlers
   retain owner verification, account-state checks, atomic quotas, bounded input
   and fixed direct provider destinations. Ordinary builds retain their existing
   transport; no hosted function was deployed.
2. **Price transport and scheduling are installed; live quotes are blocked by
   the source.** Manual cellar/wishlist refresh now uses the approved private
   server credentials. Writes remain owner-scoped and conditional on the original
   identity/version. Failed lookups keep old quotes, never create AI prices, and
   responses are non-cacheable. Eligible wishlist alerts are checked hourly while
   this Windows user is signed in. The current `api.bolaget.io` destination fails
   DNS/live acceptance on this computer; a working, authorized data source is
   still required before calling price refresh operational.
3. **Local privacy operations are active.** Export, memory reset and account
   erasure use local Node routes, not hosted privacy functions. Owner-only export
   embeds the actual image bytes in the downloaded file. Reset/erasure require
   confirmation and a recent sign-in. Erasure removes Storage before Auth,
   durably queues incomplete work and blocks the old session. The hourly
   maintenance job runs bounded retention, orphan-image and erasure batches.
   Full batches are reported as remaining work rather than silently green.
4. **Sign-in and recovery are accepted locally; email delivery is not.** The
   test project's Site URL now points to `http://127.0.0.1:5210`. The exact
   redirect allowlist is `http://127.0.0.1:5210/` and
   `http://127.0.0.1:5210/reset-password`, with no wildcard. A synthetic user's
   real recovery link redirects to the local page, changes that synthetic
   password and allows ordinary sign-in. Custom SMTP is off. Public signup and
   actual delivered recovery emails need an owned SMTP service; Supabase's
   default sender is restricted to project team addresses. Email confirmation
   was not disabled and no real user's password was changed.
5. **Automated mobile/desktop acceptance passes.** Tests cover login, restaurant
   results, owner-only preferences, private images, upload/gallery, share/revoke,
   account controls, camera states, PWA cache/offline behavior, overflow and
   automated accessibility. Chromium camera input is synthetic. Physical-phone
   camera/install behavior and the owner email-PIN tunnel flow remain device
   acceptance checks, not something a desktop test proves.
6. **Local recovery, maintenance and encrypted snapshots are installed.**
   The user-logon launcher starts a single-instance hidden watcher. It checks
   the installed running WineSnap container, pauses 60 seconds between checks and restores
   approved RAM-only credentials after a container restart. It does not start
   an intentionally stopped app, change Docker globally or touch other
   containers. Maintenance runs hourly; application snapshots run daily. Failed
   jobs retry after ten minutes and write safe status reports. Windows reboot,
   before-sign-in operation and full disaster recovery are separate checks.
   A controlled server-process crash has been accepted: Docker restarted only
   WineSnap, then the watcher restored its credentials. An unchanged healthy
   runtime is checked without reinstalling or rotating credentials.

## Credential and Scheduler Boundaries

Provider and test-backend credentials reuse the owner's existing DPAPI-encrypted
stores. No new key entry is required. The local adapter verifies the exact test
project, both opt-in switches, file owner and private permissions. Secrets reach
only the existing private tmpfs file through stdin, not Docker environment,
build arguments, process arguments or host plaintext files. Separate random
maintenance secrets are generated inside the container; user JWTs cannot
authorize scheduler endpoints. Missing credentials fail closed until restored.
Isolated child environments retain Windows OS path variables while excluding
inherited credentials. Generated Windows cache files are excluded from Git.

The watcher operates only after Windows sign-in, with Docker running. Sleep,
logout, a stopped Docker engine or lost Internet access still make relevant
features unavailable. This does not turn a personal PC into an always-on server.

## Application Snapshots

`scripts/run-local-windows-operations.ps1 -Action Backup` reads only the approved
test backend and encrypts before host persistence. Snapshots live outside Git in
`%LOCALAPPDATA%\WineSnapHosting\backups`, with owner/SYSTEM-only permissions.
Each operation prunes snapshots older than seven days, including when the
following backup fails; at most seven snapshots are retained. No cleanup runs
while this Windows session is off. Verification decrypts the snapshot, checks its project and all 20
table sections, and checks SHA-256 for each included image. The live fixture
snapshot includes a real uploaded test image and passes this roundtrip.

This is **an application data snapshot, not a full PostgreSQL/Supabase backup**:
REST reads are not a transactional point-in-time export, Auth password hashes,
platform configuration and schema are excluded, and DPAPI depends on this
Windows account. Verification proves decryption/content integrity, not a full
platform restore. A separately encrypted off-device copy and an isolated full
backend restore remain necessary for disaster recovery. Before serving restored
data, reapply newer erasure receipts so deleted accounts cannot reappear.

## Test Database Repair

Read-only dashboard inspection found the older market-price columns and the
20261005090000/20261010100000 price additions absent from WineSnap-test.
Only those verified missing additions were applied in one transaction, retaining
row data and all policies. Their native migration records were inserted only
where absent, and PostgREST schema reload was requested. Verification finds all
14 expected price columns. No global migration replay or production SQL occurred.

## Operation

From the repository root in PowerShell 7:

```powershell
./scripts/run-local-windows.ps1 -Action Status
./scripts/run-local-windows.ps1 -Action Verify
./scripts/configure-local-windows-ai.ps1 -Action Check
./scripts/run-local-windows-operations.ps1 -Action Maintain
./scripts/run-local-windows-operations.ps1 -Action Backup
./scripts/run-local-windows-operations.ps1 -Action VerifyBackup
./scripts/watch-local-windows.ps1 -Once
# Live provider tests create and clean disposable test fixtures:
./scripts/configure-local-windows-ai.ps1 -Action TestFeatures
```

Status files under `%LOCALAPPDATA%\WineSnapHosting` are
`watch-status.json`, `maintain-status.json`, `backup-status.json` and
`session-status.json`. They contain safe counts and generic failures, not
credentials or private records. Health is process liveness, not model/catalog
availability. A zero-row price job does not prove that the catalog is reachable.

## Acceptance Evidence

- 622 unit tests, TypeScript and ESLint pass.
- All eleven local Gemini chat/recommendation scenarios and the real OpenAI
  text/original-image scan suite also pass after the controlled restart.
- 19 actual local feature scenarios pass, including real Gemini restaurant and
  preference calls, owner-only data, UI-confirmed reset/erasure, downloaded
  image-byte export and actual local recovery redirect. This suite separately
  records the unavailable retail source and unaccepted email delivery.
- 34 mobile/desktop accessibility and overflow cases pass with no browser errors.
- 25 private-image, gallery, sharing, camera and PWA cases pass; temporary test
  accounts and images are cleaned.
- Synthetic standalone build/runtime and client budgets pass. Synthetic artifacts
  are not deployed and are not evidence of real model access.
  The portable Windows check uses a bounded 30-second HTTP timeout for cold
  imports after an initial 10-second run timed out under load. Linux retains
  ten seconds; real application/provider timeouts are unchanged. All six local
  AI routes and all three privacy routes are checked disabled in this default build.
- Encrypted snapshot creation, decryption, 20 table sections and image checksum
  verification pass. Full backend restore and physical-device/reboot checks are
  not certified by these results.

Ignored reports live under `dist/`: `local-windows-features-report.json`,
`release-ui-report.json`, `hosted-image-playwright-report.json` and their
screenshots. No credentials, private exports or temporary sign-in data are
committed. Work stays on the development branch, not main or a production host.

## External Prerequisites

A functioning authorized retail feed, an owned SMTP sender and physical-device
acceptance remain open. The hosted test database/Auth/Storage/image proxy still
require Internet; moving those services onto this PC is a different migration.
OpenAI and Gemini also require Internet and their own API accounts.

SMTP reference: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
