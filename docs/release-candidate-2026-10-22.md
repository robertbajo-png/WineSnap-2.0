# WineSnap Release Candidate, 2026-10-22

## Decision

**NO-GO for production publication at this checkpoint.** The source candidate is
being verified, but production access, complete hosted AI/privacy operations and
physical-device acceptance are not established. A green local/test result is not
a production deployment. No production migration, account change, object move,
cron activation or main-branch merge has been performed in this run.

## The Five Requested Work Items

| Item                       | Current result                                                                                                                   | Remaining gate                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Production rollout      | Test image backend verified; default Cloudflare-compatible and independent Node builds succeed.                                  | Verified production schema/history, backup, old direct/signed URL retirement and coordinated backend/policy/frontend rollout. Both inspected Lovable project links deny access to the current signed-in account. |
| 2. Physical Android/iPhone | Automated Chromium camera/PWA/mobile coverage exists and is rerun below.                                                         | Real camera lenses, rotation, OS keyboard, background behavior, Safari and installed-PWA acceptance on physical phones.                                                                                          |
| 3. Complete live workflows | Synthetic accounts exercise actual Auth, cellar/gallery, public sharing and revocation against WineSnap-test.                    | Real scan-to-AI-to-save, model identifiers, recovery email delivery and native sharing. The final image/camera suites deliberately do not call AI.                                                               |
| 4. Operations/recovery     | All source migrations and SQL invariants pass in a fresh disposable database; separate erasure-ledger recovery rehearsal passes. | Actual production database plus object restore, provider retention, privacy export/deletion worker, cron HTTP outcomes and alert delivery.                                                                       |
| 5. Final quality           | Three UI defects fixed; typecheck, full lint, unit tests, production build and compressed-asset budgets pass.                    | Final post-fix UI rerun recorded below; device accessibility and loading experience remain separate from automated checks.                                                                                       |

## Fresh Access Observations

- The existing legacy Lovable URL
  `e7f4f18b-eaf5-4c23-b400-576438d8ede8` displays **You don't have access**.
- The public app's current **Edit with Lovable** link points instead to
  `lovp_2qrqnah6598xj8wppehtg2wm8y`. That page also displays
  **You don't have access**. The project link change is not evidence that the
  GitHub repository, frontend revision or database have been migrated.
- The source-configured production Supabase reference is
  `mervdrbnwgreaifobasw`. Opening its dashboard redirects to the accessible
  organization project list, which contains WineSnap-test and Elbilsguiden, not
  this production project. Do not infer production ownership from test access.
- WineSnap-test `pzniyupmgwvlldvztzqh` is accessible. Its function inventory lists
  **only wine-image**. Its source privacy schema is not proof that privacy Edge
  workers or any AI functions are deployed. No existing gateway key was obtained,
  no alternate provider was silently substituted and no production credential was
  copied into test.
- The public WineSnap browser session is a guest, not an authenticated production
  acceptance account. No password or real account was changed to get around this.
- Its `/privacy` page still renders the old missing-operator/contact/legal-basis/
  retention placeholders, including after a reload. The source already contains
  the approved Boleo AI postal information and newer policy. The live client has
  not been demonstrated to contain that source; publication/cache verification
  is a release blocker, not a reason to invent contact details or enable flags.

## Source Fixes

- Taste profile's back button now has a localized accessible name and explicit
  button type. The initial automated audit found the missing name on both widths.
- Guest profile now has an accessible sign-in action instead of inactive account
  editing controls. Language and privacy access remain available. Authenticated
  users retain their settings; three focused render tests cover the boundary.
- The wine-delete action uses readable red text on the dark background. The
  settled-page audit caught its insufficient mobile contrast before this fix.
- Service worker version is `2026-10-22-release-candidate`; unit coverage also
  checks removal of the previous revocable-image caches. Updates still require
  explicit confirmation, and private data is not added to the offline cache.
- Full lint excludes only the generated `node_modules.release-backup` dependency
  copy, not additional application source. An earlier unrestricted lint attempt
  traversed this backup and was stopped; the corrected full lint passes.
- README now describes the implemented tests, test/production separation,
  mandatory scheduler secret, deterministic price matching, gated image rollout
  and real PWA/privacy limitations instead of the obsolete behavior.

## Repeatable Quality Checks

`npm run test:bundle` reads the built public assets without contacting a service.
It fails if a JavaScript asset exceeds 200 KiB gzip, a stylesheet exceeds 40 KiB
gzip, either kind is missing, or sizes are invalid. CI checks both existing and
independent builds. These are initial size-regression limits, not Core Web Vitals
or a claim that every asset is loaded on the initial route.

Measured default largest JavaScript: 568,253 bytes raw, 174,513 bytes gzip.
The existing >500 kB raw-chunk warning remains; this work adds a measured guard,
not an artificial chunk split or a claim of improved phone latency. The existing
Nitro/Wrangler/dependency build warnings also remain.

