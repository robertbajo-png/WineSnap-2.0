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

Record the migration versions, deployed commit, Edge Function versions,
published URL, and actual results of the authenticated checks. A passing
local build or a successful push alone does not confirm a production release.

If deployment fails, keep the previous frontend available and fix the failing
dependency before retrying. Do not restore public image access as a workaround.
