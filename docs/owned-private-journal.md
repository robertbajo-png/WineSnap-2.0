# DEV-11: Private journal delivery

Owner approval is limited to source and isolated synthetic verification.
The installed DEV-10 app, its 42-migration ledger, connector, old production
and abandoned hosted test are outside this change. Do not apply this SQL,
open the connector or use real accounts or values for this checkpoint.

## Source Boundary

- The owner has two independent, initially off choices. The first is one
  editable available-carbohydrate goal per meal or day. Selecting a specific
  recipe and completing its ingredient inputs permits a per-portion estimate
  comparison; there is no inferred daily intake. The journal preserves blood
  mmol/L, breath ppm and Ketostix categories as separate methods. Measurement
  time is entered with a resolved offset. No health interpretation or AI
  transfer is implemented.
- The browser uses memory only for journal content. Separate POST requests go
  to a narrowly scoped loopback bridge, which pins the local upstream and
  replaces incoming headers with a private proof of that path. Both internet
  ingress configs deny the journal prefix and strip its proof. The server
  independently requires the explicit disabled-by-default runtime flag, the
  true owned backend, a local proof and a GoTrue-verified bearer. Only enrolled
  adult owner eligibility is supported. Database availability and eligibility
  are separate from the browser flag and the two choices.
- The owned-only SQL is separate from the ledger and creates a NOLOGIN API
  role, no eligible account and no installation identity. Its private schemas
  are inaccessible through browser REST tokens, including service-role REST.
  The SQL command serializes against the owner row, checks account erasure
  and the choice revision, and returns a release stamp that is checked again
  before a response. Disabling or account erasure revokes the grant and removes
  the corresponding saved content. Expiry is 90 days from measurement; a
  correction cannot extend it. All values and private drafts are cleared on
  browser scope changes rather than queued offline.
- The Profile rights view links to the local export. The ordinary export is
  unchanged. The journal export is a separate explicit JSON download, never a
  share link. A file the owner saves is a separate copy.

## Recovery Boundary

The standard backup excludes both private schemas and inspects the actual
PostgreSQL archive inventory. Ordinary restoration refuses a dump with either
schema. The dormant account-erasure trigger remains safe when the schemas are
absent. Portable creation and recovery review the application dump in a
log-free, networkless helper. With a verified payload, the Windows wrapper
records permission to copy that exact ciphertext in a CurrentUser DPAPI
marker. Export checks it against a read-locked source before offering a copy.
Older files without this evidence are preserved; a scoped rehearsal can verify
their contents before copying. Nothing is copied in development.

The sensitive backup primitives use an authenticated local envelope and
enforce a seven-day recovery window even after missed maintenance. The
independent control schema is not part of the envelope or of the ordinary
application dump. It holds only consent/version, opaque current entry
permissions and minimum expiry metadata. Rereading an envelope cannot
overwrite these records. To restore an entry, the current installation,
eligible and active account, consent and current entry revision must all
match. Deletion removes the permission, and no missing or superseded grant
is reconstructed from backup. Loss of that control state locks the journal;
it is not a second-PC or whole-machine recovery claim.

The unscheduled Windows vault library uses an owner/System-only directory
on a fixed local drive, CurrentUser DPAPI for its key and last-observed time,
and AES-GCM for separate journal archives. It refuses redirects, synced
paths, changed installation identity, and missing or overly broad vault
permissions. It never falls back to a new key for an existing vault. Capture
preserves the exact bytes and measurement offsets. Publication is an encrypted
temporary write followed by a move within the same directory; no plaintext
intermediate file is created. This vault is not the ordinary backup directory.

Each maintenance invocation attempts SQL expiry and file retirement independently.
It can clear old encrypted files during a database outage, or prune expired
rows while the vault is unavailable. It refuses new capture if either check
fails, and captures populated snapshots at most once per day. Restore checks
sealed capture age and the current database permits; an archive's filename
or filesystem modified time cannot extend its recovery window. A missed tick,
power loss or locked file can delay physical deletion until a successful
retry. This does not make an expired archive restorable. No promise covers
administrator/OS compromise or rollback of the entire machine and its clock.

Before real collection, wire trusted operator-only prune/capture/restore and
an installation-bound maintenance health gate; rehearse first tick, restart,
outage, stale state and retries without touching the running app. The active
role, loopback bridge and automatic job are not installed. Verify real host
paths and database/WAL encryption, rule out sync and host snapshots bypassing
the control store, close the impact and controller decisions in the design
review and approve the local notice before real activation.

## Guarded Delivery And Rollback

Do not reuse a DEV-10 maintenance approval. The dedicated
`PrivateJournalUpdate` action in `scripts/run-owned-windows.ps1` is for a
separately approved **dormant installation** only. Its four explicit
inputs are `-ConfirmPrivateJournalMaintenance`,
`-VerifiedPrivateJournalBackup`, `-ExpectedPrivateJournalRevision` and
`-ExpectedPrivateJournalPreviousImage`. Do not run it during the synthetic
source checkpoint. It neither acquires the approval nor starts the journal.

The installer checks a clean, reviewed checkout, the rehearsed DEV-10 web
image, the exact 42-migration ledger, the current non-web containers, a
paused connector, and the freshly restored encrypted archive matched to
its bytes, installation and previous image. The new backup/restore reports
must affirm exclusion of both private schemas. It builds web source
`ec2b0bb` with the existing owned profile and a forced-off browser flag.
It then checks the inputs again, retains the prior image, and applies the
pinned private DDL separately and transactionally. An unmarked or partial
schema, login, membership, health record or installation identity blocks
the action. There is no change to the ordinary migration ledger.

