# DEV-07 Local Delivery

Preparation only for `winesnap-owned-local`. Keep the Cloudflare connector
paused and leave the private ingress, old production and hosted test alone.
This document does not authorize maintenance, backup or installation.

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

## Remaining Delivery Gates

1. Rehearse the exact previous web image against the 40-migration schema with
   synthetic accounts. Prove it leaves stock, receipts and plans alone and
   can still read and edit compatible plans. A rollback image that omits
   pantry data from export is only an emergency web fallback before actual
   usage; use a forward repair with the current export once such data exists.
2. Use a dedicated guarded update path. It must recheck the exact reviewed
   batch under the owned operation lock before services change and before
   migrations. Build the feature enabled only for this owned installation,
   retain its existing UI/origin, and prove PostgREST recognizes but denies
   anonymous reads of the private tables before replacing the old web image.
   **Do not use the DEV-06 switch or a plain Update for DEV-07.**
3. In an approved window, preserve the exact previous image and create a fresh
   encrypted archive while owned writers are quiesced. Restore that exact
   archive into an isolated stack and prove database and storage integrity
   and cleanup. Pending maintenance approval cannot be replaced by an older
   backup or a synthetic fixture. Follow the archive and recovery handling in
   [the DEV-06 runbook](owned-planning-local-update.md).
4. Only after installation approval, apply the guarded update and verify the
   38-to-40 transition, local service health, the unchanged public pause and
   the complete plan-to-shopping-to-Cook Mode journey with a disposable
   local account. Cleanup is required. The owner's actual use is recorded
   separately from automated acceptance.

Keep database and image volumes intact for a web-only fallback. Never undo
these additive migrations, replay them blindly or restore over newer data;
any real restore requires its own approved recovery decision.
