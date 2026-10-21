# Revocable Image Access

## Current Status

Implemented behind disabled-by-default frontend/backend flags on a feature
branch. Local handler, adapter and client tests pass, as does a synthetic
PostgreSQL policy rehearsal. After explicit approval, the endpoint was deployed
and activated only in WineSnap-test and the test-only restrictive Storage policy
was installed. After repairing the hosted metadata authorization route, the final
hosted HTTP acceptance run completed with **18 passes, zero failures, and zero
cleanup failures**. Independent SQL then confirmed all seven cleanup counts zero
and the restrictive policy installed on the private bucket. This verifies the
backend image-access path only. Production and main are unchanged.
The frontend flag remains off by default; no production
frontend or independent staging frontend was published by this work.

Actual hosted checks: disabled endpoint returned 503; after activation an
anonymous nonexistent-image POST returned 404 with `no-store`. The dashboard
reported the policy transaction successful after confirming zero users, wines
and Storage objects. These initial smoke checks alone did not prove owner image
delivery or revocation. The first authenticated run had 12 passes and two direct
Storage download failures, which were retained as failures. The metadata-route
repair and subsequent 18-pass run below verified closure of that direct route.

Independent post-deployment SQL confirmed the proxy policy is installed and all
seven cleanup counts are zero (Auth users, wines, photos, Storage objects, erasure
receipts, erasure jobs and quota rows). Local screenshot:
`dist/image-proxy-hosted-test-status.jpg`. This is not a report from the blocked
authenticated HTTP acceptance test. After the first HTTP run, independent SQL
again confirmed all seven counts zero and the private bucket and restrictive
policy present: `dist/image-proxy-http-cleanup-2026-10-21.jpg`.
After the final green HTTP run, a fresh independent query again confirmed all
seven counts zero and the private bucket with a restrictive policy excluding
object-info operations: `dist/image-proxy-final-acceptance-status.jpg`.

### Hosted Metadata Route Finding

The initial safe report (`checkedAt: 2026-10-21T09:17:04.953Z`) is retained locally
as `dist/hosted-image-proxy-initial-report.json`. Its SHA-256 is
`8dc122a864803021defcb1ca1b47d6c205735a640049107d55d093f9c73f2c70`.
The two failed assertions remain failures in that report.

Dashboard API gateway logs show HTTP 200 for the two direct SDK downloads.
Matching Storage origin logs show GET `/object/info/wine-labels/...` requests,
rather than direct object-byte requests. This demonstrates that the deployed
CDN path uses object-info authorization before serving bytes; allowing direct
GET info also allowed direct downloads. The original SQL simulation used only
the object-download operation, so it did not catch this hosted routing behavior.

The corrected new-install policy denies both GET and HEAD object-info operations,
while preserving owner listing, uploads and removal. The app itself does not use
direct Storage `info()` calls. Metadata remains available through owner-scoped
listing. `supabase/operations/test-image-proxy-metadata-repair.sql` tightens only
the exact original restrictive policy in an empty private test project. It
refuses populated projects and unknown policy definitions. The synthetic database
checker verifies both a new installation and this exact legacy-policy repair.
Both local paths passed, together with all 33 migrations, 11 existing SQL
invariants, 426 Vitest assertions and targeted ESLint/syntax checks.

The guarded repair was then applied successfully only to WineSnap-test. An
independent readback confirmed the restrictive policy no longer includes
object-info operations, the bucket remains private, and all seven cleanup counts
remain zero. Screenshot: `dist/image-proxy-metadata-repair-status.jpg`.
The extended hosted acceptance run subsequently passed all 18 assertions,
including owner/shared GET and HEAD info denial, and safe direct-read diagnostics
containing only a fixed actor label, numeric status and an image-returned boolean.
No raw error message, token, object path or credential is included.

Final safe report: `dist/hosted-image-proxy-report.json`, checked at
`2026-10-21T09:38:24.856Z`, SHA-256
`253c4c3cf2ff77c37aec6a80e5f7784d87b9eb07426b0a6dd423ca49f53215dd`.
Both direct SDK download probes returned HTTP 400 and no image (private owner
and a different authenticated user while sharing was enabled). Owner and shared
GET/HEAD info were denied; owner listing, upload and removal still worked.
The owner/public proxy delivered the PNG with non-cacheable headers, denied
stranger/private access, and immediately denied the same proxy request after
unsharing or an account erasure request. Invalid JWT and unsafe-path checks passed.
The report completed normally and cleanup reported zero failures; the independent
SQL readback also found zero users, wines, photos, Storage objects, erasure
receipts, erasure jobs and quota rows.

