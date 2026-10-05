# Collector and investment cellar

## Phase 1: truthful existing price overview

- Link the overview from the cellar.
- Separate purchase costs and retail price references from resale valuations.
- Group amounts and bottle-weighted averages by currency; do not assume an exchange rate or currency for incomplete records.
- Exclude consumed bottles and empty stock; show missing price coverage.
- Remove the retail/purchase comparison that could imply investment returns.
- Identify new retail lookups as bolaget.io rather than an official Systembolaget integration.
- Preserve existing data and API fields for compatibility.

Legacy retail prices remain unverified. The verified refresh and its deployment requirements are documented in [retail-prices.md](retail-prices.md). Even a verified retail reference must not be used as an investment valuation feed.

## Phase 2: optional collector lots

Reuse wines, authentication, scanning and confirmed identity. Model acquisition lots separately so one wine can contain drinking and investment bottles. Add purchase date, currency, bottle size, condition, provenance, storage and acquisition costs. Support manual dated resale estimates with source and confidence. Protect lot data with owner-only RLS and test in the separate Supabase environment before deploying migrations.

Implemented at `/cellar/collection`: create and edit acquisitions, filter by drinking/collection/investment purpose, and include closed lots. Each acquisition records original bottle count and the number currently allocated from existing cellar stock. Acquisition fees are apportioned across the original bottles when reporting the cost of the remaining allocation. No lots are automatically imported from legacy purchase fields, no bottles are added to the wine inventory, and no AI valuation is generated.

Manual estimates have a required source, date, currency and confidence. Estimates and costs are grouped separately by currency without FX or profit calculations. A missing estimate is not valued at zero. This phase stores the latest manually entered estimate only, not an audit history or realized sales result. A zero allocation closes the acquisition while retaining its details. Before consuming or reducing stock on a wine, reduce the relevant allocations first; the database rejects inconsistent stock changes. Deleting a wine also deletes its acquisition records through the foreign key.

### Rollout

1. Apply `20261004090000_add_collector_lots.sql` in the separate Supabase test project first, then run `step7_collector_lots.sql`.
2. Verify two real authenticated users, anonymous denial, creation/editing, concurrent allocation, and reducing allocations before consuming stock. Inspect private fields even when the parent wine is public.
3. Verify the signed-in form and price panels on mobile and desktop, including save failures and missing estimates.
4. Deploy the migration before publishing the matching application revision. Existing wine data is not backfilled or changed. The route reports an unavailable migration rather than pretending to save when the table is absent.
5. Regenerate Supabase types from the deployed schema. The client now uses the generated collector table types, not a manual overlay.

If the rollout must be reversed, revert the app revision and remove only the `collector_stock_guard` trigger from `wines`; preserve acquisition data for recovery. Do not drop the new table without a backup and explicit data-deletion approval.

## Phase 3: verified market data

Select a licensed source after checking data access and usage rights. Match producer, cuvee, vintage, bottle size and packaging precisely. Store immutable dated quotes, currency and valuation type. Show unavailable values rather than inventing prices. Keep retail, auction and net resale figures distinct; only compare comparable valuations and cost bases with explicit FX data.

## Phase 4: portfolio reporting

Add historical charts based on actual snapshots, sales and fees, realized/unrealized results, price freshness alerts and exports. Avoid double-counting sold or consumed stock. Keep the regular cellar usable without the add-on. AI explanations must not create valuation figures.

## Verification status

Phases 1 and 2 are implemented locally; phases 3 and 4 are not implemented. All 143 Vitest tests passed, including twelve price/collector tests. The isolated PostgreSQL rehearsal applied all 29 migrations and passed seven invariant scripts, owner isolation, identity/estimate validation, stock guards and concurrent allocation tests. Final TypeScript and full lint checks passed. The signed-out browser navigation and collector sign-in requirement were verified; the sign-in view had no horizontal overflow at 390px and 1440px.

On 2026-10-04, the exact collector migration and invariant checks were committed in a transaction in the separate WineSnap-test project (`pzniyupmgwvlldvztzqh`), with version `20261004090000` recorded. `scripts/check-collector-hosted.mjs` then passed 15 hosted checks using real owner/stranger JWTs and anonymous access. These cover private lots under public wines, read/write ownership, forged ownership, identity transfer, invalid estimates and costs, complete estimate saves, stock reduction/consumption guards, concurrent allocation and closing/reopening stock. Only synthetic accounts and wine data were used. This verifies actual API persistence, not the browser form or Storage policies.

Lovable's isolated browser run of revision `8f12462` against WineSnap-test verified actual UI creation (HTTP 201), editing, reload persistence, sourced estimates, purpose filters, closed acquisitions and invalid stock/estimate handling. A final fresh acquisition with 2 bottles, 100 SEK per bottle and 20 SEK fees showed 220 SEK; changing it to 1 remaining bottle and 101 SEK per bottle persisted the new value and showed 111 SEK cost and 150 SEK estimate. Mobile (390px) overflow was measured at zero; desktop (1440px) was inspected in screenshots. An earlier rehearsal measured zero overflow at both sizes. The initial pretest accidentally attempted login against production and was rejected; subsequent runs checked the test URL before login and blocked production requests. No production user data was read or written by those tests. The disposable account and its synthetic data, local credential files and Lovable test copies/servers were removed after testing.

The exact migration was then deployed to production (`mervdrbnwgreaifobasw`), with version `20261004090000` recorded once. Read-only verification confirmed owner-only RLS, anonymous/public denial, the composite ownership FK, both stock triggers and zero acquisition rows. Existing user data was not backfilled or changed. The platform automatically regenerated `collector_lots` in the Supabase types. Read-only role checks confirmed `sandbox_exec` can log in, bypasses RLS, is not a superuser and has no role memberships. Its SELECT/INSERT rights on both `wines` and the new table come from existing postgres default privileges for public tables, not this migration's explicit grants. The platform must confirm the intended purpose/scope of this privileged role; owner-only refers to application users, not database administrators/platform roles. No platform rights were changed. Older admin/pg_net warnings were not changed. A minor English copy issue remains: single-bottle totals use the plural label.

Publication was requested once for `d6ed94a4dae78f40ce4108d5924c5e13ec63df07`, after confirming project HEAD and build status. The final type cleanup uses generated types; its local compiled collector client SHA256 is identical to the E2E-tested build (`D18B062CBA4A0E52C1D753121B2B96053C22BCBE08DA281934DFC0DC99BE590E`). Codex independently observed the public `/cellar/collection` change from the old cellar view to the new collector heading and localized sign-in requirement after a regular reload, and saved `collector-public-release.png` outside the repo. This confirms the collector UI is served publicly, beyond an HTTP 200 check. The exact public asset fingerprint/publish-panel completion badge was not obtained; Lovable's deployment tool reports scheduling rather than a completed revision. No signed-in production writes were performed. Service-worker cache version remains 2026-10-03; upgrades in already-open older clients were not verified in this phase. This is completion of the manual collector feature, not a declaration that all older release/security issues are resolved.

Run the hosted script only against its pinned test project, using a temporary JSON file containing `publicKey` and `secretKey`; do not commit or disclose that file. Without a fixture-file argument the script removes its synthetic accounts automatically. An optional fixture file retains one disposable UI account; use the script's `--cleanup` mode after UI testing, then remove both temporary files.
