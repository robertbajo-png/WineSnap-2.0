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
   transport; no hosted function was deployed. Earlier live acceptance passed;
   the latest broad reruns encounter Google's upstream 503 (details below), so
   current Gemini availability is not marked green.
2. **Local retail refresh now passes live acceptance.** Manual cellar/wishlist refresh uses the approved private
   server credentials. Writes remain owner-scoped and conditional on the original
   identity/version. Failed lookups keep old quotes, never create AI prices, and
   responses are non-cacheable. Eligible wishlist alerts are checked hourly while
   this Windows user is signed in. The Windows-only opt-in replaces the unreachable
   `api.bolaget.io` source with the public `susbolaget.emrik.org` community mirror.
   Source and source date are stored and displayed accurately. The actual app
   saved the exact 2024 product at SEK 140, refused to confirm it for the 2023 wine,
   and triggered one wishlist alert without repeating it on the next check.
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
   acceptance checks, not something a desktop test proves. A fresh 13-check
   price-only run also passes at 390/1440 CSS pixels, including actual persistence,
   attribution, owner isolation, clean markup and fixture cleanup. This run
   explicitly excludes live AI and privacy acceptance; it is not a replacement
   for the broad feature suite.
6. **Local recovery, maintenance and encrypted snapshots are installed.**
   The user-logon launcher starts a single-instance hidden watcher. It checks
   the installed running WineSnap container, pauses 60 seconds between checks
   and restores approved RAM-only credentials after a container restart. It does not start
   an intentionally stopped app, change Docker globally or touch other
   containers. Maintenance runs hourly; application snapshots run daily. Failed
   jobs retry after ten minutes and write safe status reports. Windows reboot,
   before-sign-in operation and full disaster recovery are separate checks.
   A controlled server-process crash has been accepted: Docker restarted only
   WineSnap, then the watcher restored its credentials. An unchanged healthy
   runtime is checked without reinstalling or rotating credentials.

## Local Catalog Boundaries

Only `WINESNAP_LOCAL_RETAIL_MIRROR_ENABLED=true` with the exact approved test
backend enables the new source. Other builds keep their previous adapter;
enabling this switch against any other backend fails closed. No production
pricing source or data was changed.

The server downloads the fixed public catalog without sending user names, wine
queries or credentials to its operator. A streaming JSON parser retains only
validated wine candidates, not images/history. The import is capped at 128 MiB,
50,000 records and two minutes, with redirects forbidden. On this constrained
container the real 101,668,665-byte import took about 81 seconds; the initial
60-second cap was insufficient. The long budget is for background catalog
ingestion, not an extended browser/provider request timeout. Yielding between
chunks keeps the application event loop available for health/navigation requests.

The index is warmed at startup and by authenticated maintenance even with an
empty wishlist. Only one import runs per process; the validated index is reused
for 24 hours. A ten-minute timer checks whether warming is due, and failed loads
back off instead of creating a request storm. A failed/incomplete import never
replaces the previous index. Last-Modified must be present, not unreasonably in
the future, and no older than 48 hours; stale source data cannot become a fresh
quote merely because it was read again. Discontinued/retained removed products,
duplicate IDs, unsupported formats and truncated/oversized responses are rejected.

This is a public community reference, not an official Systembolaget service,
SLA, resale appraisal or independent guarantee of source accuracy. Its software
license does not by itself establish commercial redistribution rights for the
underlying assortment. Review those terms before a separate commercial rollout.
Source documentation: [Systembolaget Data](https://github.com/C4illin/systembolaget-data).

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
while this Windows session is off. Verification decrypts the snapshot, checks
its project and all 20 table sections, and checks SHA-256 for each included image. The live fixture
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
# Independent real catalog/browser acceptance when AI providers are unavailable:
./scripts/configure-local-windows-ai.ps1 -Action TestPrices
```

Status files under `%LOCALAPPDATA%\WineSnapHosting` are
`watch-status.json`, `maintain-status.json`, `backup-status.json` and
`session-status.json`. They contain safe counts and generic failures, not
credentials or private records. Health is process liveness, not model/catalog
availability. A zero-row price job does not prove that the catalog is reachable.

## Acceptance Evidence

- The follow-up verifies all 641 unit cases across the full run and focused rerun;
  TypeScript and changed-file ESLint pass. The broad run passed 640 cases, with
  one configuration assertion still expecting the pre-catalog environment list.
  The assertion now explicitly includes the new test-only switch; all five
  deployment-boundary cases pass on rerun. No unrelated assertion was removed.
  The final focused run also passes all 63 cases across the seven affected suites.
  The earlier baseline also passed full-project ESLint and 622 unit cases.
  The initial complete unit run passed. A later two-worker Windows run passed
  621 cases while SQL-file inventory exceeded its default five-second timeout
  under load; all five inventory-suite cases pass in a focused rerun with a
  bounded 30-second test timeout. Assertions and production timeouts are unchanged.
  For resource-limited Windows verification use
  `vitest run --maxWorkers=2 --testTimeout=30000`.
- All eleven local Gemini chat/recommendation scenarios and the real OpenAI
  text/original-image scan suite also pass after the controlled restart.
- The earlier 19 actual local feature scenarios passed, including real Gemini restaurant and
  preference calls, owner-only data, UI-confirmed reset/erasure, downloaded
  image-byte export and actual local recovery redirect. This suite separately
  records the unavailable retail source and unaccepted email delivery.
- The newest 13-check price-only run passes with real catalog lookup, exact
  owner-scoped cellar persistence, wrong-vintage refusal, one alert across two
  wishlist checks, mobile/desktop screenshots and zero cleanup failures.
  Source evidence is product 2016901, vintage 2024, SEK 140, with the provider's
  2026-10-23 source timestamp. This does not price the original 2023 bottle.
- Two newest broad feature attempts stop at the real Gemini preference call:
  Google returns 503 and the adapter returns a safe 502. Their temporary users
  and images were cleaned (zero cleanup failures). The latest failure remains
  in `local-windows-features-report.json`; the separate price report does not
  overwrite it. No model fallback, success substitution or automatic provider
  retry was added. Earlier successful AI tests are not proof of current uptime.
- 34 mobile/desktop accessibility and overflow cases pass with no browser errors.
- 25 private-image, gallery, sharing, camera and PWA cases pass; temporary test
  accounts and images are cleaned.
- The live worker now serves `2026-10-23-local-retail`. A fresh browser confirms
  activation, removal of an old WineSnap cache and offline navigation fallback.
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

Newest separate reports are `dist/local-windows-prices-report.json`,
`dist/local-pwa-final-report.json` and `dist/client-budget.json`. The live local
app still uses the disposable hosted backend; the synthetic runtime-check build
is not installed over it. Encrypted backup verification again passes 20 table
sections; the latest empty-fixture snapshot has zero image files.

## External Prerequisites

Current Gemini availability, an owned SMTP sender, a full isolated restore with
off-device recovery material, and physical-device/reboot acceptance remain open.
The test dashboard's Free Plan has no scheduled platform backups. This does not
mean a paid plan is mandatory: an approved direct database connection plus a
complete platform/storage backup and restore procedure is another route. The
existing public/admin API keys are not a PostgreSQL connection password.

The protected tunnel still rejects anonymous browsers. A Cloudflare owner PIN
email was requested and its delivery observed, but the final PIN-authenticated
browser flow was not completed. This is distinct from WineSnap Auth SMTP and
does not establish signup/recovery email delivery for the app.

The hosted test database/Auth/Storage/image proxy still
require Internet; moving those services onto this PC is a different migration.
OpenAI and Gemini also require Internet and their own API accounts.

SMTP reference: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
