# DEV-10 local update

This is for the privately owned Windows installation only. It does not
authorize backups or installation. Keep the connector paused. Do not use
the old production app, the abandoned hosted test project, private photos,
or public ingress during this work.

## Approved maintenance window

After separate owner approval, work from the canonical local repository.
Confirm a clean reviewed release commit and record the full SHA-256 of the
current owned web image. The database must have exactly the reviewed
40-migration history. Confirm local health and the paused connector.

1. Run `./scripts/run-owned-windows.ps1 -Action Backup -WaitForBackupLock`.
   Use the basename from the successful encrypted backup report.
2. Run `./scripts/rehearse-owned-recovery.ps1 -BackupFile $backupFile`.
   This restores only into isolated temporary local containers. Continue
   only on verified success and cleanup for the same encrypted bytes.
3. Run the dedicated action below within two hours of the backup. Supply
   the reviewed full commit and exact previous Docker image ID. Do not
   substitute `Update`.

```powershell
./scripts/run-owned-windows.ps1 -Action MealPhotoUpdate `
  -VerifiedMealPhotoBackup $backupFile `
  -ExpectedMealPhotoRevision $reviewedCommit `
  -ExpectedMealPhotoPreviousImage $previousImage `
  -ConfirmMealPhotoMaintenance
```

The action compares the fresh archive digest against both reports and
checks the installation fingerprint and backed-up web image. It builds the
candidate from the reviewed Git snapshot, preserves the previous immutable
image, applies both migrations together, then replaces only the web
container. Backend containers and volumes are not replaced. Local probes
check app health, private REST grants and anonymous photo endpoint denial;
they send no photo and do not call OpenAI.

## Acceptance and recovery

- Before handing it over, verify the installed synthetic flow: analyze,
  correct, discard, confirm, open a retained photo, and remove the image
  while retaining the meal. After checking the file is gone, clean up the
  disposable test account and remaining synthetic meal via the existing
  account erasure flow. Confirm the tunnel is still paused. Label any
  skipped check.
- If the report says `schema_unchanged`, the original web remains in place
  and the database remains at 40. Review the failure before reattempting;
  verify that the exact backup and restore evidence are still fresh.
- If it says `restricted_fallback_verified`, the database remains at 42.
  The prior web runs without credentials, AI, legacy privacy operations or
  meal-photo endpoints. Existing data is retained and the command still
  reports failure. Do not rerun the migration or enable the legacy export
  path: it cannot safely handle the new bucket. Use a reviewed forward
  repair. Normal `Resume` retains the restricted configuration.
- If the outcome could not be verified, keep the tunnel paused and inspect
  only owned metadata. Do not assume recovery succeeded, start a new update
  blindly, or restore over newer data.
