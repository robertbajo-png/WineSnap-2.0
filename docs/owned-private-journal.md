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

The separately reviewed Windows installation still needs a trusted
CurrentUser key store and short-lived local archive directory, scheduled
expiry/purge, integrity and rollback checks, and exact binding of the
new role and bridge. Before activating real collection, establish
controller responsibility and impact decisions from the design review,
verify private host paths including live database/WAL encryption and no cloud
sync/host snapshots bypassing the control store, and review the local notice.
No protection against an OS administrator or compromised system is claimed.

## Guarded Delivery And Rollback

Do not reuse a DEV-10 maintenance approval. In a separately approved
window, pin the installed web image, ordinary ledger, private ingress and
pre-change verified archive before starting. Rehearse the exact candidate
and fallback with synthetic accounts and a disposable database. Verify
both internet ingress denials with no public connector open. Do not
provision eligibility, Windows startup, a journal archive key or API login
through the generic upgrade path.

An installation-only run must keep the server and UI choices unavailable
for real collection. Before an activation window, prove the private
listener, rights routes, inactivity purge, short-lived file retirement
and failure behavior with the exact delivered settings. No ordinary app
function may depend on the journal bridge being up.

For rollback before any real measurements, disable the new entry point,
withdraw the API login and return to the pinned prior web image. Do not
restore an older ordinary database over current data. After real use,
disable access first and prefer a forward repair with the private
control schema intact; never replace current consent or entry permits
with archive state. Loss of independent control is an explicit
fail-closed case, not authorization to recover the contents anyway.

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