The new container must serve the existing Kitchen and meal-photo boundaries
while both journal endpoints deny requests. The installer supplies no
journal runtime flag, bridge, credentials, enrolment or new scheduler.
Before an activation window, prove the private listener, rights routes,
inactivity purge, short-lived file retirement and failure behavior with
the exact delivered settings. No ordinary app function may depend on the
journal bridge being up.

If DDL is interrupted, the transaction rolls back and the old container
stays in place. If replacement verification fails, the installer returns
to the retained prior web image without dropping tables, restoring an old
database or restarting the non-web services. A fully marked, verified
empty schema may remain for a separately approved retry; an unknown
container or catalog is never silently replaced. After real use, disable
access first and prefer a forward repair with independent control intact.
Loss of that control is a fail-closed case, not authorization to recover
contents anyway.

## Synthetic Checks

- The initial disposable database run applied the 42 ordinary migrations,
  then the owned-only journal schema separately. Real fixture logins passed
  account and REST isolation, separate choices, validation, export,
  withdrawal, expiry, selective restore, and whole-account erasure.
  Cleanup was verified. The extended run also passed rejection of a full
  PostgreSQL dump and approval of the two-schema exclusion, encryption
  envelope recovery, and the late export race. Its first browser login
  attempt timed out, and the disposable stack was removed. A dedicated
  rerun passed both real synthetic logins, the 320px/1280px layout checks,
  goal comparisons, manual save and export, method separation, offline
  clearing, cross-tab withdrawal, peer denial and cleanup.
- The final combined run repeated the database, actual dump, selective
  recovery, late export and deletion checks; the dark Kitchen passed at
  320px and 1280px with two real synthetic logins. Both viewports were
  visually reviewed. All disposable servers and fixtures were removed.
- The isolated delivery rehearsal built a dormant image from `ec2b0bb`
  with a test publishable configuration, and ran the exact prior web image
  `f8b99303c8f8` with networking disabled. With 42 unchanged migrations,
  injected DDL failure rolled back in place. Injected failure after the
  candidate started led to a verified web-only return; a newer private
  synthetic wine saved during the update still existed, and its peer
  could not see it. The empty, locked private schema was safely reused.
  Two real Nginx fixtures (one with a simulated accepted outer login)
  served ordinary traffic and denied both journal paths as well as the
  private REST schema; proof headers were stripped. Cleanup passed.
  The focused Windows delivery regression run passed 69 tests; the
  PowerShell wrapper passed parser validation.
- The `--ordinary-recovery-only` rehearsal restored the filtered dump and
  roles into a fresh networkless PostgreSQL instance. The logical catalog
  and all 79 ordinary relations matched. Both private schemas were absent;
  ordinary account erasure passed with the restored bridge function still
  present. This is not proof of live Windows disk protection, scheduled
  private-file expiry, or a full backup on the installed app.
- The `--windows-storage` rehearsal applied all 42 ordinary migrations and
  the private SQL in a disposable backend. The real operator functions pruned
  an expired permission, captured into the Windows-protected vault and restored
  only the still-permitted entry after a deletion, an edit and simulated data
  loss. The run also passed actual dump exclusion, late export denial, ongoing
  expiry and withdrawal, and whole-account erasure. Test vault and backend
  cleanup both passed. This pipeline is not a live operator adapter.
- The final standalone Windows run passed DPAPI reopen from a new process,
  exact byte/offset roundtrip, expired restore refusal without a maintenance
  tick, clock regression after expiry, tamper and rename refusal, independent
  cleanup on store failures, and retry after a locked file. Pending ciphertext
  was removed, wrong identity and broad permissions were denied, and an
  ordinary backup canary was unchanged. A previous run timed out at the
  restart step; no timeout was increased and that run is not a pass.
- The default synthetic Node build, typecheck, Node smoke and client bundle
  budget passed. The smoke checks require 404 for both journal endpoints.
- Full lint passed with two existing Chef warnings. The full Vitest attempt
  reported 2,327 passes, two unrelated timeouts and one stale DEV-07 guard
  assertion. The two timed-out cases passed on rerun; the guard assertion
  was brought in line with the existing stricter DEV-10 code and then
  passed. No global timeout was raised.

- Run the existing typecheck, lint, unit tests, default synthetic Node build,
  runtime check and client budget. DEV-11 must stay dark by default.
- Run `scripts/check-isolated-private-journal.ts` with the existing local
  tsx executable. This uses a randomly named internal Docker network,
  disposable PostgreSQL/GoTrue/PostgREST, and no host-mounted application data.
  It does not start or connect to the owned app.
- For the browser cases build Vite mode `private-journal-check`, then add
  `--browser` to that script. It starts disposable listeners on loopback
  ports 5291/5292, uses real synthetic sign-in, and denies direct browser
  network access. This is responsive browser evidence, not physical mobile
  access, an installed-run report or authorization to collect real values.
- `pwsh -NoProfile -NonInteractive -File scripts/check-owned-private-journal-vault.ps1`
  runs the vault checks with only synthetic vectors in a private temporary
  directory. Use PowerShell 7 and run the SQL-to-vault rehearsal separately
  with `tsx scripts/check-isolated-private-journal.ts --windows-storage`.
  It passes disposable fixture bytes over a private pipe, does not print
  contents or keys, and cleans up the disposable vault and backend. Neither
  test invokes the installed supervisor or configures real maintenance.
- For dormant delivery, `node scripts/build-isolated-private-journal-web.mjs`
  builds the pinned runtime with a synthetic public configuration.
  `node scripts/check-isolated-private-journal-delivery.mjs` uses the same
  replacement functions in a disposable stack. It does not launch the
  Windows wrapper or connect to the installed app. It is not a
  byte-identical build with the eventual installed publishable key.
