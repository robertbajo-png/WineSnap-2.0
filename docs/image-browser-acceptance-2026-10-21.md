# Hosted Image Browser Acceptance

## Scope And Current Status

This is a local instance of the actual WineSnap application, using
`vite.independent.config.ts`, the hosted WineSnap-test project
`pzniyupmgwvlldvztzqh`, and `VITE_WINE_IMAGE_PROXY_ENABLED=true`.
It is not the Chef prototype and does not use the synthetic runtime-check build.
Production, main, public hosting and Lovable are unchanged.

Preparation is complete; actual browser acceptance is **pending** secure local
key entry and the checks below. The already completed 18-pass hosted HTTP image
test is documented separately in
[Revocable Image Access](revocable-image-access-2026-10-21.md).
Preparing this browser runner or passing its unit tests is not a browser test.

## Local Session

Run the existing secure-entry script in PowerShell 7 with `-Browser`:

```powershell
./scripts/run-hosted-image-proxy-check.ps1 -Browser
```

Enter only the existing test publishable and secret keys into its hidden fields.
They are passed to a temporary parent process, never command arguments, logs or
persistent credential/environment settings. The admin key is never written to a
file or sent to the browser. The intentionally public publishable key is supplied
to the frontend and can appear in generated Vite client code/cache, not Git.
The frontend child receives a fresh
allowlisted environment containing only basic OS paths and deliberate public
test configuration; it never inherits the admin key or arbitrary `VITE_*`,
`SUPABASE_*` or `NODE_OPTIONS` values. Privacy operations stay disabled.

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

All remain pending until observed in the actual app:

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

Preparation checks passed: 431 Vitest assertions in 66 files, targeted ESLint,
Node syntax and PowerShell parser checks. These cover public environment
isolation, target pinning, local mutation guards and HTML escaping. They do not
replace the pending browser checks or prove public production deployment.