`scripts/check-release-ui.mjs` uses the fresh loopback session created by
`scripts/run-hosted-image-proxy-check.ps1 -Browser -Pwa`. Supply Playwright and
`@axe-core/playwright` through `WINESNAP_PLAYWRIGHT_MODULE` and
`WINESNAP_AXE_MODULE` when installed outside the repo. It audits public and
authenticated routes at 390 x 844 and 1440 x 1000, checks horizontal overflow,
and verifies the actual guest sign-in state. External requests are allowlisted;
AI functions and production are blocked. Reports retain rule IDs/selectors,
not page HTML, credentials or account content.

This read-only UI audit must finish before the existing
`scripts/check-hosted-image-browser.mjs` suite changes sharing/erasure and cleans
the session. Neither script is a production test or complete screen-reader audit.
Test keys remain in the existing Windows-user-encrypted local store and are not
committed or passed to browser processes.

## Recorded Verification

- TypeScript and full ESLint: passed after the source fixes.
- Vitest: **464 passed**, including profile and asset-budget regressions.
- Default client/SSR/Nitro build and default/independent compressed-asset budgets:
  passed. The independently built app is the browser-test artifact.
- Fresh synthetic PostgreSQL: **33 migrations, 11 SQL invariant files**, plus
  read-only preflight and original/repaired image-policy checks passed.
- Privacy recovery: stale backup reproduced, separately preserved erasure ledger
  reapplied, restored owner/public shares blocked, unrelated peer preserved and
  erasure repeat completed. This uses a local database snapshot and simulated
  Storage tables, not a hosted database/object restore.
- Fresh hosted image HTTP suite: **18 passed**, zero failures/cleanup failures,
  completed `2026-10-22T19:58:33.136Z`.
- Earlier post-profile-fix built browser suite: **25 passed**, cleanup confirmed.
  The subsequent contrast fix and new worker version require the final rerun.
- Final post-fix accessibility audit: **34 of 34 page/viewport checks passed**,
  zero reported WCAG violations, overflow, blocked requests or page errors.
- Final post-fix built image/camera/PWA suite: **25 passed**, cleanup confirmed.
  Camera motion uses synthetic Chromium video, not a physical camera.

### Dependency Security Gate

A fresh `npm audit --omit=dev` reports 26 affected dependency entries: three
critical, 14 high, seven moderate and two low. Cascaded package entries are not
26 independent exploits or proof of production compromise. Critical reports
include the TanStack Start server-function XSS advisory and Seroval
deserialization advisories. Both upstream maintainers publish patched versions:
[TanStack advisory](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8),
[Seroval advisory](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-p6vx-979v-rg4c).

The remediation candidate pins React Start 1.168.60, router 1.170.41, router
plugin 1.168.42, Nitro 3.0.260903-beta and Vite 8.3.5; its lockfile resolves
start-server-core 1.169.39 and Seroval 1.7.0. Vite 7 and the earlier Vite 8.0
series were rejected during preparation because of builder compatibility or
remaining advisories, rather than accepting a forced legacy-peer installation.
The explicit Lovable-wrapper Nitro override binds its old prerelease peer range
to the selected root Nitro. Strict clean npm installation and both builders must
verify this combination; no general peer-dependency suppression is used.

The final candidate lockfile's production audit reports **zero high, critical or
moderate entries**, with one low Windows-development-server esbuild advisory in
the tsx chain. This is not proof that the published service is patched. CI now
rejects high/critical production advisories. Final installation/build/browser
verification for this dependency tree is still in progress at this checkpoint.
The original shared dependency target has not been overwritten; the checkout's
junction is being moved to an isolated clean installation. Vitest has an explicit
source/config/script test inventory, excluding generated/dependency backup trees.

## Production Rollout Order Once Access Is Verified

1. Identify the actual Lovable project, GitHub revision and production backend from
   their authenticated configuration; do not overwrite them using a stale link.
2. Capture a protected database AND actual object backup and verify isolated
   restoration. Reconcile native/Drizzle ledgers against actual grants/functions
   and verify filtered public views. Do not blindly replay already-applied SQL.
3. Deploy required privacy prerequisites/functions and the disabled image proxy.
   Verify configured model availability using an approved disposable account.
4. Verify the proxy with owner/peer/anonymous, account-erasure and public-sharing
   checks. Publish the matching frontend flag, then restrict direct Storage reads
   with an approved production operation, not the empty-test SQL scripts.
5. Retire old signed/direct URLs and verify actual CDN propagation or a rehearsed
   safe object-path migration. Already downloaded copies cannot be revoked.
6. Verify login/recovery email, scan-to-save, export, deletion worker, price jobs,
   monitoring and real phones. Enable operational UI gates only when verified.
7. Merge and publish the accepted revision through the real hosting workflow;
   confirm the live revision, cache update and rollback procedure. A Git push,
   passing CI or a frontend-only Lovable publish is not sufficient evidence.

No culinary features, new gateway/provider, subscription, legal guarantee or
production-ready certification are included in this release-hardening work.
