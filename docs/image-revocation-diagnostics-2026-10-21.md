# Image Revocation Diagnostics

## Scope

Continuation of the [hosted security verification](hosted-security-verification-2026-10-21.md)
on 2026-10-21, only in `WineSnap-test` (`pzniyupmgwvlldvztzqh`). Two additional
runs used four new synthetic accounts and one 1x1 PNG each. No production data,
schema, permissions, worker flags, cron or Edge deployment was changed.

The existing test was extended, not weakened: the immediate raw-URL revocation
assertion still fails and the process still exits nonzero. Both runs completed
with **36 passed, 1 failed, 0 cleanup failures**. The added checks cover the old
anonymous share URL, actual Storage removal and previously fetched URLs after
removal. This is not a full release pass.

## Measured Result

Both fixtures used the app's upload setting `cacheControl: "0"`. In the final run:

| Request                                                | HTTP status | CDN header | Result                                      |
| ------------------------------------------------------ | ----------- | ---------- | ------------------------------------------- |
| Owner's first private image download                   | 200         | `MISS`     | Origin allowed the owner                    |
| Stranger's private image download                      | 400         | `BYPASS`   | Access denied                               |
| Owner's old URL after erasure request                  | 200         | `HIT`      | Previously authorized response still served |
| Owner's new nonce after erasure request                | 400         | `BYPASS`   | Access denied                               |
| Anonymous old share URL after erasure request          | 400         | `BYPASS`   | Access denied in this run                   |
| New nonce after physical deletion                      | 400         | `BYPASS`   | Access denied                               |
| Owner's old URL 43.335 seconds after physical deletion | 200         | `HIT`      | Cached response still present               |
| Owner's old URL 53.974 seconds after physical deletion | 400         | `BYPASS`   | First observed denial for that URL          |

The paired owner/anonymous check finished at 54.229 seconds after Storage removal
returned. Polling sampled roughly every ten seconds, so this does **not** identify
the precise invalidation time. It also does not establish a global latency SLA
or prove every region behaves identically. The 65-second test window is an
observation limit, not a contractual guarantee.

Successful cached responses included `cache-control: private, max-age=0` and
`vary: Authorization, apikey`; failed reads returned JSON. Requests explicitly
using `cache: "no-store"` still received CDN `HIT` responses. This confirms a CDN
cache hit rather than a browser-only blob cache or a missing origin RLS policy.
It does not establish cross-user cache leakage: the stranger was denied, and
no test used another user's token to read an owner's private image.

Supabase describes per-user private-bucket caching and `cf-cache-status` in its
[CDN fundamentals](https://supabase.com/docs/guides/storage/cdn/fundamentals).
Its [Smart CDN guide](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
describes nonce-based cache bypass and invalidation propagation after deletion.
Smart CDN is documented for Pro and above; this test project is Free, so that
guide's propagation description is not a verified plan-specific guarantee here.

## Application Contract

The existing app already does the following:

- `src/lib/wineImageUrls.ts` requests a new random `cacheNonce` and `no-store` for
  each image download. A regression test now explicitly asserts different nonces
  when requesting the same storage path twice.
- Both scan saves and photo-gallery uploads set `cacheControl: "0"`.
- `WineImage` releases local blob URLs on auth changes, unmount and reload.
- The erasure worker removes Storage files before deleting Auth; it does not
  perform or await a globally verified CDN purge.

The hosted test physically removed only its own PNG using Storage API, verified
metadata disappeared, then retried the exact old URLs. This was **not** a deployed
`privacy-controls` endpoint or cron/worker acceptance test.

No new proxy, new image-serving authorization path or permanent permission
change was introduced. No image can be recalled from a copy a recipient already
downloaded. Immediate revocation of every raw Storage URL remains an unmet
assertion; new app requests are denied, and physical deletion was followed by
denial of the previously fetched URLs within this observation window.

## Evidence And Remaining Work

The safe local report `dist/hosted-security-report.json` now records fixed check
names, HTTP status, nonce presence, elapsed time after removal and an allowlist
of response cache headers. It excludes URLs, object paths, user IDs, request
headers, tokens, API keys and response bodies. Keys were used only in memory for
test-only child processes, then cleared; no credentials were saved or rotated.

Cleanup attempted all fixture removals and reported no failures. After both runs,
an independent dashboard count query confirmed zero Auth users, wines, photos,
Storage objects, erasure receipts, erasure jobs and quota rows. Screenshot:
`dist/image-cache-cleanup-2026-10-21.jpg` (local, ignored).

Local verification passed: all 391 tests in 63 files, TypeScript, source-directory
ESLint, script syntax and whitespace checks. Hosted tests are separate from these
checks: the one immediate raw-URL assertion remains a failure.

Remaining decisions and acceptance work:

1. Keep the immediate raw-URL assertion red. Do not call it fixed merely because
   the app already uses nonces or because the deleted file eventually disappears.
2. If immediate raw-link revocation is a product requirement, design a separately
   authenticated, non-cacheable image-serving path and block direct client Storage
   reads, with explicit staging migration/deployment approval and legacy-link tests.
3. Otherwise explicitly accept and accurately describe the measured propagation
   limitation; do not silently turn this assertion into an expected success.
4. Still verify the real erasure endpoint/worker, retries, independent staging UI
   and hosted migration-history differences before production cutover.
