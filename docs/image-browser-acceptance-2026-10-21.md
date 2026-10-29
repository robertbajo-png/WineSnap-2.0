# Hosted Image Browser Acceptance

## Scope And Current Status

This is a local instance of the actual WineSnap application, using
`vite.independent.config.ts`, the hosted WineSnap-test project
`pzniyupmgwvlldvztzqh`, and `VITE_WINE_IMAGE_PROXY_ENABLED=true`.
It is not the Chef prototype and does not use the synthetic runtime-check build.
Production, main, public hosting and Lovable are unchanged.

Actual image-browser acceptance is **passed: 12 checks, zero failures**, completed
at 2026-10-21T19:12:00.668Z. After the Chrome extension stopped responding and native
Chrome control was unavailable, the user approved a separate, isolated Playwright
browser. It used ordinary synthetic account logins, not the user's Chrome profile.
The photo-delete confirmation was accepted in that test browser. No claim is made
that the original Chrome dialog was closed. The 18-pass hosted HTTP image
test was also rerun successfully and is documented separately in
[Revocable Image Access](revocable-image-access-2026-10-21.md).
This is image-only local frontend acceptance, not a production release verdict.
The later built-PWA run also passed all 17 checks; its distinct evidence is below.

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
validate the real API keys; the actual browser results are recorded below.

The first browser attempt also exposed a local dev-server problem: the dependency
junction resolved TanStack's client entry outside Vite's default filesystem
allowlist. The independent config now permits only the checkout and the resolved
dependency directory while retaining strict filesystem checks. Startup checks
both rendered HTML and the JavaScript client entry before creating fixtures.
The initial failed browser attempt and the duplicate older session were cleaned
with zero reported cleanup failures; neither is counted as passing acceptance.
The independent config also explicitly selects the root tsconfig and excludes
`node_modules.release-backup` from watching. This avoids scanning an unrelated
dependency backup. Startup has a five-minute bound and 30-second request deadlines;
fixtures are still created only after both HTML and client JavaScript are ready.

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

Final run used the actual app on loopback port 53345 and separate owner, peer,
anonymous and fixture-operator browser contexts. All 12 checks passed:

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

The safe report is `dist/hosted-image-playwright-report.json`, SHA-256
`119980d1268d87441e8effd177c2949154d57850f63f5f33de734f532322a95a`.
Its 12 individually recorded checks cover the list above, including separate
cellar/detail/layout/upload/delete/owner-retention and browser-error assertions.
Desktop was 1440 by 1000, mobile 390 by 844; both had no horizontal overflow.
Private images decoded, peer access was denied, anonymous sharing returned JPEG
bytes with `private, no-store, max-age=0`, and the same browser proxy requests
returned 404 after unsharing or erasure. Existing images were removed from the DOM.
There were zero direct Storage image reads, AI calls, page errors, script console
errors, unexpected HTTP errors or blocked unexpected requests.

Focus revalidation used real headed-window activation, not `dispatchEvent` or an
application mock. Playwright normally emulates permanent focus, so this run
disabled that emulation through its CDP session, waited for the other page to
actually receive focus and the target to lose it, then activated the target.
Three natural focus events were recorded: unshared anonymous page, erased owner
page and erased anonymous page. No sleeps were used to substitute for those
focus-state assertions.

Earlier attempts remain failures, not passes: the first Playwright attempt passed
four checks before an ambiguous lightbox Close locator; the next two passed eight
before the focus harness timed out. Each cleaned its fixtures. The locator was
restricted to the actual Close button, and real focus transitions fixed the
harness. The successful final run reran every assertion from clean fixtures.

The browser run exposed a real client bug: Supabase FunctionsClient parsed
`image/jpeg` as text, and the UI rejected the result because it was not a Blob.
The client now POSTs to the same fixed `wine-image` endpoint and reads binary
data, preserves the user JWT/public-key separation, uses no-store and rejects
redirects, active content, empty images and responses over 10 MiB. It still never
falls back to direct Storage when the proxy flag is enabled. JPEG-byte regression
tests cover the observed failure rather than mocking an already-correct SDK Blob.

A second real client bug surfaced: hosted anonymous reads of `wines` returned
401/42501, while the existing `public_wines` view was readable. Public shares now
select only the explicit public projection from that view. A local typed contract
avoids editing generated database types. Source-only installations fall back to
the original `wines` RLS lookup only when the view itself is missing, and always
filter by the exact share ID and `is_public=true`. Empty/revoked shares, denied
reads, column errors and network errors never trigger fallback. Four regression
tests cover those boundaries. No grants, policies or hosted schema were changed.

