# WineSnap 2.0 release

## Environment check

On 2026-09-30 Lovable reported the production project as
`mervdrbnwgreaifobasw`. It reported that migrations dated September 23-28
were not applied, the wine-labels bucket was still public, and the new AI
conversation and preference extraction functions were not deployed.
This is a deployment prerequisite, not a successful release.

## Rollout order

1. Confirm a recoverable database backup and rehearse pending migrations in the
   separate test project. Never reset the production database.
2. Inspect migration history and apply only missing migrations in this order:
   - `20260923090000_harden_ai_and_wine_images.sql`
   - `20260924090000_add_wine_memory_foundation.sql`
   - `20260925090000_add_ask_winesnap.sql`
   - `20260926090000_add_recommendation_feedback.sql`
   - `20260927090000_add_social_discovery.sql`
   - `20260928090000_add_restaurant_menu_mode.sql`
   - `20261001090000_restrict_memory_table_grants.sql`
3. Run the read-only invariant checks in `supabase/tests/step1_security.sql`
   through `step6_restaurant_menu.sql`. Test real JWT owner/non-owner access
   in the separate test environment.
4. Deploy `analyze-wine`, `extract-preference-signals`, `ask-winesnap`,
   `taste-suggestions`, `wine-suggestions`, and `restaurant-match` from the
   reviewed commit. Confirm the managed gateway key is present without
   exposing its value.
5. Verify authenticated AI calls and private/shared images before publishing
   the matching frontend to `wine-scene-snap.lovable.app`.
6. Test scan confirmation, tasting notes, Ask, recommendations, discovery,
   restaurant text/photo analysis, and wishlist saves on the published app.

## Release evidence

Local validation on 2026-10-01 passed: TypeScript, ESLint, production build,
75 Vitest tests, and a PostgreSQL rehearsal of all 26 migrations and six
invariant scripts. Owner/non-owner restaurant history, legacy share/image
preservation, and restaurant feedback-to-memory checks also passed.
The rehearsal found inherited platform grants on memory tables; migration
`20261001090000_restrict_memory_table_grants.sql` fixes those grants.
Hosted JWT, Storage HTTP, and deployment remain unverified.

### Production backup check, 2026-10-01

Direct inspection of WineSnap's Lovable Cloud Database > Backups showed a
restore point dated 2026-10-01 02:26:27 UTC and earlier daily restore points.
No restore was attempted; listing a restore point is not a restore rehearsal.
A fresh export was requested in Cloud > Overview > Advanced settings >
Export project data. The UI confirmed "Database export started" and said a
temporary download link would be emailed when ready. Export completion,
download integrity, and a restore rehearsal are still pending.

The export dialog explicitly directs users to download Storage files
separately. Do not treat the database export as a backup of bottle images.
The signed-in Supabase organization showed WineSnap-test
(`pzniyupmgwvlldvztzqh`) as paused; WineSnap production was inspected in
Lovable Cloud, not in that test project's dashboard. No production migration,
Edge Function deployment, or frontend publication was performed.

For a local PostgreSQL rehearsal, run `node scripts/rehearse-migrations.mjs`
with a dependency directory containing `embedded-postgres` and `pg` as the
optional first argument. This creates an isolated temporary database, applies
all migrations, runs all six invariant scripts, and tests owner isolation,
legacy shares/images, and restaurant feedback. It does not simulate hosted
JWT verification or Storage HTTP and does not connect to production.

Record the migration versions, deployed commit, Edge Function versions,
published URL, and actual results of the authenticated checks. A passing
local build or a successful push alone does not confirm a production release.

If deployment fails, keep the previous frontend available and fix the failing
dependency before retrying. Do not restore public image access as a workaround.
