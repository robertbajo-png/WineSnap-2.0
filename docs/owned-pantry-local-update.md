# DEV-07 Local Delivery

This runbook applies only to `winesnap-owned-local`. Keep the Cloudflare
connector paused and leave the private ingress, old production and hosted
test alone. The November 24 approved installation and its acceptance evidence
are recorded in the [development plan](development-plan.md#dev-07-installed-and-verified-current).
This document does not authorize another maintenance, backup or installation.

## Read-Only Check

On the owned Windows PC, run `node scripts/check-owned-planning-update.mjs
--pantry` from a clean, reviewed checkout. The check only uses local Docker
identity, loopback health and read-only migration/catalog metadata. It does
not fetch owner rows, read credentials, tag an image or change a service.

Before delivery, require the unchanged 38-migration DEV-06 prefix, followed by
exactly `20261123140000_kitchen_pantry.sql` and
`20261123150000_week_plan_diners.sql`. A partial batch, missing planner or
inconsistent pantry/receipt/diner trigger markers are stop conditions. A
fully applied history can be inspected, but is not an update retry. Require
healthy owned runtime, the paused public connector and an available exact old
web image. The report's retention tag must resolve to that same full image ID;
a completed inspection is not evidence that the image was retained.

## Rehearse The Previous Web Image

Build the [synthetic Kitchen runtime](core-experience-2026-11-13.md) with
`--target runtime`, `VITE_PANTRY_ENABLED=true` and the documented dummy key.
Use the local tag `winesnap-planning-rehearsal:dev07-<candidate-short-sha>`
instead of an artifact output. Never tag it `winesnap-owned:local`.
Then run `node scripts/check-owned-planning-web-rollback.mjs` with that tag.
The check runs both images in a separate networkless web container and the
database in an internal disposable network. Chromium's deny proxy is tested
before connecting the browser to the fixtures.

The old web app's strict plan reader does not know the new `dinerIds` field.
Require a refusal to edit a plan that contains it, byte-preserving data and
catalog digests, and a successful edit only on a compatible legacy plan.
Even with a successful rehearsal, use the old image as an emergency fallback
only before real use of DEV-07. It cannot render all new plans or export the
new pantry records. After real DEV-07 data exists, use a forward repair that
keeps and can export those records. Do not remove them to make the old
image work.

## Remaining Delivery Gates

1. Rehearse the exact previous web image against the 40-migration schema as
   described above. Verify the exact running image still matches the retained
   rollback tag before any local maintenance. Retention alone is not proof.
2. The dedicated guarded update rechecks the exact reviewed batch under the
   owned operation lock before services change and before migrations. It
   applies both migrations and ledger entries in one transaction. It retains
   the UI/origin, enables the feature for the owned build, and requires that
   PostgREST recognizes but denies anonymous reads of the private tables
   before replacing the old web image.
   **Do not use the DEV-06 switch or a plain Update for DEV-07.**
3. In an approved window, preserve the exact previous image and create a fresh
   encrypted archive while owned writers are quiesced. Restore that exact
   archive into an isolated stack and prove database and storage integrity
   and cleanup. Pending maintenance approval cannot be replaced by an older
   backup or a synthetic fixture. Follow the archive and recovery handling in
   [the DEV-06 runbook](owned-planning-local-update.md). The guarded update
   requires the exact restored archive, no more than two hours old, and an
   ordered backup and restore pair. It does not create a backup itself.
4. Only after installation approval, use
   `./scripts/run-owned-windows.ps1 -Action Update -RequirePantryMigration -VerifiedPantryBackup <exact-filename>`.
   Verify the 38-to-40 transition, local service health and the unchanged
   public pause. Run `./scripts/run-owned-windows.ps1 -Action PantryAccept`
   against the installed loopback app in the same approved window. It requires
   the DEV-07 web label and complete ledger, and runs with two disposable
   accounts in a fresh browser. It checks the 600/400/200 g calculation,
   exclusion of an unrelated diner, persistence, unconfirmed stock, and the
   exact completed session and once-only manual deduction. Require a success
   report and cleanup of both synthetic accounts and their dependent rows.
   The owner's actual use is recorded separately from automated acceptance.

Rehearse the fixture lifecycle and exact browser journey without the installed
app by running `node scripts/check-core-experience-browser.mjs --pantry-db-smoke`
using the synthetic pantry runtime extracted to `dist/core-pantry-runtime`.
This rehearses the owner/peer account preparation, expected REST responses and
deletion against disposable Postgres/Auth/REST. It is not a test of the running
installation. Its report lives in `dist/core-pantry-database-smoke`; the
installed report lives in `dist/owned-pantry-accept`.

If the installed runner stops before cleanup, `PantryCleanup` verifies and
cleans only the two recorded, tagged test accounts. It checks the paused
tunnel and applied ledger before acting. It does not delete an unverified
account or claim the smoke passed. Private fixture manifests contain IDs and
synthetic addresses, not passwords or sessions; do not copy them into Git.

Keep database and image volumes intact for a web-only fallback. Never undo
these additive migrations, replay them blindly or restore over newer data;
any real restore requires its own approved recovery decision.
If the batch commits but the web replacement fails, verify which exact image
is still serving and the actual ledger; the guarded update is not a retry
command. Prefer a separately reviewed forward repair. Do not edit the ledger
or erase new data to try the same update again.