Screenshots were visually inspected on desktop and mobile. Owner mobile proof:
`dist/image-browser-owner-mobile-e2e.png`, SHA-256
`b7133c63c88c3378154b3d0fa36bf0e224411429c9577300799be500d44bb6a7`.
Erasure proof: `dist/image-browser-erasure-images-cleared.png`, SHA-256
`18ed64c8dba52705de1b7589b37bc9cde7c14ede9cb63940abe5ecdf29fa30e7`.
The report also lists desktop, cellar, peer-denied, shared and unshared screenshots.
These hashes identify the original 12-check run. Screenshot paths are local
latest-run artifacts and may be replaced by subsequent PWA captures; their latest
hashes belong to the PWA evidence below, not to the historical run.

To repeat, start the secure `-Browser` wrapper above, then run the driver in a
second terminal while that fresh private fixture is ready:

```powershell
# If Playwright is bundled elsewhere, set this to its local index.mjs path.
$env:WINESNAP_PLAYWRIGHT_MODULE = '<local Playwright module path>'
node scripts/check-hosted-image-browser.mjs
```

The driver accepts no connection arguments, refuses an inherited admin key,
validates the fresh test-only loopback URLs and blocks production/AI requests.
Temporary synthetic passwords exist only in memory. No auth state, HAR or trace
is saved. The browser closes and fixture cleanup runs in a finally block.

Use a repository image for uploads; do not select a personal photo or invoke AI.
Avoid the AI Picks/Ask/scan-analysis actions in this image-only acceptance run.
Sharing state can be controlled through the fixture operator page without
opening a native operating-system share dialog. This does not test that dialog.

## Built PWA Test Mode

```powershell
./scripts/run-hosted-image-proxy-check.ps1 -Browser -Pwa
# In a second terminal, with the same optional local Playwright module setting:
node scripts/check-hosted-image-browser.mjs
```

The wrapper reuses the enrolled encrypted test keys. `-Pwa` without `-Browser`
is refused. The runner builds the actual application in `image-browser` mode,
then starts its Node artifact on loopback. It never uses the synthetic
`runtime-check` artifact as the real app. This rebuilds
`dist/independent-runtime`; rebuild `runtime-check` mode before using the separate
synthetic runtime checker again. The default Lovable build is unchanged.

The build and app children receive fresh allowlisted public test configuration,
not the parent operator's admin key or other inherited private settings. The Node
server is bound to 127.0.0.1 and receives only the public test URL/key. Privileged
fixture operations stay in the existing guarded local operator. Builds time out
after ten minutes, startup after five; fixtures are not created before readiness.

The same driver detects the fresh `runtime=built` session. The original PWA run
had 17 checks: the original 12 image scenarios plus real service-worker activation,
obsolete cache removal, explicit update confirmation, offline layout and cache
privacy. Its report remains `dist/hosted-image-pwa-report.json`. The driver now
adds eight mobile/camera checks and writes the combined 25-check verdict separately
to `dist/hosted-image-mobile-report.json`; see the mobile follow-up below.
Normal development mode still runs 12 checks with service workers blocked.

The production `AppUpdate` component registers the actual `/sw.js` worker.
Owner, peer and anonymous contexts must each be controlled by that worker.
The test seeds only empty obsolete WineSnap caches and an unrelated empty cache,
then verifies activation removes the obsolete ones but preserves the unrelated
one. It does not seed real user data or change production caches.

For update testing, registering the same real worker with a fixed revision query
creates a waiting worker. The normal app dialog must appear, Cancel must preserve
a synthetic unsaved email field and leave the worker waiting, and Reload must
activate the worker and reload the document. This tests the browser/app lifecycle,
not an upgrade from a historical production binary or a native OS install prompt.

