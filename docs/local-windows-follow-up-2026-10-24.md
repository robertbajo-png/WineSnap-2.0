# Local WineSnap Follow-Up

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
