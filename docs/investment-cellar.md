# Collector and investment cellar

## Phase 1: truthful existing price overview

- Link the overview from the cellar.
- Separate purchase costs and retail price references from resale valuations.
- Group amounts and bottle-weighted averages by currency; do not assume an exchange rate or currency for incomplete records.
- Exclude consumed bottles and empty stock; show missing price coverage.
- Remove the retail/purchase comparison that could imply investment returns.
- Identify new retail lookups as bolaget.io rather than an official Systembolaget integration.
- Preserve existing data and API fields for compatibility.

Retail matching remains unverified. The reference lookup must not be used as an investment valuation feed.

## Phase 2: optional collector lots

Reuse wines, authentication, scanning and confirmed identity. Model acquisition lots separately so one wine can contain drinking and investment bottles. Add purchase date, currency, bottle size, condition, provenance, storage and acquisition costs. Support manual dated resale estimates with source and confidence. Protect lot data with owner-only RLS and test in the separate Supabase environment before deploying migrations.

Implemented at `/cellar/collection`: create and edit acquisitions, filter by drinking/collection/investment purpose, and include closed lots. Each acquisition records original bottle count and the number currently allocated from existing cellar stock. Acquisition fees are apportioned across the original bottles when reporting the cost of the remaining allocation. No lots are automatically imported from legacy purchase fields, no bottles are added to the wine inventory, and no AI valuation is generated.

Manual estimates have a required source, date, currency and confidence. Estimates and costs are grouped separately by currency without FX or profit calculations. A missing estimate is not valued at zero. This phase stores the latest manually entered estimate only, not an audit history or realized sales result. A zero allocation closes the acquisition while retaining its details. Before consuming or reducing stock on a wine, reduce the relevant allocations first; the database rejects inconsistent stock changes. Deleting a wine also deletes its acquisition records through the foreign key.

### Rollout

1. Apply `20261004090000_add_collector_lots.sql` in the separate Supabase test project first, then run `step7_collector_lots.sql`.
2. Verify two real authenticated users, anonymous denial, creation/editing, concurrent allocation, and reducing allocations before consuming stock. Inspect private fields even when the parent wine is public.
3. Verify the signed-in form and price panels on mobile and desktop, including save failures and missing estimates.
4. Deploy the migration before publishing the matching application revision. Existing wine data is not backfilled or changed. The route reports an unavailable migration rather than pretending to save when the table is absent.
5. Regenerate Supabase types from the deployed schema. The committed collector table contract is maintained manually until then.

If the rollout must be reversed, revert the app revision and remove only the `collector_stock_guard` trigger from `wines`; preserve acquisition data for recovery. Do not drop the new table without a backup and explicit data-deletion approval.

## Phase 3: verified market data

Select a licensed source after checking data access and usage rights. Match producer, cuvee, vintage, bottle size and packaging precisely. Store immutable dated quotes, currency and valuation type. Show unavailable values rather than inventing prices. Keep retail, auction and net resale figures distinct; only compare comparable valuations and cost bases with explicit FX data.

## Phase 4: portfolio reporting

Add historical charts based on actual snapshots, sales and fees, realized/unrealized results, price freshness alerts and exports. Avoid double-counting sold or consumed stock. Keep the regular cellar usable without the add-on. AI explanations must not create valuation figures.

## Verification status

Phases 1 and 2 are implemented locally; phases 3 and 4 are not implemented. All 143 Vitest tests passed, including twelve price/collector tests. The isolated PostgreSQL rehearsal applied all 29 migrations and passed seven invariant scripts, owner isolation, identity/estimate validation, stock guards and concurrent allocation tests. Final TypeScript and full lint checks passed. The signed-out browser navigation and collector sign-in requirement were verified; the sign-in view had no horizontal overflow at 390px and 1440px. Hosted JWT tests, signed-in forms, mobile/desktop price panels and production publication remain unverified. No production data was modified.
