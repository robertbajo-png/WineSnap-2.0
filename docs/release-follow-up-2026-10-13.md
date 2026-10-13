# Release follow-up, 2026-10-13

## Completed in source

The PWA update offer now uses the existing Radix alert-dialog components instead of a native `window.confirm`. Opening or cancelling the dialog does not activate the waiting worker or reload the page. Only the explicit confirmation sends `SKIP_WAITING`; duplicate confirmations are guarded, and activation failures remove the reload listener and allow retry. The unsaved-change warning remains in both languages. Service-worker version: `2026-10-13-update-dialog`.

Focused component tests mock React hooks and the worker interface; they are not a real-browser focus, installation or visual certification. The third-party dialog primitives are reused without modification.

The operator subsequently approved publishing Boleo AI and the postal contact Morkullevägen 23, 30570, Haverdal. These are now source defaults for the privacy page; `VITE_SITE_OPERATOR` and `VITE_SITE_ADDRESS` can override them. A different operator does not inherit Boleo AI's address. A postal contact is not used as an email, and no support email, retention or legal basis was invented. Completeness still requires a contact method, retention and legal basis; it is not a legal compliance certification.

## Fresh verification

- Vitest: 337 passing tests in 54 files, including five update-dialog tests and six operator/contact configuration tests.
- TypeScript: pass.
- Targeted and full ESLint: pass (only the local generated dependency backup is excluded).
- Production client, SSR and Nitro build: pass, 2,530 client modules transformed. Existing dependency directive and Nitro/Wrangler warnings remain.
- The rebuilt local Cloudflare runtime returned HTTP 200 for `/privacy`; its rendered HTML contains Boleo AI, the approved postal address in an `address` element and the incomplete-information alert, without a fabricated `mailto` link. This is an HTTP/SSR check, not a browser layout or production publication test.
- A public HTTP read of `/sw.js` still returned `2026-10-10-scan-errors`. The new dialog is NOT confirmed deployed.
- GitHub main was `9e67d9dce249bd5d309404c8ed0182efa50afa65` before this source patch. No new production migration or publication was performed during this follow-up.

## Explicit Remaining Gates

1. The caller-only role helper migration `20261010210000_restrict_role_lookup.sql` is prepared and previously passed the local PostgreSQL rehearsal (32 migrations, ten invariant files on October 10). The user explicitly approved its production deployment on October 13: caller-only authenticated role checks, anonymous/other-user lookups denied, no user or role rows changed. An authenticated deployment connection is still missing; the migration has NOT run in production during this follow-up. No new hosted role-read or successful data-export test is claimed.
2. Windows Computer Use did not respond after the documented retry/reset sequence. A later browser inventory detected the existing Chrome/Lovable tab, but reading it timed out and the retry returned `Debugger unattached`. There is still no working page-control connection for this follow-up. Original-image recognition, authenticated export and final mobile/desktop UI checks remain unverified; no fabricated screenshot or recognition result is supplied.
3. Supabase was discovered as available but not installed/connected, and was suggested as a direct deployment path. Lovable is installed, but no callable Lovable integration was exposed in this session. The suggestion is not a confirmed connection. The local environment has only project URL/publishable configuration, not a management token, database connection or hosted-test service key.
4. The operator and postal contact are approved and added in source, not confirmed published. Retention, lawful basis and processing arrangements still require operator confirmation. No public support email was provided; postal contact is displayed instead.
5. Fresh isolated hosted JWT/storage/share/quota and write-workflow checks, real-device camera/PWA/offline checks and the external price-feed verification remain the gates recorded in the [October 10 report](release-hardening-2026-10-10.md). Earlier checks are dated evidence, not new results.

The earlier native update dialog, if still open in an existing tab, is not remotely cleared by changing source; the user must close or confirm it. The new controlled dialog prevents that native prompt in future versions only after deployment and normal reload.

No passwords, administrator keys, actual role assignments, real cellar rows, policies or production permissions were changed. GitHub source changes do not imply that the database migration ran or that Lovable published the new build.