This implements the next step after the measured
[Storage CDN revocation finding](image-revocation-diagnostics-2026-10-21.md).
It does not retroactively turn that old raw-URL test into a pass.

## Design

- `supabase/functions/wine-image/index.ts` is a POST-only image endpoint. Any
  supplied user token is verified with Auth; invalid tokens never become anonymous
  access. Public shares can omit a user token.
- The handler checks the verified account is active. An active owner can access
  their own path; everyone else needs the existing `is_public_wine_photo` RPC to
  return true. Both checks are repeated after downloading, before returning bytes.
- The server fixes the bucket to `wine-labels`, encodes validated path segments
  and fetches with a fresh nonce, `no-store`, no redirects and a bounded timeout.
  No caller-supplied URL, bucket, user identity or service credential is trusted.
- Responses contain image bytes, never a signed URL or upstream credentials.
  Browser, CDN and surrogate cache headers all prohibit storage. GET/HEAD are
  disallowed; errors are fixed messages with the same non-cacheable headers.
- Request bodies are limited to 4 KiB and image bodies to 10 MiB, including streamed
  bodies without Content-Length. Only JPEG, PNG, WebP, GIF and AVIF are served;
  SVG/HTML and empty content are rejected. Filenames generated by current uploads
  work; unusual legacy paths containing control characters, percent escapes,
  traversal or URL delimiters require review rather than being fetched unchecked.
- Client routing uses `VITE_WINE_IMAGE_PROXY_ENABLED=true`. Once enabled, a proxy
  error never falls back to the direct Storage path. Anonymous calls explicitly
  omit a user bearer token instead of treating a publishable key as a user JWT.
- Existing uploads, metadata listing and image removal remain direct owner-scoped
  Storage operations. The test-only restrictive SELECT policy permits those
  operation contexts but denies direct GET/HEAD object info, downloads, signing,
  renders, S3 reads and unknown
  contexts. It does not grant new mutations or alter unrelated buckets.

