# DEV-08 Owned Windows Delivery

This changes only the private Windows web app on `http://127.0.0.1:5212`.
Keep the tunnel paused; no DNS, provider calls, hosted test, old production,
account changes or public rollout are in scope. **Wait for explicit approval
before taking the maintenance backup or installing.** A synthetic browser
pass is not acceptance of the installed app.

## Installed Result

The approved November 24 window installed `1f76671b878e` and passed all
five `NutritionAccept` checks with verified fixture cleanup. The exact
pre-update encrypted archive and isolated restore matched 78 tables and one
stored image. The 40-migration ledger and non-web services were unchanged
by the update, the DEV-07 image remains retained and the tunnel stayed
paused. See the [installed development record](development-plan.md#dev-08-installed-and-verified-current).
The steps below describe that guarded delivery; do not repeat it over an
already updated app.

## Readiness evidence

The approved DEV-07 image is retained as `winesnap-owned:nutrition-rollback-60b9e422a8a4`.
`node scripts/check-owned-planning-web-rollback.mjs winesnap-planning-rehearsal:dev08-cf4de80`
passed with an isolated candidate from `cf4de80`, 40 migrations, three synthetic
logins and no external requests. It verified compatibility with newly saved
recipe revisions and existing pinned plans, stock and diners. It did not stop
or change the running installation. See the [development plan](development-plan.md)
for the feature and regression evidence.

The DEV-08 rehearsal also runs the `NutritionAccept` browser journey and
fixture lifecycle against disposable GoTrue/REST. The separate report in
`dist/owned-nutrition-accept-rehearsal/status.json` must show the synthetic
login, five successful checks and verified deletion of the account and its
dependent rows. This is preparation for, not a substitute for, step 4 below.

Confirm the candidate is a clean reviewed revision and current quality checks
pass. Recheck the running app, the exact retained DEV-07 image and paused
tunnel locally. The DEV-07 ledger and catalog must already have all 40
migrations. Leave the current app in place if any precondition fails.

## Approved maintenance window

1. From the local checkout using PowerShell 7, run
   `./scripts/run-owned-windows.ps1 -Action Backup -WaitForBackupLock` and
   note the exact encrypted archive basename from its successful bounded
   report. This is the existing quiesced backup, so the local app may be
   briefly unavailable. Do not open, move or upload the encrypted file.
2. Run `./scripts/rehearse-owned-recovery.ps1 -BackupFile <exact-basename>`.
   Require successful isolated restore and cleanup of that same archive. An
   older backup or a synthetic backup is not a substitute. The backup and
   restore reports must be ordered, and the backup within two hours.
3. Run `./scripts/run-owned-windows.ps1 -Action NutritionUpdate -VerifiedNutritionBackup <exact-basename>`.
   Do not use plain `Update`. The operation lock protects the update, which
   revalidates backup, exact previous image and paused tunnel before replacing
   just the web container. It must report `nutritionWebUpdated`,
   `nutritionServicesUnchanged`, `publicTunnelPausedVerified` and a complete
   40-migration ledger with nothing pending. Confirm local app, Auth, REST and
   Storage health. The validated successful image gets the local runtime tag.
4. Run `./scripts/run-owned-windows.ps1 -Action NutritionAccept`. It requires
   the installed DEV-08 label, the complete ledger and paused tunnel. A fresh
   browser with one temporary account must pass all five recipe checks and
   verify that the account and dependent recipe/plan rows were removed.
   The private reports contain no raw tokens, passwords or owner content.
   Review only the bounded report and synthetic screenshots in
   `dist/owned-nutrition-accept`. Owner use and physical device checks are
   separate from this browser acceptance.

If acceptance was interrupted and the account could not be removed, use
`./scripts/run-owned-windows.ps1 -Action NutritionCleanup` in the same approved
scope. It revalidates the private fixture manifest and immutable synthetic
account marker. Do not delete accounts by name, and do not count cleanup as a
successful acceptance. Never publish the private manifest.

## Failure boundaries

On candidate startup, verification or promotion failure the guarded update
attempts to put back the exact DEV-07 web image. It verifies old-image health
and reports `nutritionRollbackVerified`; an unsuccessful update never counts
as installed. If recovery failed or the process was interrupted, stop and
inspect the owned container and retained image before another action. A web
rollback must never rewrite the migration ledger, revert or replay a migration,
or restore a database over newer data. A real database restore and any public
changes require separate approval.
