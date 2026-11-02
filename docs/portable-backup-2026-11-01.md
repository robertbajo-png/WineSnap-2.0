# Portable Owned Backup

Date: 2026-11-01. Scope: the owned Windows installation only. No hosted-test or
old-production access, schema change, route change or active-database replacement.

## Format And Scope

The outer file is the standard passphrase-encrypted age format, using the
author's [TypeScript implementation](https://github.com/FiloSottile/typage), pinned
to `age-encryption` 0.3.1 in a separate tooling package/lockfile. The default scrypt
work factor 18 is explicit. Decryption permits only that supported single scrypt
recipient and a bounded header/file, before the vendor library derives the key.
File encryption, authenticated decoding and parsing remain the vendor library's
responsibility, not an application-defined encryption algorithm.

The authenticated inner object contains:

- The actual version-2 PostgreSQL/Auth/Storage archive and logical manifest.
- Gate SQLite files, hashes and table manifest.
- Gate password hash, gate encryption/session keys and the narrowly scoped tunnel
  credential, unwrapped from the source Windows account before outer encryption.
- Source archive basenames, the committed tooling revision, and approved vendor
  image repository digests. Restore verifies exact snapshot image IDs/digests.

Provider API keys and local inbox messages are NOT included. Direct AI must be
configured again on a replacement PC. Existing live provider/tunnel credentials
are never used during a rehearsal. The tool does not promise future validity of
the archived Cloudflare credential or provider availability.

The recovery phrase is entered only in masked local Windows fields. Use a long
random phrase, not the Windows/WineSnap password, and keep it outside this PC and
separate from the backup. It is not saved, put in process arguments/environment,
printed, sent to chat or bundled with the file. Without the phrase the age file
cannot be recovered. Memory-buffer clearing is best effort; this does not protect
against a compromised OS, Docker administrator or memory/page-file forensics.

## Commands

Prerequisites: Windows x64, PowerShell 7, Linux-mode Docker Desktop with the fixed
desktop-linux named-pipe endpoint, Git, the repository, Node 22.19+ (with npm for
tool dependency installation) and Python.
The wrappers currently use the same Codex-bundled Node/Python paths as the owned
runtime; those dependencies must also be present on the replacement PC. No running
WineSnap, original Windows account or original DPAPI store is required for recovery.

```powershell
npm ci --prefix scripts/portable --ignore-scripts
./scripts/run-owned-portable.ps1 -Action Preflight
./scripts/run-owned-portable.ps1 -Action SelfTest
./scripts/run-owned-portable.ps1 -Action Create
```

Preflight checks the latest privately encrypted source snapshots and their current
matching restore evidence. Create requires a clean committed checkout. The masked
dialog asks for a new phrase, confirmation and acknowledgement that it is kept
separately. After writing the real age file, a fresh child process decrypts that
file using only the phrase, then rehearses the actual database/image/gate restore.
The password-free self-test uses an ephemeral random phrase, tests the same file
and rekeying paths, and removes its encrypted files; it is NOT a usable backup.

Real age files and sanitized status are under `%USERPROFILE%\WineSnapPortable`.
Only this independent directory is created/managed by portable operations.
After a successful Create, Save As offers an additional encrypted copy to USB or
a folder explicitly chosen by the owner. Cancellation keeps the valid local file.
An unsuccessful extra copy is reported separately and does not erase the backup.
No existing destination is overwritten. A copy is hash-compared, but a local path
or even a successful copy is not proof of off-device storage/sync.

To copy the existing ciphertext later, without reentering a phrase:

```powershell
./scripts/run-owned-portable.ps1 -Action Export
```

## Replacement PC

Use the committed tooling revision recorded in the archive, or a separately tested
compatible newer revision. With the prerequisites installed, keep the age file
unchanged and run:

```powershell
./scripts/run-owned-portable.ps1 -Action Rehearse -BackupPath 'E:\winesnap-portable-YYYYMMDD-HHmmssfff.age' -PrepareImages
./scripts/run-owned-portable.ps1 -Action RecoverFiles -BackupPath 'E:\winesnap-portable-YYYYMMDD-HHmmssfff.age' -PrepareImages
```

