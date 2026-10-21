# Hosted Image Browser Acceptance

## Scope And Current Status

This is a local instance of the actual WineSnap application, using
`vite.independent.config.ts`, the hosted WineSnap-test project
`pzniyupmgwvlldvztzqh`, and `VITE_WINE_IMAGE_PROXY_ENABLED=true`.
It is not the Chef prototype and does not use the synthetic runtime-check build.
Production, main, public hosting and Lovable are unchanged.

Actual browser acceptance is **partially verified**, not complete. Encrypted key
enrollment and the owner image/gallery/upload checks have passed. A native Chrome
confirmation blocked further browser automation; the remaining checks below are
not reported as passed. The already completed 18-pass hosted HTTP image
test is documented separately in
[Revocable Image Access](revocable-image-access-2026-10-21.md).
Preparing this browser runner or passing its unit tests is not a browser test.

## Local Session

Run the existing secure-entry script in PowerShell 7 with `-Browser`:

```powershell
./scripts/run-hosted-image-proxy-check.ps1 -Browser
```

If saved test keys exist, the script loads them without asking again. Otherwise,
enter only the existing test publishable and secret keys into its hidden fields.
They are passed to a temporary parent process, never command arguments, logs or
persistent environment settings. The admin key is never written as plaintext or
sent to the browser. The intentionally public publishable key is supplied
to the frontend and can appear in generated Vite client code/cache, not Git.
The frontend child receives a fresh
allowlisted environment containing only basic OS paths and deliberate public
test configuration; it never inherits the admin key or arbitrary `VITE_*`,
`SUPABASE_*` or `NODE_OPTIONS` values. Privacy operations stay disabled.

### Optional Encrypted Key Reuse

The user requested local key reuse to avoid repeated manual entry. On Windows,
`-RememberKeys` saves both existing test keys as `PSCredential` values in
`.env.winesnap-test-keys.local` in the repository root. This is encrypted XML,
not a dotenv file; the `.env.` prefix makes Vite's default file-server denylist
block downloads of both this file and its temporary siblings. `Export-Clixml` encrypts the
passwords using Windows DPAPI for the current Windows account and computer;
other platforms are explicitly refused. The file has inheritance disabled and
allows only the current Windows user and SYSTEM. It is ignored by Git, including
temporary sibling files. It is not portable credential storage or chat memory.

```powershell
./scripts/run-hosted-image-proxy-check.ps1 -Browser -RememberKeys
```

Subsequent `-Browser` runs reuse that file automatically. Keys are still scoped
to the fixed WineSnap-test project, not production. The wrapper refuses redirected
key files and validates the stored project, version and credential types. Remove
the local encrypted file to stop reuse; doing so does not revoke keys in Supabase.
After rotating test keys, remove the old local file and enroll the replacement.
Do not commit, upload, print or share the encrypted file.

The internal `-StoreKeysOnly` mode accepts the existing test keys through local
redirected standard input, encrypts them, and exits without starting Node or
making network requests. It must never receive keys in command arguments or logs.
The actual existing test keys have now been enrolled from the authenticated
test dashboard. Independent inspection confirmed the expected project and
credential types, protected two-principal ACL, no plaintext key prefixes and Git
exclusion. The browser runner successfully loaded them without another prompt.

Synthetic verification passed: encrypted round trip, absence of both plaintext
canaries in the file, protected two-principal ACL, refusal of another project,
Git exclusion and cleanup of the synthetic credential file. These checks do not
validate the real API keys or replace the pending browser acceptance.

The first browser attempt also exposed a local dev-server problem: the dependency
junction resolved TanStack's client entry outside Vite's default filesystem
allowlist. The independent config now permits only the checkout and the resolved
dependency directory while retaining strict filesystem checks. Startup checks
both rendered HTML and the JavaScript client entry before creating fixtures.
The initial failed browser attempt and the duplicate older session were cleaned
with zero reported cleanup failures; neither is counted as passing acceptance.

DPAPI behavior is documented by
[Microsoft Export-Clixml](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml?view=powershell-7.4).

`scripts/run-hosted-image-browser.mjs` pins all privileged API traffic to the
test project and takes no connection arguments. It starts the real app on a
free loopback port, creates two disposable verified test users, marks only their
synthetic profiles onboarded, and uploads the existing `hero-bottle.jpg` example
asset for one synthetic wine. No AI function is invoked by this runner.

An ephemeral, separate loopback operator page lets the tester view the temporary
test sign-ins and change only that fixture's sharing/erasure state. These are
existing synthetic account credentials, not the user's real login or an admin
key. They remain in memory and are not included in reports. Mutations require
the exact loopback Host and Origin, an HttpOnly SameSite=Strict cookie and form
nonce. There is no CORS grant, arbitrary database endpoint or caller-supplied
user/wine selector. CSP blocks scripts, embeds and external form submission.

The operator page is test tooling, not a new application route. The actual
WineSnap login form, cellar, wine detail, image gallery and public share are the
surfaces to inspect. Use only synthetic sign-ins, never the production session.

The safe local lifecycle report is
`dist/hosted-image-browser-session.json`. It contains local URLs and phase/status,
not passwords, API keys or JWTs. `setupCompleted` distinguishes a ready session
from cleanup after a startup failure. Its lifecycle status is not an E2E verdict.

