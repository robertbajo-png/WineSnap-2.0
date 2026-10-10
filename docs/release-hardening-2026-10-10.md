# Release repair, 2026-10-10

This repair follows the independent test report for revision `6055aa0`. It is not a declaration that every hosted, privacy or real-device release gate is green.

## Implemented

- Scheduler authentication fails closed before loading admin data when `CRON_SECRET` is missing. Manual wishlist checks use a separate JWT-authenticated, owner-filtered endpoint, at most three explicit IDs per request. Source/row/save failures are counted honestly; overlapping saves use compare-and-swap guards.
- Retail product matching no longer spends AI credits or accepts nearby vintages/fuzzy selections. A producer, cuvee, vintage and explicitly recorded bottle size must match one catalog product. No 750 ml default is invented. Wishlist saves no longer start a fire-and-forget price write.
- Wishlist quote currency and target currency are separate. New targets use SEK; existing EUR targets and stored prices are not backfilled or converted. A SEK quote cannot trigger an EUR target. Source-linked quote metadata is checked against the unchanged identity before displaying it as verified. Same-price/unseen alerts are not repeated.
- Profile statistics are owner-filtered and paginated. Bottle stock is counted, not database rows. Cellar/search/detail/overview ratings use the latest scored owner's tasting note, then a real legacy rating; absent scores are not synthesized from body/acidity. Cellar/search reads are paginated and failures are not shown as an empty collection. Detail distinguishes the owner's score on a public wine from the viewer's score.
- Label analysis receives the selected language. Its six taste dimensions have a shared validated integer 0-10 contract. Unsupported values remain unknown; they are not guessed or rescaled. Literal label identity remains separate from estimates.
- A failed scan now keeps an accessible, localized error visible until the next attempt. HTTP failures are classified without logging response bodies, credentials, images or prompts; platform authentication, quota, configuration and gateway statuses can be distinguished safely.
- Both personal and similar-wine recommendations select identities from a small, source-linked curated catalog. Unknown IDs and model-supplied replacement names, producers, vintages or prices are discarded. Style explanations/scores remain AI estimates. The current catalog has 12 identities; it is not a complete global catalog or a live availability feed.
- Existing unvalued collector acquisitions preserve valid estimate currency/confidence defaults. The actual select component has a render-and-submit regression test alongside schema tests.
- Drinking windows use the same type-specific heuristic in detail and overview. Unknown types/future vintages are excluded. Age-only six-year labels were removed, and the estimate's limitations are visible.
- Mobile navigation reserves space for visible Lovable branding rather than hiding it or letting it cover navigation. English/Swedish missing type labels and singular bottle labels were repaired.
- PWA updates now wait for an explicit confirmed reload, so a newly installed service worker does not automatically replace an unsaved screen. Account HTML is not cached. API/external requests remain uncached, old WineSnap caches are removed, and the offline shell has Swedish text/retry. Manifest dimensions match the actual 816 x 816 icon. The subsequent persistent-scan-error patch bumps the version to `2026-10-10-scan-errors`.
- Profile has an authenticated, owner-filtered, paginated JSON export. It never returns a successful partial export on an error or account switch. Images, social graphs, server-only quotas, provider logs and backups are explicitly outside this application export. Privacy/contact entry points exist on login and profile. Missing real operator/contact/retention/legal-basis details are explicitly reported, not invented.

## Fresh local verification