The sample path is a placeholder for the actual file, not an accepted arbitrary
archive format. Source files must be regular, bounded age files with the generated
basename; redirected paths are refused. `-PrepareImages` explicitly permits fetching
only the allowlisted vendor digests when missing. It does not retag other images,
pull moving tags, create public services or activate the archived tunnel.

Rehearse restores into random-labelled, non-root, read-only, temporary containers.
The database/auth/storage network is internal and publishes no ports; the SQLite
helper has no network. No permanent volumes, provider keys or live-database
connection are used. The original owner's password is neither requested nor reset.
Application restore checks all logical tables, Auth hashes, permissions, share IDs,
file hashes/downloads and real-JWT owner isolation. Gate integrity/table counts
and credential structure are checked separately. Matching resources are cleaned
up, with a scoped PowerShell fallback after child-process failure/timeout.

RecoverFiles first runs that same complete rehearsal. Only then does it stage
credential stores and both source snapshots encrypted for the destination's
CURRENT Windows user. It writes under `WineSnapPortable\recovered-*`, never the
active `WineSnapOwned` directory. `RECOVERY.json` appears only for a complete set;
the directory is renamed into its final name after all encrypted files round-trip.
Both staged internet-control flags are disabled. A `recovering-*` directory without
the completion marker is incomplete and must not be used as a live installation.

This is NOT a live cutover/provisioning command. Promoting staged files and the
restored data into a new authoritative runtime remains a separately approved
operator operation: reconcile erasure receipts/newer writes, prepare the new
installation, keep old data, then explicitly handle routing and rollback. Never
copy staged files over an active stack or connect two independent writable
installations to the same hostname. Never enable archived credentials automatically.

## Verification Checkpoint

The source preflight passed against the actual latest owned app/gate snapshots.
Two complete self-tests on this PC encrypted real snapshots with an ephemeral test
phrase, reopened them without DPAPI, verified all 75 database tables and one actual
image plus 26 gate tables, and reencrypted the recovered files for the current
Windows user. Temporary files/resources were removed; no usable owner backup was
claimed from those self-tests. The cipher library's wrong-phrase, tamper/truncation,
work-factor, schema, credential-scope and image-source regressions passed.

### Owner Backup Verified On 2026-11-02

The owner completed the masked phrase flow. The real age file was written on
2026-11-01 and its Create operation finalized successfully on 2026-11-02. The saved
file was reopened using only the recovery phrase in a fresh child process. The
isolated application restore verified 75 tables and one image; gate restoration
verified 26 tables, SQLite integrity and recovered credential structure. Cleanup
completed. Neither an original Windows DPAPI store nor a live database connection,
provider key or active tunnel was used by that portable rehearsal.

The retained ciphertext was checked again on 2026-11-02: its SHA-256 matched the
successful Create receipt, the age format header was intact, and Windows file
permissions allowed only the owner and SYSTEM. No rehearsal containers or networks
remained. A credential-free recovery guide is kept beside the private archive;
archive names, checksums, private paths and operator receipts are not committed.

This is a point-in-time archive of the November 1 snapshots, not a continuously
updated copy. The newer November 2 daily DPAPI app and gate backups were separately
rehearsed successfully: 75 application tables, one downloaded image and 26 gate
tables, with cleanup and no active-installation replacement. Those newer local
backups do not update or replace the verified portable age file.

No additional exported copy is recorded. Actual second-computer hardware,
external-media/cloud-copy survival and live cutover remain unverified. The active
installation and old production were not replaced or reconfigured.

For tooling commit `6dcb1490d240ad700984ab0349e2f6f0c1007c60`, both push and pull-request
Quality and Database Safety workflows passed. Quality passed all 1,148 tests in
114 files, typecheck, lint, the portable dependency audit, synthetic Node
build/runtime, client budget and prototype build. The initial concurrent local
full-suite attempt timed out under host load; those timeouts are not passing
tests, and this checkpoint does not claim that the later local retry passed.
Passing CI or a backup rehearsal never approves public release.
