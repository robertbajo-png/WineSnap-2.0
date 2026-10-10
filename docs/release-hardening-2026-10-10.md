# Release repair, 2026-10-10

This repair follows the independent test report for revision `6055aa0`. It is not a declaration that every hosted, privacy or real-device release gate is green.

## Implemented

- Scheduler authentication fails closed before loading admin data when `CRON_SECRET` is missing. Manual wishlist checks use a separate JWT-authenticated, owner-filtered endpoint, at most three explicit IDs per request. Source/row/save failures are counted honestly; overlapping saves use compare-and-swap guards.
- Retail product matching no longer spends AI credits or accepts nearby vintages/fuzzy selections. A producer, cuvee, vintage and explicitly recorded bottle size must match one catalog product. No 750 ml default is invented. Wishlist saves no longer start a fire-and-forget price write.
- Wishlist quote currency and target currency are separate. New targets use SEK; existing EUR targets and stored prices are not backfilled or converted. A SEK quote cannot trigger an EUR target. Source-linked quote metadata is checked against the unchanged identity before displaying it as verified. Same-price/unseen alerts are not repeated.
- Profile statistics are owner-filtered and paginated. Bottle stock is counted, not database rows. Cellar/search/detail/overview ratings use the latest scored owner's tasting note, then a real legacy rating; absent scores are not synthesized from body/acidity. Cellar/search reads are paginated and failures are not shown as an empty collection. Detail distinguishes the owner's score on a public wine from the viewer's score.
- Label analysis receives the selected language. Its six taste dimensions have a shared validated integer 0-10 contract. Unsupported values remain unknown; they are not guessed or rescaled. Literal label identity remains separate from estimates.
- Both personal and similar-wine recommendations select identities from a small, source-linked curated catalog. Unknown IDs and model-supplied replacement names, producers, vintages or prices are discarded. Style explanations/scores remain AI estimates. The current catalog has 12 identities; it is not a complete global catalog or a live availability feed.
- Existing unvalued collector acquisitions preserve valid estimate currency/confidence defaults. The actual select component has a render-and-submit regression test alongside schema tests.
- Drinking windows use the same type-specific heuristic in detail and overview. Unknown types/future vintages are excluded. Age-only six-year labels were removed, and the estimate's limitations are visible.
- Mobile navigation reserves space for visible Lovable branding rather than hiding it or letting it cover navigation. English/Swedish missing type labels and singular bottle labels were repaired.
- PWA updates now wait for an explicit confirmed reload, so a newly installed service worker does not automatically replace an unsaved screen. Account HTML is not cached. API/external requests remain uncached, old WineSnap caches are removed, and the offline shell has Swedish text/retry. Manifest dimensions match the actual 816 x 816 icon. Version: `2026-10-10-release-hardening`.
- Profile has an authenticated, owner-filtered, paginated JSON export. It never returns a successful partial export on an error or account switch. Images, social graphs, server-only quotas, provider logs and backups are explicitly outside this application export. Privacy/contact entry points exist on login and profile. Missing real operator/contact/retention/legal-basis details are explicitly reported, not invented.

## Fresh local verification

- Vitest: 316 passing tests in 51 files.
- TypeScript and ESLint: pass. Local generated dependency backup was excluded from lint; source files were not excluded.
- Final production client/SSR/Nitro build: pass. Existing dependency directive and Nitro/Wrangler warnings remain.
- Fresh local PostgreSQL: all 31 migrations, nine transactional invariant files, owner isolation, legacy share/image identifiers, collector stock guards and concurrent allocation pass. The test cluster was stopped. This is not a hosted JWT/Storage HTTP certification.
- The local environment reused installed dependency binaries through a `node_modules` junction to `WineSnap-scan-review`. `package-lock.json` was updated to include the Drizzle dependencies added automatically by Lovable. GitHub's clean installation check must confirm the publication revision independently.

## Production schema evidence

Lovable confirmed production ref `mervdrbnwgreaifobasw`, ran the unchanged `20261005090000_verify_retail_prices.sql` once and verified five columns, both constraints and unchanged existing triggers. The platform automatically committed generated Drizzle migration artifacts/types as `764f46d`; these changes were preserved.

Important ledger deviation: Lovable recorded this in its Drizzle migration ledger (id 1, hash prefix `0857ac70`), not as version `20261005090000` in `supabase_migrations.schema_migrations`. Do not blindly replay the SQL or rewrite old history. A future native Supabase deployment needs standard migration-history reconciliation with proof that the SQL was already applied.

New additive migration `20261010100000_wishlist_bottle_size.sql` adds explicit bottle size, separate quote currency and quote metadata to the wishlist. Apply through the platform's normal migration mechanism before publishing the matching application. It changes no existing user rows, prices, target currencies, access policies or grants.

## Explicit release exclusions and external gates

- A fresh public bolaget.io request again exceeded its six-second deadline. This is one observed timeout, not proof of a permanent outage. No real price/availability success is claimed. The release must not promise a working daily price feed: manual checks retain previous amounts and report source failure. The global scheduler remains disabled until its secret and schedule are configured and tested; no secret is exposed in the browser.
- Actual operator identity, public support address, lawful basis, retention and provider processing arrangements must be confirmed by the operator. Configure `VITE_SITE_OPERATOR`, `VITE_SUPPORT_EMAIL`, `VITE_PRIVACY_RETENTION`, `VITE_PRIVACY_LEGAL_BASIS` using approved public information, then publish. These fields alone are not a legal compliance certification. No real account was deleted during verification.
- Fresh hosted owner/stranger JWT, private/shared image access, expired/revoked URLs and concurrent quota checks require the isolated `pzniyupmgwvlldvztzqh` test environment and its existing authorized credentials. Production accounts/data must not be used as destructive fixtures. Earlier dated hosted evidence does not substitute for a fresh run of this revision.
- Actual Android/iPhone camera, permission denial, installed PWA update/offline launch and Safari still need physical-device checks. Chromium layout measurements and unit tests are not those checks.
- Fresh public-app deployment, unsaved original-image analysis, mobile navigation hit targets and new privacy/export views must be verified after publishing the exact GitHub revision. New browser-use test pages could not attach while this chat was hidden; the UI-opening request was queued. A local dev server is available at `http://127.0.0.1:5198/`.
- End-to-end save/share/consumption and purchase/value mutations have not been rerun against a fresh disposable hosted UI account in this repair. Core contract, render and SQL tests were expanded; a complete Playwright authenticated suite remains a separate unverified gate, not a claimed pass.

No destructive action against the user's real cellar was performed. No password, admin key or private support address was published.
