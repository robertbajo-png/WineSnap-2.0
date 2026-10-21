# Hosted Security Verification

Observed on 2026-10-21 in **WineSnap-test**, project
`pzniyupmgwvlldvztzqh`. Production was not accessed or changed by this work.
This report supersedes the pending role/privacy checks in
[the earlier preflight](hosted-staging-preflight-2026-10-21.md), not its historical
observations. This is not full product or release acceptance.

## Approved Changes

The live project was empty before changes: no Auth users, wines or Storage
objects. Native Supabase history contained 31 versions. The exact version list
and required schema dependencies were inspected before applying anything.

Only the following approved source migrations were applied, in one transaction:

| Version          | Migration              |
| ---------------- | ---------------------- |
| `20261010210000` | `restrict_role_lookup` |
| `20261013180000` | `privacy_controls`     |

Their exact source statements were recorded in the native migration ledger in
the same transaction. There are now 33 hosted ledger entries, but **this does not
mean the hosted schema matches the 33 repository migrations**. Existing history
differs, including absent retail verification (`20261005090000`) and wishlist
bottle-size (`20261010100000`) versions. No other missing migration was replayed,
no old history repaired and no cron or deletion worker enabled.

The unmodified role SQL test initially failed because the hosted project lacked
the baseline administrator read policy. After separate explicit approval,
`supabase/operations/test-role-read-policy.sql` restored only:

```sql
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

No administrator was created, no user role assigned and no administrator write
or management policy added. The operator script refuses populated projects or
an existing policy; project identity must also be verified outside SQL. It is
not part of automatic migrations or production deployment.

## Actual Results

- Unmodified `step10_role_lookup.sql`: passed after the approved read-policy repair.
- Unmodified `step11_privacy.sql`: passed.
- SQL fixtures were rolled back after each run.
- Actual Auth password sign-in, signed user JWTs, anonymous HTTP requests and
  service-only RPCs: **32 passed, 1 failed**, with zero cleanup failures.
- Exactly 20 of 32 concurrent quota requests were allowed; 12 were denied.
- Private images were readable only by their owner, intentionally shared images
  were readable anonymously, and a fresh request was denied after unsharing.
- Single and batch client image signing were denied.
- A synthetic legacy share ID containing `+` and `/` resolved correctly.
- Follow visibility, private memory access and own/peer role boundaries passed.
- Erasure request hid the public share; the old JWT could not read or recreate
  wines or freshly fetch the image. Another user's JWT remained active.

### Remaining Cache Finding

The failing assertion is **"stale owner JWT cannot download the image after
erasure request"**, for the exact previously fetched image URL without a nonce.
That URL returned image content despite the request using `cache: "no-store"`.
A unique `cacheNonce` on the same path correctly produced an access denial.

The first two runs uploaded the fixture using Storage's default cache setting.
The last run explicitly matched the app's `cacheControl: "0"` upload setting,
but still reproduced the same failure. It must not be dismissed as merely a
fixture mismatch. Cache is the working explanation; response headers and the
responsible caching layer have not yet been captured, so its location and
duration are not established.

The existing `src/lib/wineImageUrls.ts` already uses a random nonce and
`cache: "no-store"`; both upload paths also already specify `cacheControl: "0"`.
No app-side workaround was newly implemented or deployed here. The test retains
both raw-route and fresh-fetch assertions and exits nonzero for this finding.

Before claiming immediate image revocation for all URLs, investigate the raw
HTTP response/cache headers and retest previously fetched URLs after physical
Storage deletion. If immediate revocation cannot be guaranteed through Storage,
evaluate an authenticated non-cacheable image proxy separately. No proxy or
additional production permission change is authorized by this test work.

## Cleanup And Credential Handling

Four disposable synthetic accounts and one 1x1 synthetic PNG were created per
API run. No real user's image, wine, password or account was used. Existing test
API keys were read through the signed-in dashboard and used only in transient
child-process environment variables against the same pinned test origin.
No keys were created, rotated, saved to files or committed. Clipboard contents
were cleared and the key settings tab closed.

After all three runs, an independent dashboard SQL query returned zero for every
one of: Auth users, wines, wine photos, Storage objects, erasure receipts,
erasure jobs and quota rows. Cleanup code attempts all remaining fixture cleanup
even if an earlier operation fails, and reports cleanup failures separately.

Local ignored evidence: `dist/hosted-security-report.json`,
`dist/hosted-cleanup-2026-10-21.jpg`,
`dist/hosted-role-sql-pass-2026-10-21.jpg`,
`dist/hosted-privacy-sql-pass-2026-10-21.jpg`, and
`dist/test-migrations-applied-2026-10-21.jpg`. These contain no API credentials
and are not public source artifacts.

## Local Verification And Remaining Scope

TypeScript, ESLint over application/source directories, all 390 Vitest tests,
and all 33 migrations plus 11 invariant files in isolated PostgreSQL 18.4 passed.
The broad local lint traversal was interrupted because a pre-existing
`node_modules.release-backup` dependency directory was being traversed; the
source-directory lint passed. No dependency installation or backup deletion was
performed. Clean-install CI remains a separate check.

Not covered: independent staging browser workflows, Edge Function deployment or
worker execution, real AI responses, camera/PWA acceptance, production migration,
cron scheduling or production cutover. The cache finding and migration-history
differences remain open; this report does not label the overall release green.
