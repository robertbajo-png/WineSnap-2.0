# DEV-06 Local Update Runbook

Preparation only. This is a runbook for the existing `winesnap-owned-local`
installation, not approval to install. The connector and its recovery stay
paused. No hosted test, old production, supplier, mail or DNS change is involved.

## Before Any Update

1. Select a clean, reviewed development revision and verify Quality and Database
   Safety for it. Run `node scripts/check-owned-planning-update.mjs` on the
   owned Windows PC with Node 22. It uses only the local Docker Desktop Linux
   engine, checks the exact owned services and their shared installation
   identity, compares installed migration names/checksums and read-only schema
   markers, and checks loopback health. On the prior schema expect exactly
   `20261118200000_kitchen_week_plans.sql` pending. Unknown or changed history,
   an out-of-order ledger, unexpected SQL, or unrecorded objects are stop
   conditions. Exit zero only means the inspection ran, never authorization.
2. Record the exact running web image and retain it under the tag reported by
   the check before any build can move `winesnap-owned:local`. Verify the tag
   resolves to the same full Docker image ID as the running web container;
   do not overwrite a tag that points elsewhere. Record the pilot UI and
   origin settings privately; preserve both. Rehearse exact old-image web
   replacement in an isolated stack with the updated schema. A retained image
   alone is not a tested rollback command. Neither `RestartApp` nor starting
   from an older source tree is a rollback.
3. Save/close the local viewer normally when the owner is ready. Confirm that
   its window and job are released and no other owned operation is active.
   Run `./scripts/run-owned-windows.ps1 -Action Backup -WaitForBackupLock` in
   the approved maintenance window. The switch waits up to two minutes for
   the existing operation lock; no backup starts on a timeout, and the command
   never retries an actual backup. Scheduled Backup calls do not use this switch.
   Backup briefly pauses owned writers and returns the
   exact DPAPI archive filename. Require an encrypted roundtrip, Auth hashes,
   Storage bytes and successful resume. Run
   `./scripts/rehearse-owned-recovery.ps1 -BackupFile <exact-filename>` and
   require an isolated restore of that same archive with matched rows,
   catalog and image bytes, and verified cleanup. Do not rely on a previous
   rotation, the disposable DEV-06 fixture, or cross-device recovery.
4. Confirm the local delivery decision and recheck health, paused public tunnel,
   candidate, rollback and archive evidence immediately before Update. A private
   ingress enabled for loopback does not mean the public connector is running.
   Leave both controls unchanged. An
   advisory report from the read-only check is not a fresh backup rehearsal
   or human acceptance. DEV-05's deferred owner bottle test stays deferred.

## Repeat the Isolated Web Rehearsal

Use the [synthetic Kitchen build flags](core-experience-2026-11-13.md) with
the `runtime` Docker target and a distinct local tag
`winesnap-planning-rehearsal:dev06-<candidate-short-sha>` instead of the artifact
output. Do not tag it `winesnap-owned:local` or use real build keys. Run
`node scripts/check-owned-planning-web-rollback.mjs <candidate-tag>` before
changing the installed web image. It uses read-only metadata to select the
exact currently installed image, then creates and replaces only a separate
networkless web container. The new database and accounts are disposable.
The browser must pass an independent deny-proxy check before using the old
web build's expected localhost address. All test content comes from the
disposable services; no request is sent to the installed app or its API.
Recheck the current installed image against this evidence at delivery time.

## Install And Verify Only After Approval

Use `./scripts/run-owned-windows.ps1 -Action Update -RequirePlanningMigration`
from the reviewed candidate. The switch does not imply owner approval. Under
the operation lock it checks the existing running owned services, the exact
rollback image tag and the 37-migration history before any service or schema
changes. It snapshots the migration sources and rechecks the history immediately
before applying the one pending migration; an already applied plan is a stop
condition, not a retry. Origin/UI overrides and provisioning are not allowed.
Keep the backup protected. The installer records the migration in a transaction
**before** rebuilding/replacing the web service. Require the reported
`appliedPlanningMigration` name, independently confirm the 37-to-38 ledger
transition, and verify app/Auth/REST/Storage and unchanged loopback exposure.
No manual execution or editing of the migration ledger.

After applying new migrations, the installer refreshes the owned PostgREST
schema cache. With DEV-06 in the batch it also checks that the REST table is
recognized but anonymous reads receive the expected database permission denial
before changing the web container. If a migrated table returns `PGRST205`,
compare the ledger and refresh the local cache; never replay the migration to
repair a stale REST schema.

Before handing the app back, run
`./scripts/run-owned-windows.ps1 -Action PlanningAccept` in the approved
window. It checks the exact applied ledger before creating a tagged disposable
account, uses only the owned loopback app and API, and verifies the real save,
reload, shopping check and quantities, and exact recipe version and servings
in Cook Mode. Require successful cleanup of accounts and dependent rows.
Retain the separate synthetic reports for conflict recovery and rollback;
the installed smoke does not repeat every disposable check. The owner's actual
local use remains separate. Opening the view is not proof of actual use.
The exact shared browser journey can be rehearsed without the installation
using `node scripts/check-core-experience-browser.mjs --planning-db-smoke`
with the isolated planning runtime artifact. Its report is distinct from
`dist/owned-planning-accept`.

## Recovery Decision

- **Build fails before web replacement:** check the old exact image is still
  serving and the old routes work. The additive schema may already be
  committed; record the actual ledger. Preserve database and image volumes.
  Do not rerun blindly or delete the new table to make counts match.
- **New web service fails:** use the independently rehearsed web-only
  replacement with the verified rollback image. Keep the additive schema,
  volumes and rules; use the existing private injection mechanism for
  runtime settings. Verify the exact image, app/Auth/REST/Storage health,
  owner access and unchanged exposure. The old runtime has no planner and
  does not export week plans. Do not return the owner to it after real plans
  exist unless the replacement retains the new privacy export; prefer a
  forward repair that preserves those rows and their export.
- **Database/Storage integrity fails or suspected data loss:** keep writes
  stopped in the approved window and preserve all newer evidence. Recheck
  the archive and delta since backup in isolation. The rehearsal script
  cannot restore the live installation. Any actual data restore is a
  separate explicitly approved recovery; overwriting with the pre-update
  archive can discard newer changes. No automatic down migration, in-place
  restore, volume recreation or switch to old production.

When recording results, distinguish metadata inspected, image retained,
rollback rehearsed, exact real archive verified, installed change and owner
acceptance. Do not store archive contents, credentials or owner data in Git.