## Browser Checks

Observed on 2026-10-21 using the actual app on loopback port 52477:

1. Anonymous private share is unavailable and reveals no managed image.
2. Owner signs in through the normal app form and sees the private bottle image
   in the cellar and wine detail, with a decoded image rather than a placeholder.
3. Gallery and lightbox display correctly; upload and removal of a disposable
   extra photo work with the restrictive Storage policy still installed.
4. A different signed-in test account cannot view the private wine or image.
5. An explicitly shared fixture is visible anonymously, including its image;
   confirm the hosted logs contain browser-originated POSTs to `wine-image`.
6. After unsharing, reload/focus the existing public page and confirm the image
   is removed/denied and a refreshed share is unavailable. Owner access persists.
7. After the synthetic owner's erasure request, the existing owner view must
   clear its image on focus/revalidation; no direct Storage fallback is allowed.
8. Inspect desktop and mobile layouts, image dimensions, horizontal overflow and
   browser errors. Save screenshots of app pages, not exposed test passwords.

Results:

- **Passed:** anonymous private share displayed "Not available" with no image.
- **Passed:** normal owner sign-in, private wine detail and gallery image decoded
  from local Blob URLs. The original JPEG was 1024 by 1024 pixels.
- **Passed:** lightbox image decoded and displayed at 358 by 358 CSS pixels on
  mobile; an additional repository image uploaded through the real crop/upload
  flow. Three images then decoded: header, original gallery and extra gallery.
- **Passed:** 390 by 844 mobile viewport, scroll width 390, no horizontal overflow.
  The owner image also decoded before switching from the normal desktop viewport.
- **Pending:** recheck the cellar thumbnail after the binary-response fix, peer
  account denial, anonymous public image, browser-origin hosted logs, unsharing
  on focus/reload and owner erasure revalidation. HTTP-level equivalents remain
  green but do not replace these frontend observations.
- **Pending:** extra-photo removal through the UI and complete desktop/error-log
  review. Chrome automation timed out while handling the native "Delete this
  image?" confirmation. No successful deletion is inferred from clicking it.
  Browser viewport reset was also unavailable after the connection stopped.

The browser run exposed a real client bug: Supabase FunctionsClient parsed
`image/jpeg` as text, and the UI rejected the result because it was not a Blob.
The client now POSTs to the same fixed `wine-image` endpoint and reads binary
data, preserves the user JWT/public-key separation, uses no-store and rejects
redirects, active content, empty images and responses over 10 MiB. It still never
falls back to direct Storage when the proxy flag is enabled. JPEG-byte regression
tests cover the observed failure rather than mocking an already-correct SDK Blob.

Local screenshot: `dist/image-browser-owner-mobile.png`.
SHA-256: `cb828586c3bfac9e539e84c443beb8788220121a6e8e768ddfa886a0237d79a8`.

Use a repository image for uploads; do not select a personal photo or invoke AI.
Avoid the AI Picks/Ask/scan-analysis actions in this image-only acceptance run.
Sharing state can be controlled through the fixture operator page without
opening a native operating-system share dialog. This does not test that dialog.

## Cleanup And Safety

Finish through the local operator's cleanup button, or Ctrl+C in the interactive
test window. A 30-minute watchdog also ends the session. Cleanup uses the existing
server-only storage inventory RPC, verifies every object belongs to the fixture's
`wine-labels/<user>/` namespace, deletes files through Storage, and then removes
only those test photos, wines, Auth accounts and erasure receipts. No database
worker, administrator role, cron or destructive migration is enabled.

The runner reports cleanup failures instead of claiming success. Independently
check aggregate Auth/wine/photo/Storage/erasure/job/quota counts in the dashboard
afterward, and verify the app's loopback port has closed. Keep a passing browser
verdict separate from this cleanup proof and the earlier HTTP test report.

Final code checks passed: 434 Vitest assertions in 66 files, TypeScript, targeted
ESLint, Node syntax, PowerShell parser and the independent runtime-check build.
The build retains its existing large-chunk warning. These cover public environment
isolation, target pinning, local mutation guards and HTML escaping. They do not
replace the pending browser checks or prove public production deployment.

After Chrome stopped, the session was finished through the same loopback
operator's guarded cleanup endpoint using its own session cookie, origin and form
nonce, without extracting browser credentials or altering its guards. The runner
reported `phase=cleaned`, `setupCompleted=true`, `cleanupFailures=0` at
2026-10-21T11:41:08.589Z. All six local app/operator ports from the three sessions
were independently confirmed closed.

The hosted HTTP suite was rerun using the encrypted keys without manual entry:
**18 passed, 0 failed, 0 cleanup failures**, completed at
2026-10-21T11:41:50.357Z. Report SHA-256:
`833f57910d3336bdfd1f8e24c76024cab248b16e93dd5043aa19ee2292620313`.

An independent read-only API check at 2026-10-21T11:44:55.228Z confirmed zero Auth
users, wines, wine photos, erasure receipts, erasure jobs, quota rows and root
Storage entries. The local report is `dist/image-browser-cleanup-counts.json`.
The earlier SQL cleanup proof remains a separate prior observation; this readback
did not require a dashboard mutation or production access.
