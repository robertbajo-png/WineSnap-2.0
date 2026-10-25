# Local WineSnap Follow-Up

Later development on the same date adds [phase-2 recipes and Cook Mode](cooking-core-2026-10-24.md).
The latest extension is [phase-3 AI Chef and Food Memory](ai-chef-food-memory-2026-10-24.md),
including version-3 application snapshots. The older observations below are historical.
That candidate extends application snapshots to v2 with 24 table sections;
the v1/20-table results below remain historical acceptance evidence.

Date: 2026-10-24. Scope: the Windows app at http://127.0.0.1:5210/
and WineSnap-test (`pzniyupmgwvlldvztzqh`) only. No production deployment,
database operation, credential change or Lovable task occurred.

## Gemini: Live Acceptance Passes

The actual local installation passes all 11 Gemini scenarios and all 20 broader
feature checks, with no fixture-cleanup failures. These include real chat,
continuation, personal/similar recommendations, restaurant matching and
preference extraction. This supersedes the previous checkpoint's Gemini outage;
it is evidence of current acceptance, not a guarantee of provider availability.

The model remains `gemini-3.8-flash`; OpenAI label reading remains `gpt-6.1-sol`.
Existing Windows-encrypted credentials were reused. No new AI key is needed.

Only the local adapter opts into bounded retries of Google's HTTP 503 responses:
at most two retries, exponential backoff with jitter and bounded Retry-After.
Every attempt keeps the original request, provider, model and AbortSignal.
The original total deadline is not extended. Successful answers, timeouts,
network failures, other status codes and OpenAI requests are not retried.
The flag rejects any backend other than the exact approved test project.
Hosted/production defaults remain unchanged. This follows Google's
[transient-error guidance](https://ai.google.dev/gemini-api/docs/troubleshooting).

## Encrypted Snapshot: Isolated Restore Accepted

The new command performs an actual SQL and physical image-byte restore:

```powershell
./scripts/rehearse-local-windows-snapshot.ps1
# Or choose an existing encrypted snapshot within the approved backup directory:
./scripts/rehearse-local-windows-snapshot.ps1 -SnapshotFile $approvedSnapshotPath
```

It reads only the owner's DPAPI-encrypted application snapshots under
`%LOCALAPPDATA%\WineSnapHosting\backups`. Decrypted input travels through stdin,
not a Windows plaintext file or command argument. Snapshot version, test-project
identity, all 20 table sections, account metadata, file ownership/path boundaries,
size limits and image hashes are validated before import.

The rehearsal creates a disposable PostgreSQL 17 container using the installed
official `postgres:17-bookworm` image, resolved to its immutable local image ID.
There is no network, published port or host mount. The process is non-root with
a read-only filesystem, dropped capabilities, memory/CPU limits and temporary
RAM-backed database/image storage. Those boundaries are inspected before import.
The test does not connect to or write any hosted database.

Repository migrations supply the schema, with mocked Auth/Storage platform
contracts. Application row values are compared after import, native foreign keys
are revalidated, and every included image is written and reread with SHA-256
verification. The sandbox is removed on completion, including an outer cleanup
path for timeout. Only safe counts/status are written to
`%LOCALAPPDATA%\WineSnapHosting\restore-status.json`.

Accepted restore fixtures:

- Rich synthetic snapshot: 20 table sections, 2 account metadata records,
  9 application rows and 1 physical image; sandbox cleanup confirmed.
- Latest snapshot: 20 table sections, 0 account metadata records, 1 application
  row and 0 images; sandbox cleanup confirmed.
- No rehearsal containers remained after final verification.

The installed Windows watcher now rehearses every newly completed application
snapshot automatically. The status records the encrypted snapshot's filename,
so an older successful restore cannot stand in for the latest copy. For the
same copy, successful checks repeat daily and failed checks back off for ten
minutes. A failed backup is not accepted as a new restore source. The watcher
retains separate maintenance, backup and restore results plus `jobsHealthy`;
app process health alone does not mark those jobs successful.

This automatic path was accepted with a fresh 2026-10-24 snapshot: all 20 table
sections, 1 application row, no accounts/images, and confirmed sandbox cleanup.
Only the owner-scoped watcher was restarted to load the new schedule; the app
and its credentials were not restarted or changed. Eight additional PowerShell
self-checks cover snapshot correlation, initial/daily scheduling, failure
backoff and unsafe names without starting jobs or accessing credentials.

**This is not a full PostgreSQL/Supabase backup or disaster-recovery acceptance.**
The report explicitly sets `fullDatabaseBackup=false`. Auth password hashes,
identities, a working sign-in service, platform configuration and the Storage
HTTP service are not reconstructed. The snapshot is not a transactional
point-in-time dump. No restored data was promoted or served by WineSnap.
Off-device/portable recovery and application of newer erasure receipts before
serving restored data remain separate requirements. A database dump also needs
separate Storage object recovery, as explained in Supabase's
[backup documentation](https://supabase.com/docs/guides/platform/backups).

## Email: Sender Still Required

Read-only inspection confirms custom SMTP is off in WineSnap-test. An SMTP
sender is for registration verification and password-recovery email, not for AI,
scanning or cellar operations. The existing synthetic recovery-link test proves
the local reset flow, not delivery of a real email.

No owned SMTP service/configuration is available in WineSnap's approved local
settings. Supabase's default mailer is restricted to organization team addresses;
it is not acceptance for general-user delivery. See
[Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).
No account, paid service, email send, password reset or confirmation bypass was
used as a substitute. Connecting an owned sender and testing actual delivery
remain pending.

## Full Database Backup: Connection Still Required

No saved WineSnap database password, Supabase CLI authentication or approved
database connection was found in the scoped local credential locations.
Existing API keys cannot authenticate a PostgreSQL dump. The dashboard shows
only a password placeholder, not a retrievable saved database password.

No password was reset and no broader credential stores were searched. A full
database export and isolated platform restore remain pending approved database
access. The usable encrypted application snapshots and their successful restore
rehearsal do not remove this requirement. Production must remain intact.

## Verification

The verification below describes the original 2026-10-24 follow-up. The later
platform-recovery rehearsal is recorded separately at the end of this file.

- All 668 unit tests across 83 files pass, including 16 bounded-retry cases,
  9 snapshot-validation/SQL-generation cases and watcher-boundary regressions.
- Full-project ESLint and TypeScript pass.
- Synthetic offline build, standalone Node runtime smoke checks and client
  bundle budget pass. Synthetic artifacts were not deployed.
- Real local Gemini: 11/11; broader live features: 20/20; cleanup failures: 0.
- Actual local server is healthy, loopback-only, non-root and read-only.
  Credentials remain privately configured; no provider/admin keys are in the
  container environment.

The existing user-logon watcher, daily encrypted application snapshots and
hourly maintenance remain installed. A real Windows reboot, physical-phone
camera/install acceptance and the owner email-PIN tunnel flow are not newly
verified by this follow-up. The app still uses hosted WineSnap-test for
Auth/data/Storage; it is not a fully offline or fully self-hosted Supabase stack.

## Real Platform Recovery Rehearsal 2026-10-25

The hosted test project's complete backup is still blocked by unavailable
PostgreSQL access. A new, independent local rehearsal now closes the earlier
mocked-platform test gap: it dumps and restores a real PostgreSQL database with
real Supabase Auth password hashes/identities, roles, grants, RLS policies and
Storage metadata, then restores the actual image bytes through Storage HTTP.
Its source contains only newly generated synthetic data, never hosted users.

Run from PowerShell 7 on this Windows host:

```powershell
./scripts/rehearse-local-platform-recovery.ps1
# Or repeat recovery from an existing encrypted synthetic archive:
./scripts/rehearse-local-platform-recovery.ps1 -BackupFile $approvedPlatformFixturePath
```

The installed local images are PostgreSQL `17-bookworm`, Supabase Auth
`v2.197.0`, Storage API `v1.81.0`, and the existing WineSnap Node image used only
as an HTTP probe. The service versions match the official
[self-hosting compose source](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
reviewed on 2026-10-25. Image tags resolve to immutable local IDs, which are bound
into the encrypted archive and checked again on recovery. Missing or changed
images fail closed; the script does not silently pull different versions.

The wrapper creates a source sandbox, generates two example.test accounts,
one private bottle image, a legacy-shaped sharing ID and a retained erasure
receipt. Auth and Storage initialize their own platform schemas. WineSnap's
application migrations and existing test-only image access gate are applied to
this empty synthetic source only. No mocked platform SQL is used.

After source checks, the writer services stop. An unfiltered custom-format
`pg_dump` and separate `pg_dumpall --roles-only --no-role-passwords` are captured
in memory, along with actual downloaded image bytes. Database role passwords
are newly generated fixture secrets, restored explicitly; Auth user password
hashes are part of the database dump. There is no password reset or credentials
copied from hosted projects. The source sandbox is deleted before recovery starts.

The archive is encrypted with Windows DPAPI CurrentUser under
`%LOCALAPPDATA%\WineSnapHosting\platform-recovery`, readable only by the owner
and SYSTEM, with seven-copy/seven-day retention. The freshly written encrypted
copy is read back and checked before restore. Existing-copy mode accepts only
bounded, non-redirected files directly in that private directory. Plaintext
archives, passwords and SQL/service diagnostics are never printed, passed in
host command arguments or written to a Windows plaintext file.

Recovery creates another fresh database and restores roles plus the complete
archive transactionally with stop-on-error. It does not replay application
migrations to reconstruct the destination schema. Table/RLS, policy and grant
catalog hashes must match before services restart. Real Storage uploads recover
file bytes; Storage-generated object versions/timestamps may change on upsert,
so this is not a byte-identical physical-volume or point-in-time restore.

Both sandboxes have internal-only Docker networking, no host ports or bind
mounts, non-root processes, read-only roots, temporary RAM-backed data, dropped
capabilities, no-new-privileges and resource limits. They have no production URL,
real provider keys, SMTP configuration or route to a hosted database. Container
logs are disabled. Cleanup is invocation-specific, with an outer timeout cleanup;
there is no broad Docker prune. The live WineSnap container, watcher and public
backend are not stopped, reset or deployed.

Successful checks include:

- Two original-password logins and two incorrect-password rejections after restore.
- Actual password hashes and Auth identities, plus owner-versus-peer database RLS.
- Legacy share ID and the retained erasure receipt preserved.
- One image restored with matching SHA-256; both users and anonymous direct
  label downloads remain blocked by the actual test image policy.
- A separately captured erasure receipt newer than the SQL archive is imported,
  the existing recovery SQL blocks the restored owner, and actual Storage/Auth
  API deletion removes its image/account while preserving the peer and receipt.
- Verified sandbox cleanup; no restored data is exposed through the live app.

Only sanitized status is saved in
`%LOCALAPPDATA%\WineSnapHosting\platform-recovery-status.json`.
`localPlatformRehearsalVerified=true` means this synthetic test passed.
`hostedTestExport=false` and `fullPlatformRecoveryVerified=false` remain explicit;
no release gate or operator attestation is upgraded by it.

### Remaining Full Backup Requirements

The actual hosted WineSnap-test project still needs an approved PostgreSQL
connection and existing database password, plus independently protected Storage
files and a current external erasure ledger. API keys alone are insufficient.
No broader credential stores were searched and no database password was reset.
The new runner intentionally accepts no remote connection argument; importing a
hosted dump requires a separately reviewed acquisition/compatibility path.

Match PostgreSQL/Auth/Storage versions and preserve managed-schema customizations,
migration history, extension dependencies and encrypted-data root keys. The
official [CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
describes connection and encryption-key requirements. Storage bytes are separate
from a database backup, per the [backup documentation](https://supabase.com/docs/guides/platform/backups).
Auth settings, API/SMTP/provider secrets, Edge Functions, Realtime, schedules and
platform settings need their own approved recovery inventory; a database-only
[project clone](https://supabase.com/docs/guides/platform/clone-project) does not
automatically recover all of them.

CurrentUser DPAPI on this same computer is not portable/off-device disaster
recovery. A separately approved destination, portable encryption/key custody,
restore on a different machine, latest-erasure reconciliation, measured RPO/RTO
and rollback acceptance remain required. No paid project, off-site upload,
production operation or new background schedule was created by this rehearsal.

Verification on 2026-10-25: fresh encrypted archive recovery and repeated recovery
from that saved archive both pass, including newer-erasure reconciliation and
cleanup. All 887 unit tests in 94 files pass (22 new recovery regressions), plus
TypeScript, ESLint, standalone synthetic build/runtime, Chef prototype build and
the unchanged 109,762-byte largest compressed client script. A fresh actual
WineSnap-test application snapshot also restores all 35 table sections, ten
retained rows, zero accounts and zero files, using the existing mocked-platform
snapshot path. That separate result is not relabeled as a hosted platform dump.
Both restore wrappers return explicit exit code 0 after successful cleanup, so
a harmless missing-container probe cannot leave a stale native exit code for
the PowerShell watcher. Failure paths still return 1. Caller-level success was
checked in addition to the JSON report; the existing test watcher is resumed.