- Vitest: 326 passing tests in 52 files after the persistent scan-error patch (the preceding published build had 316 tests in 51 files).
- TypeScript and ESLint: pass. Local generated dependency backup was excluded from lint; source files were not excluded.
- Final production client/SSR/Nitro build: pass. Existing dependency directive and Nitro/Wrangler warnings remain.
- Fresh local PostgreSQL: all 31 migrations, nine transactional invariant files, owner isolation, legacy share/image identifiers, collector stock guards and concurrent allocation pass. The test cluster was stopped. This is not a hosted JWT/Storage HTTP certification.
- The local environment reused installed dependency binaries through a `node_modules` junction to `WineSnap-scan-review`. GitHub initially rejected the lockfile because three optional/transitive dependencies were absent. The lockfile was repaired using npm 10.9.9 without changing the manifest; scratch-only self-links were removed. The independent GitHub Quality run [38069500621](https://github.com/robertbajo-png/WineSnap-2.0/actions/runs/38069500621) passed clean npm installation, typecheck, lint, all 316 tests and production build for `b6ce92b5c4f37a8d28aaa7b1a6febc2468d243d8`.

## Production schema evidence

Lovable confirmed production ref `mervdrbnwgreaifobasw`, ran the unchanged `20261005090000_verify_retail_prices.sql` once and verified five columns, both constraints and unchanged existing triggers. The platform automatically committed generated Drizzle migration artifacts/types as `764f46d`; these changes were preserved.

Important ledger deviation: Lovable recorded this in its Drizzle migration ledger (id 1, hash prefix `0857ac70`), not as version `20261005090000` in `supabase_migrations.schema_migrations`. Do not blindly replay the SQL or rewrite old history. A future native Supabase deployment needs standard migration-history reconciliation with proof that the SQL was already applied.

Additive migration `20261010100000_wishlist_bottle_size.sql` was also applied unchanged to production through the normal platform tool. Lovable verified the three nullable wishlist columns and both constraints. No existing row was backfilled. The platform ledger recorded entry 2 with fingerprint prefix `32701885`; the native Supabase ledger still lacks this version. Generated migration artifacts/types in `5f16a68` and `6ad005f` were preserved. Reconcile both already-applied versions with the standard repair tool before future native CLI deployment; that tool is unavailable in the current connected platform. Do not replay the migration SQL.

## Hosted publication evidence

Lovable published `b6ce92b` through its normal workflow. The public service worker changed from `2026-10-03` to `2026-10-10-release-hardening`. It deployed `analyze-wine`, `taste-suggestions` and `wine-suggestions` with shared helpers byte-identical to `5914fff` (later revisions changed only migration artifacts and the npm lock).

The four production price routes were checked once without authentication after the new build was confirmed: scheduler returned JSON 503 `Scheduler not configured`; manual wishlist refresh, deterministic product matching and cellar refresh returned JSON 401 `Unauthorized`. No global price job ran.

Chromium at 390 x 844 showed no horizontal page overflow and all five navigation centers hit their own links. Local privacy/profile views loaded; the published authenticated profile now shows the actual bottle stock. These are not physical-device or hosted stranger-access checks.

## Explicit release exclusions and external gates

- A fresh public bolaget.io request again exceeded its six-second deadline. This is one observed timeout, not proof of a permanent outage. No real price/availability success is claimed. The release must not promise a working daily price feed: manual checks retain previous amounts and report source failure. The global scheduler remains disabled until its secret and schedule are configured and tested; no secret is exposed in the browser.
- Actual operator identity, public support address, lawful basis, retention and provider processing arrangements must be confirmed by the operator. Configure `VITE_SITE_OPERATOR`, `VITE_SUPPORT_EMAIL`, `VITE_PRIVACY_RETENTION`, `VITE_PRIVACY_LEGAL_BASIS` using approved public information, then publish. These fields alone are not a legal compliance certification. No real account was deleted during verification.
- Fresh hosted owner/stranger JWT, private/shared image access, expired/revoked URLs and concurrent quota checks require the isolated `pzniyupmgwvlldvztzqh` test environment and its existing authorized credentials. Production accounts/data must not be used as destructive fixtures. Earlier dated hosted evidence does not substitute for a fresh run of this revision.
- Actual Android/iPhone camera, permission denial, installed PWA update/offline launch and Safari still need physical-device checks. Chromium layout measurements and unit tests are not those checks.
- The public app and price endpoints were verified as described above. An approved, unsaved original-image test before the frontend reload returned a non-2xx function response and no wine result; it is not a passing recognition test. Lovable's later log query used a different time window and did not establish that request's exact cause. Fresh logged-in recognition with safe status classification remains required. An application-export download was attempted, but the browser download event timed out; no successful downloaded file is claimed. The local dev server is available at `http://127.0.0.1:5198/`.
- End-to-end save/share/consumption and purchase/value mutations have not been rerun against a fresh disposable hosted UI account in this repair. Core contract, render and SQL tests were expanded; a complete Playwright authenticated suite remains a separate unverified gate, not a claimed pass.

No destructive action against the user's real cellar was performed. No password, admin key or private support address was published.
