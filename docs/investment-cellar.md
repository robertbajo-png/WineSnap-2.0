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

## Phase 3: verified market data

Select a licensed source after checking data access and usage rights. Match producer, cuvee, vintage, bottle size and packaging precisely. Store immutable dated quotes, currency and valuation type. Show unavailable values rather than inventing prices. Keep retail, auction and net resale figures distinct; only compare comparable valuations and cost bases with explicit FX data.

## Phase 4: portfolio reporting

Add historical charts based on actual snapshots, sales and fees, realized/unrealized results, price freshness alerts and exports. Avoid double-counting sold or consumed stock. Keep the regular cellar usable without the add-on. AI explanations must not create valuation figures.

## Verification status

Phase 1 is implemented locally; subsequent phases are not implemented. Five price-summary tests and TypeScript checks passed. Local signed-out browser checks confirmed the cellar link, overview rendering and return navigation; an existing missing parent outlet was corrected. Production publication and signed-in price panels across desktop/mobile still need verification. No database migration or production data modification is required for phase 1.
