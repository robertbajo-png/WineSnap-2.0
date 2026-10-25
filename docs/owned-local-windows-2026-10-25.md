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
privacy/supplier gates remain independent. This task makes no new live model
call and does not revalidate provider billing or availability.

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