The storage operation allowlist follows the official
[operation-aware helpers](https://supabase.com/docs/guides/storage/schema/helper-functions)
and [Storage operation definitions](https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts).
Actual deployed Storage behavior was verified by the hosted test above; it must
not be inferred from mocked operation context alone in future deployments.

## Deliberate Activation

Two flags must be explicitly enabled in the intended staging environment:

```text
# Edge runtime configuration, not a client secret:
WINE_IMAGE_PROXY_ENABLED=true
# Public frontend build configuration:
VITE_WINE_IMAGE_PROXY_ENABLED=true
```

They default to disabled. Independent runtime-check builds force the client flag
off even if inherited configuration says true. Service-role keys remain exclusively
server-side and are not part of the public build environment allowlist.

The endpoint uses `verify_jwt=false` because anonymous public shares are supported;
the handler performs its own verified Auth and current permission checks. It is
not a general unauthenticated file proxy. Do not enable it without its tested code.

Test-only rollout order after explicit approval:

1. Verify the dashboard is WineSnap-test (`pzniyupmgwvlldvztzqh`), with no Auth users,
   wines or Storage objects. Never rely on the repository's default project link:
   `supabase/config.toml` still names the production project.
2. Deploy the exact `wine-image/index.ts` and `handler.ts` sources only to that
   project. Verify configuration and the initially disabled 503 response. Enable
   the backend flag and verify private anonymous access fails closed.
3. Configure a separate staging frontend with the public flag on. Verify its
   requests use the POST endpoint and no direct download fallback.
4. Apply `supabase/operations/test-image-proxy-policy.sql` manually to the empty
   test project. Its empty-project/dependency/existing-policy guards are mandatory.
   This file is deliberately not an automatically deployed migration.
   For the already-installed initial metadata-allowing policy, use only the
   exact-definition/empty-project guarded `test-image-proxy-metadata-repair.sql`.
   Do not run its synthetic legacy-policy fixture on a hosted database.
5. Run `scripts/check-hosted-image-proxy.mjs` using existing test-only keys in
   temporary environment variables, never CLI arguments or plaintext files.
   The wrapper also supports the separately approved Windows-encrypted key reuse
   described in the browser acceptance report.
   It creates two disposable accounts and synthetic PNGs, verifies owner/stranger/
   anonymous boundaries, headers, listing/upload/remove, direct GET/HEAD info and
   download denial, unsharing and erasure, then cleans only those fixtures.
   The safe report is local under
   `dist/hosted-image-proxy-report.json`.
6. Independently confirm the usual seven aggregate cleanup counts are zero.
   Retain hosted HTTP results separately from local contract results.

### Secure Local Acceptance Entry

The approved local test executor could contact WineSnap-test, but the browser
automation environment denied both named-pipe and loopback credential handoff
(`EPERM`/`EACCES`). The agent did not work around that isolation by launching an
unapproved network process, saving a credential file or putting keys in command
arguments. Both temporary listeners were stopped and key material was cleared.
No fixture account or image was created by these blocked test launches.

`scripts/run-hosted-image-proxy-check.ps1` provides a local interactive entry:
existing test keys are entered through hidden SecureString prompts, passed only
in the child process environment and removed from the launch configuration in a
finally block. Without optional key enrollment, it writes no credential file or
persistent user/machine setting.
Run it from PowerShell 7 in the user's normal local terminal, outside the blocked
automation environment. Only the safe test report should be shared afterward.

The user completed secure entry for both the initial 12-pass/2-failure run and
the final 18-pass run. Temporary process credentials were disposed by the script,
and the copied key was removed from the clipboard afterward. No key was written
to a report, credential file or repository. The final report and independent
cleanup readback complete the hosted backend verification, not browser or
production release acceptance.

The user subsequently requested avoiding repeated entry. The wrapper now supports
explicit Windows DPAPI-encrypted key enrollment and automatic local reuse; actual
test keys were enrolled with a protected ACL and no Git or browser exposure.
This later authorized encrypted cache does not change the earlier runs' transient
credential handling. Details and the partial actual-app results are in
[Hosted Image Browser Acceptance](image-browser-acceptance-2026-10-21.md).

Do not roll back only the frontend flag while leaving the direct-download policy
in place: old clients would fail to display images. Before applying the policy,
keep the existing direct-image implementation active. Once applied, keep the
staging frontend on the proxy, or obtain approval for a coordinated policy rollback.

## Verification

Locally passed: 426 Vitest assertions across 65 files, TypeScript, source-directory
ESLint, all 33 source migrations and 11 existing SQL invariant files, plus the new
isolated image-policy test. The policy rehearsal covers direct-read denial,
missing/unknown operation contexts, normalized operation names, own upload/delete,
peer deletion denial, service access, public-share permission and unrelated buckets.

The first synthetic SQL attempt mistakenly referenced the hosted-only
`public_wines` view. It was corrected to the source schema's `wines` lookup; the
source/hosted schema difference is not silently repaired by this work. Sandbox
process-isolated temp paths also interrupted a Vitest run; the full unsandboxed
local test run passed. Neither failure was hidden by dropping an assertion.

## Remaining Release Boundaries

- Hosted backend HTTP verification is green after the metadata-route repair.
  A separate staging frontend with the proxy flag on still needs browser checks;
  no such frontend was published by this work.
  Local actual-app owner image/gallery/upload checks passed after fixing binary
  image decoding. Native Chrome confirmation handling blocked the remaining
  browser checks; this is not full frontend acceptance. Results are recorded in
  [Hosted Image Browser Acceptance](image-browser-acceptance-2026-10-21.md).
- The original raw CDN cache finding remains valid for already fetched old URLs.
  Existing signed URLs may also bypass current RLS until retired. This feature
  cannot instantly revoke copies already downloaded by a recipient.
- Before production cutover, reconcile schema history, migrate clients, retire old
  signed/direct URLs and allow/verify cache propagation or safely migrate object
  paths. Do not delete or rename real images as part of this test-only rollout.
- No production deployment, main merge, new administrator, cron enablement,
  privacy-worker activation or full release acceptance is included.
