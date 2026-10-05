# Verified retail price refresh

The cellar overview distinguishes purchase cost, verified retail references and manual collector estimates. The latter two are not interchangeable: a bolaget.io retail quote is not a resale valuation or investment return.

## Refresh and matching

- The signed-in owner starts a refresh. There is no scheduled/background price update.
- Requests contain at most three explicit wine IDs. The server verifies the JWT, loads only the owner's unconsumed stock and checks `updated_at` before writing. A concurrent edit or consumption prevents the write.
- Automatic matching requires the same producer, cuvee, stated vintage and explicit bottle volume. Only accents, punctuation, a producer prefix and the stated vintage token are normalized; no fuzzy name matching or nearby-vintage fallback is accepted. Known countries use the existing country aliases.
- Missing size/year, multiple exact products or uncertain names require review. Candidates show producer, name, vintage, volume, product ID and price. Wrong stated vintage/size/origin, unknown catalog volume and explicit multipacks/non-bottle packaging cannot be confirmed.
- Confirmation requires an owner acknowledgement and a product from the saved proposal for the unchanged wine. The server refetches that fixed-source product and checks its identity again. Prices come from the new response, never the browser. Confirming an unknown bottle size records the explicitly acknowledged catalog volume.
- A manual connection can be reused only while both wine and catalog identity remain unchanged. A changed wine identity in the edit form clears verification/proposals but preserves the stored amount. Read-time identity checks also reject stale metadata from other clients.
- An empty catalog marks the attempt as missing. Timeout, invalid format, source failure or database failure is not a successful quote. Previous prices and the last successful timestamp remain intact.

## Source limits

The fixed source remains `https://api.bolaget.io/v1`, the community mirror already used by the app, not an official Systembolaget API. The adapter handles supported array/single/product-envelope formats and explicit ml/cl/l strings; unknown formats fail closed. A lookup has one six-second budget shared by product-ID and search requests. The browser gives each three-wine request 15 seconds and aborts when the panel unmounts.

On 2026-10-05 a public catalog probe timed out. The live schema and availability were therefore **not verified** in this implementation. Adapter and workflow tests use explicit synthetic fixtures, not invented live prices. Confirm a real catalog response in the deployed environment before claiming the price feed is operational. If the mirror is unavailable, select a maintained/licensed source as a separate task; do not silently replace it with AI estimates.

## Overview

Only verified quotes checked successfully within 30 days contribute to the current retail total. Coverage counts wine records; totals still multiply by bottle stock. Older, unverified and missing prices are counted separately, with successful and attempted dates per wine. Existing amounts stay visible in the per-wine disclosure, including failed lookups.

Updates run in sequential groups of three. Pause completes the current group, then stops. Resume retains the pending queue in the mounted view; navigation/reload discards that in-memory queue, but completed prices remain in the database. A transport failure preserves the unacknowledged group for a retry. Completed groups with source errors can be retried with a new update. The client validates complete, non-duplicated per-ID results before advancing progress. The overview paginates all owned rows instead of silently limiting a cellar to 200 or 1,000 wines.

## Rollout

1. Apply `supabase/migrations/20261005090000_verify_retail_prices.sql` to the separate test project. It adds nullable volume and quote/proposal metadata plus an unverified default status. No purchase price, previous retail amount, collector lot, policy or grant is backfilled/changed.
2. Run `supabase/tests/step8_retail_prices.sql` **only in the isolated test database**. It inserts synthetic accounts/wines inside a rolled-back transaction; it is not a production smoke check. Rehearse all migrations with `node scripts/rehearse-migrations.mjs <dependency-root>` using the installed embedded PostgreSQL runtime.
3. Verify real owner/stranger JWTs against the test API and one real source response before deploying. Automated service tests check bearer identity scoping using dependency injection; local SQL tests check existing RLS but are not hosted JWT tests.
4. Deploy the non-destructive migration before publishing the matching app/server revision. Without the new columns, the overview falls back to legacy columns, preserves existing amounts and disables refresh with a deployment notice. An API request returns `503 migration_required`.
5. Regenerate `src/integrations/supabase/types.ts` from the deployed schema. Until then, `RetailWine` is the narrow local overlay for the five new columns; generated types have not been manually rewritten.
6. Verify signed-in price review, successful confirmation, failure retention, pause/resume and cache upgrade after release. The service worker is versioned `2026-10-05-verified-retail-prices`.

Rollback the app revision if needed; retain the new nullable metadata columns and existing amounts. Do not drop data or restore a database backup as a feature rollback.

## Local verification

Vitest covers exact/ambiguous identity, year/size/origin conflicts, legacy/fresh/old/error states, manual connections, owner scoping, fabricated confirmations, source parsing/errors, compare-and-swap failures, more than 200 wines and pause/resume. UI rendering tests keep legacy amounts out of the verified total and require acknowledgement. SQL rehearsal covers all 30 migrations, eight invariant files, private wine isolation and unchanged historical amounts. No production wine prices are written by these checks.

The actual panel was exercised in Chrome with synthetic data: selecting a product alone did not enable confirmation; acknowledgement and confirmation updated the visible quote; pause stopped between groups and resume completed all seven rows. The rollout notice disabled updates without hiding historical amounts. Layout measurements found zero horizontal overflow at 320, 390, 430 and 1440 CSS pixels, with 44px command targets. No UI console errors were recorded. The temporary preview route was removed before the final build. These checks do not verify a live catalog response or hosted persistence.