Five cache audits inspect actual Cache Storage while private/shared images are
visible and after erasure, offline navigation and peer denial. Only same-origin
bundled public assets, icons and the offline shell are allowed. Readable cached
bodies are checked for token/secret-shaped values and known synthetic account,
draft and wine markers. Only aggregate findings are reported, never cached bodies
or credentials. Context-level network listeners also observe worker-owned requests;
see [Playwright service-worker network events](https://playwright.dev/docs/service-workers#network-events-and-routing).

The worker now precaches the offline icon with its HTML and uses cache version
`2026-10-21-revocable-images`. The offline page includes padding in its viewport
height, uses 16px body text and provides a 48px retry target. The browser checks
the 390 by 844 layout for horizontal/vertical overflow and a target of at least
44 rendered CSS pixels; it also requires the offline icon to decode and no managed
wine image to remain.

### PWA Result

**17 passed, zero failed, cleanup confirmed**, at 2026-10-21T19:49:38.441Z.
Report SHA-256:
`5bc83f680c3c44dcd72f32749b750c80aada7e66e2c75cb95e828798409a4262`.
All three app contexts were naturally worker-controlled. The same three real
focus transitions still revoked previously displayed images with the worker on.
There were zero direct Storage reads, AI requests, page/script errors, unexpected
HTTP errors or blocked unexpected requests.

Cache audits counted 43 entries with the owner's private images visible, nine
with the anonymous shared image visible, 45 after owner erasure, 16 after offline
navigation, and 39 in the denied peer context. Every audit found zero unexpected
URLs and zero private-marker/token-shaped bodies. These are concrete fixture
observations, not proof that every future private payload will match a regex.

The final offline document and scroll dimensions both measured 390 by 844.
The retry target measured 47.999 CSS pixels, above the unchanged 44px minimum.
Desktop/mobile screenshots were visually reviewed. Latest local proof:

- `dist/image-browser-pwa-update-confirmation.png`, SHA-256
  `83ad58923e7a27cc660dab5e88015df5c694f6fa73e664d89a758371137b55ec`.
- `dist/image-browser-pwa-offline-mobile.png`, SHA-256
  `e63b89e02cf2daad846063b4d5c034bcf22e658d067dc99b89cf8f7db235d4ac`.
- `dist/image-browser-owner-mobile-e2e.png`, latest PWA capture SHA-256
  `08c51d453e66fab3e798d828e8054adc816837f3af735eac96e397037f9b7e1c`.

The initial PWA run passed 17 checks before the visual review added a stricter
offline layout/touch assertion. The next run passed 15, failed that touch target
and left the final cache check pending; it remains a failure in
`dist/hosted-image-pwa-touch-target-report.json`. An isolated built-app diagnostic
measured a CSS 44px link as 43.996px under headed-window scaling. The source now
uses 48px; the test's 44px threshold was not weakened. The final clean-fixture run
reran all 17 assertions successfully, including the added layout measurements.

Code checks: 446 unit tests in 67 files, TypeScript, Node syntax, PowerShell parser,
and ESLint pass. Local lint excludes generated dependency-backup and tool-cache
directories; those are not application source. The actual configured Node build
was exercised by this browser run. No backend function, SQL policy or production
setting changed; the separate earlier 18-pass backend report still stands.

All three PWA fixture sessions cleaned successfully and closed their six checked
app/operator ports. The isolated browsers and diagnostic server were closed.
An independent read-only API count at 2026-10-21T19:50:14.020Z again confirmed zero
Auth users, wines, photos, erasure receipts, erasure jobs, quota rows and Storage
root entries in WineSnap-test. No production project was queried or changed.

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
verdict separate from this cleanup proof and the HTTP test report.

Initial image-only code checks passed: 440 Vitest assertions in 67 files, TypeScript, targeted
ESLint, Node syntax, PowerShell parser and the independent runtime-check build.
The build retains its existing large-chunk warning. These cover public environment
isolation, target pinning, local mutation guards and HTML escaping. They do not
replace browser checks or prove public production deployment.

After Chrome stopped, the session was finished through the same loopback
operator's guarded cleanup endpoint using its own session cookie, origin and form
nonce, without extracting browser credentials or altering its guards. The runner
reported `phase=cleaned`, `setupCompleted=true`, `cleanupFailures=0` at
2026-10-21T11:41:08.589Z. All six local app/operator ports from the three sessions
were independently confirmed closed.

The final browser session reported `phase=cleaned`, `setupCompleted=true`,
`cleanupFailures=0` at 2026-10-21T19:11:57.005Z. All eleven checked app/operator
ports from the later sessions were closed. Its isolated browser was closed.

The hosted HTTP suite was rerun using the encrypted keys without manual entry:
**18 passed, 0 failed, 0 cleanup failures**, completed at
2026-10-21T19:12:41.140Z. Report SHA-256:
`fdf73ae38584ade94e6565f73ce8fc21844c896a08eaea94bcaea29a0cd27b1b`.

An independent read-only API check at 2026-10-21T19:13:40.238Z confirmed zero Auth
users, wines, wine photos, erasure receipts, erasure jobs, quota rows and root
Storage entries. The local report is `dist/image-browser-cleanup-counts.json`.
The earlier SQL cleanup proof remains a separate prior observation; this readback
did not require a dashboard mutation or production access.

Not tested by the original 12-check run: AI identification, PWA/service-worker
lifecycle, native OS share UI, production schema/caches or public deployment.
Service workers were blocked in that original run. The built PWA mode above is
separate; neither mode proves installation or camera/background behavior on a
physical iPhone/Android device, or production release acceptance.
