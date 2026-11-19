# WineSnap Migration Checkpoint

Date: 2026-10-23. **Migration incomplete; no production cutover.**

## Completed Remote Actions

The actual project `e7f4f18b-eaf5-4c23-b400-576438d8ede8` is accessible in the
current browser session. The alternative published badge project link resolves
back to this project. The earlier access-denied finding is superseded for the
Lovable project, but not for direct Supabase production administration.

1. Confirmed the Git connection is `robertbajo-png/WineSnap-2.0`, branch `main`.
   The clone field still uses the repository's earlier `wine-scene-snap` name.
2. Created and verified a complete local Git bundle of all available refs before
   changing sync. The bundle is ignored under `dist/`.
3. Started the built-in database export through Database settings, not through
   the AI chat. The UI confirmed export start and produced a new private bucket
   `database_export_23_10_26` containing the PostgreSQL backup.
4. Downloaded the complete database archive, including Auth users and password
   hashes, and all 16 physical files from the private `wine-labels` bucket.
5. Disconnected only this project's GitHub sync. The UI confirmed **Project
   disconnected from GitHub** and replaced the connected repository with the
   **Connect project** view. No account-wide GitHub installation was removed.

No task was sent to the Lovable AI agent. No code was generated there, no
frontend was published, no SQL was run against production, no user row or
original image was altered, and no old service was paused or deleted. The
export creates its own private backup artifact in source storage; it is not
removal of the source database.

## Verified Export And Restore

The export is a valid PostgreSQL custom-format archive. Restored the actual
`auth`, `public`, `storage`, `drizzle` and `supabase_migrations` objects/data into
a fresh local PostgreSQL 17 container using `pg_restore --exit-on-error`.

The rehearsal container had `--network none`, no published ports, a read-only
backup mount and a temporary memory-backed database directory. It was stopped
and removed after verification. No new cloud provider received the user data.

| Check                               | Restored result |
| ----------------------------------- | --------------: |
| Auth users                          |               2 |
| Auth identities                     |               2 |
| Users with existing password hashes |               2 |
| Profiles                            |               2 |
| Wines                               |              12 |
| Wine-photo records                  |              12 |
| Wishlist rows                       |               6 |
| Physical image objects              |              16 |
| Image path/size mismatches          |               0 |
| Native migration records            |              28 |
| Drizzle migration records           |               2 |

The image archive has 1,795,860 uncompressed bytes. Its 16 entries match the
exported Storage object metadata by exact basename and byte size. This export
does not include the owner directory in ZIP entry names, so the original object
paths are preserved in a separate encrypted private manifest. Do not guess a
new owner path or upload the files at the root of the destination bucket.

The original password hashes and IDs are present in the restored Auth data.
This is not a successful login on a new hosted Supabase project. Runtime JWT
keys, OAuth provider configuration, email, secrets and active browser sessions
are not made portable by this check. Users must sign in again after cutover.

The local rehearsal deliberately uses `--no-owner --no-privileges` and the
standard local roles/extensions needed by the selected schemas. It does not
certify the full managed Supabase platform, original role ownership/GRANTs,
Realtime, cron, network extensions, vault secrets, Edge Functions or new hosted
RLS behavior. Those still require destination acceptance.

The repository has 33 migration files, while the export contains 28 native
history records and two Drizzle records. Eighteen file timestamps do not have an
exact native-history match. This **does not mean eighteen missing schema
changes**: historical identifiers and the separate ledgers diverge. Inspect
actual destination schema and both histories before repair; do not replay the
whole directory or insert fabricated history rows.

## Private Backup Location

Local owner-only directory, outside the repository and OneDrive:

`C:\Users\rober\AppData\Local\WineSnapMigration\exit-20261023-724a2a2a`

Retained files:

- `winesnap-production-20261023.backup.zip.dpapi`
- `wine-labels-20261023.zip.dpapi`
- `storage-paths.private.json.dpapi`

All three files are Windows CurrentUser DPAPI protected. Each encrypted copy
was decrypted in memory and its SHA-256 compared to the original before the
temporary unencrypted ZIPs, dump and path manifest were removed. The directory
ACL permits the current Windows account and SYSTEM only. No key, token,
password hash, email, private object path or user record is committed to Git.

DPAPI entropy for this archive set is the UTF-8 string
`WineSnap migration mervdrbnwgreaifobasw 2026-10-23`.
Recovery requires the same Windows user's DPAPI access. These are protected
local copies, not an independently tested off-device disaster-recovery backup.
Do not delete the source service or lose the Windows profile on that basis.

Archive integrity, before encryption:

- Database ZIP SHA-256:
  `6f3d2d4a2aa2319d53e0ce3510577c579582b3aada334776a4ce486585c4f167`
- Images ZIP SHA-256:
  `7e5cb234b80875ebdf84d52d46b4df3fee5d3e58ea163d87e7b49dd40e0497d7`

The old app is still writable. This is a verified migration snapshot, **not a
final frozen cutover export**. Lovable permits one export per 24 hours, so a
later final snapshot must be planned after replacement acceptance. Reconcile
new writes and previously requested erasures before switching traffic.

## Actual Remaining Blockers

1. **Owned production Supabase project.** The signed-in organization explicitly
   reports that its two-free-project allowance is exhausted. The existing
   projects are WineSnap-test and the unrelated Elbilsguiden project. No project
   was paused, deleted, renamed or upgraded to obtain a slot. Creating a
   production destination requires an owner decision on capacity/account access;
   the disposable test project is not silently promoted.
2. **Owned frontend hosting.** The Docker/Node candidate is tested, but no
   connected Render or other suitable Node-hosting account is available. Render
   was suggested as a compatible hosting connection; it is not installed or
   connected, and no paid resource was ordered. No demo was published in place
   of the real WineSnap service.
3. **Owned AI credentials.** The source Secrets list contains only the managed
   `LOVABLE_API_KEY`. Its value was not read. No OpenAI/Gemini credential was
   recovered, created, transmitted or substituted. The direct-provider source
   requires owner-controlled `OPENAI_API_KEY` and `GEMINI_API_KEY` in the new
   Edge secret manager. Never send keys in chat.

Once access/capacity is available: restore the verified archives and path map
to owned staging, reconcile migration history, apply only genuinely missing
changes, deploy all Edge Functions and the Node app, set redirects/mail/cron,
verify real AI/privacy/images/phone flows, then freeze and reconcile source
writes for final cutover with rollback. Only then retire old hosting/backend
and obsolete gateway access. No automatic main merge has been performed.

## Evidence

Ignored local screenshots:

- `dist/lovable-github-disconnected-2026-10-23.jpg`
- `dist/supabase-production-project-limit-2026-10-23.jpg`

The existing candidate `54f6c6c` passes GitHub Quality and Database Safety;
522 unit tests, 34 page/viewport checks and 25 image/PWA browser scenarios are
the prior source verification, not new hosted production AI certification.

Export behavior is documented in
[Lovable's database export guide](https://docs.lovable.dev/features/database-backups).
Storage files, code, secrets and provider settings move separately; see the
[official external hosting guide](https://docs.lovable.dev/tips-tricks/external-deployment-hosting).
