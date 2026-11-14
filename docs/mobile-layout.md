# Mobile Layout Pass

## Changes

- Reading text is generally 16px; important secondary text is 14px. Minor captions may remain 12px.
- Shared buttons, checkbox hit areas, tabs and slider tracks have at least 44px touch height. Inputs are 48px; slider grips are 24px.
- Home uses a single two-column shortcut row for For You and Restaurant Mode. Cellar stays in bottom navigation and taste preferences stay in Profile, without an additional scan CTA. The hero fills the available viewport space above the links, with a 320px mobile minimum, and can grow with text instead of overlapping it.
- Cellar and search names use two lines. Filters wrap; sorting and secondary actions have larger targets.
- Wine detail retains Ask and groups compare, share and edit in an accessible menu. Sharing behavior is unchanged.
- Aroma rows retain the approved imagery and layout, with readable family and intensity labels.
- Chat reserves separate space for scrolling answers and the composer. On a narrowed mobile viewport with a focused input, the navigation temporarily hides and returns when the viewport recovers.
- Overview retains the compact map (145px mobile / 185px desktop); supplementary statistics are expandable.
- Collector bottle details and optional estimates are expandable. Native validation reveals hidden invalid fields; existing estimates start expanded.
- Profile values wrap below their labels. Switches have accessible state and larger targets.
- Recommendations, wishlist, comparison, restaurant and social views use larger text and controls.
- Camera framing and shutter layout remain unchanged. The hint and close targets are improved; the cropper uses the shared zoom slider.
- The service-worker version is bumped for the next published release.

## Visual Checks

The actual home view and shared production components were inspected locally. Temporary fixture routes used synthetic content, did not bypass authentication or write backend data, and were removed before the build.

- 320x568, 390x844 and 430x932 mobile viewports: no horizontal overflow in the inspected home, chat, aroma, origin-table and form views.
- 1440x900: chat and origin-table layouts remain constrained and readable.
- 25% larger root text: inspected chat, origin table and form remain within the viewport.
- Short viewport with a focused composer (390x300): navigation hides, composer ends at the visible viewport bottom, and navigation returns at full height.
- Keyboard-operated sliders change intensity; deselected aromas disable their slider.
- Closed required form sections open on validation and focus the invalid field.
- Country disclosure controls preserve expanded state and region rows.

Home shortcut follow-up (2026-10-05): the hero is approximately 660px at 390x844, 716px at 1440x900 and 384px at 320x568. The two shortcuts share a roughly 72px row and remain fully visible above bottom navigation, with a 16px gap. No horizontal overflow was observed at these sizes or at 430x932. Swedish labels fit on one line, and the existing For You and Restaurant Mode translations are reused.

Primary text-token contrast against the relevant solid backgrounds: foreground/background 17.91:1, muted/card 8.75:1, gold/card 9.26:1, cream/burgundy 5.21:1. These measurements are not a full accessibility certification.

Physical iOS/Android keyboard behavior, camera permissions and capture still need device-level release smoke checks. Resize testing does not simulate a real operating-system keyboard. An HMR stylesheet hydration warning appeared during editing; production publication must use the final build, not the temporary fixture routes.

## Automated Validation

171 Vitest tests (35 files), TypeScript, ESLint, formatting and the production build passed. The build retains the existing TanStack/Radix directive and Nitro/Wrangler configuration warnings.

## Publication

GitHub synchronization and Lovable publication are separate. Publish in Lovable to put these changes on the live domain, then check the PWA update and core flows on a real phone.

## Built-App Release Follow-Up: 2026-10-21

This is the actual Node-built application against WineSnap-test
`pzniyupmgwvlldvztzqh`, not the Chef prototype or a synthetic runtime-check build.
Production, main, hosted permissions and Edge Functions were not changed.

Two narrowly scoped fixes:

- The bottom camera button now has a constrained square aspect ratio instead of
  a fixed height that stretches into an oval in a narrow column with larger text.
  An actual guest-home diagnostic measured the previous control at approximately
  58 by 70 CSS pixels at 320px width with 125% root text. The new browser assertion
  requires its width and height to agree within one pixel, without changing the
  normal camera screen or adding another scan CTA.
- The scan text-mode body now has `min-height: 0` and its own vertical scrolling.
  The header/mode controls remain outside that scroll area; the input and Identify
  action stay reachable in the short viewport instead of extending below it.

The existing secure browser runner supports these checks without another key
entry:

```powershell
./scripts/run-hosted-image-proxy-check.ps1 -Browser -Pwa
# Second terminal; set WINESNAP_PLAYWRIGHT_MODULE if using a bundled local module.
node scripts/check-hosted-image-browser.mjs
```

The driver runs the existing 17 image/PWA checks and eight mobile scenarios:

1. Cellar navigation with 125% root text at 320 by 568 and 390 by 844; control
   bounds, minimum touch sizes, no intersecting hit areas and horizontal overflow.
   Real keyboard Tab/Enter activates the skip link and focuses the content area.
2. Keyboard navigation opens Scan. A real denied browser permission disables the
   shutter while text and gallery alternatives remain available.
3. Granting the isolated test permission and pressing Retry starts an inline,
   muted video. Pixel samples confirm nonblank, changing frames; no microphone
   track is present.
4. Taking a photo opens the real local cropper, stops its camera track and keeps
   the captured aspect ratio consistent with the object-cover preview.
5. Retake starts the camera again; switching to text ends the new track.
6. With 125% root text at 390 by 360, the description accepts a synthetic draft,
   the empty/valid Identify states work, and keyboard focus/scroll brings the
   action fully into view. The action is never submitted.
7. With camera permission denied, gallery selection uses the normal file input
   without a native capture hint. A repository JPEG opens locally in the cropper
   and can be cancelled without an AI call or saved wine.
8. Closing the live camera ends its track and removes the local preview. A final
   cache/network audit still finds no unexpected private data or AI calls.

Chromium is launched with `--use-fake-device-for-media-stream`, which replaces
physical capture devices; see the
[Chromium switch definition](https://github.com/chromium/chromium/blob/main/media/base/media_switches.cc).
The test verifies the video track identifies itself as synthetic before capture.
Permission denial/grant is scoped to that disposable browser context and loopback
origin. No physical camera, personal image, microphone, real user session, AI
provider or user-data write is used by the new camera scenarios. The existing
image suite still creates and cleans its own previously approved synthetic wine.

### Results And Evidence

**25 passed, zero failed, cleanup confirmed** at 2026-10-21T20:20:09.448Z.
Safe report: `dist/hosted-image-mobile-report.json`, SHA-256
`05bc63c1d943839fdb1f64503ff77c65ee676c36a0651486a261b41bfd1596e6`.

The virtual stream was 1920 by 1080 with zero audio tracks. The captured JPEG was
699 by 1080; its ratio agrees with the measured preview ratio 0.646825 within
the absolute ratio tolerance of 0.01. All four control-layout audits passed; small browser
subpixel rounding is measured to the nearest CSS pixel, not treated as a genuine
undersized target. Six PWA cache audits found no unexpected paths or private
markers; the final peer cache contained 54 public asset/offline entries.
There were zero direct Storage image reads, AI requests, page/script errors,
unexpected HTTP responses or blocked unexpected requests.

Visually reviewed local screenshots:

- `dist/image-browser-mobile-camera-live.png`, SHA-256
  `0be5ae272dacab84db04fbf8a1015762739e77a88fd59c26b6da3d1e14995cdd`.
- `dist/image-browser-mobile-camera-crop.png`, SHA-256
  `aeb821a97a913270b5d5d2c478e7b58aaf44d65bae34a9f4e7966795d105cb61`.
- `dist/image-browser-mobile-scan-text-short.png`, SHA-256
  `6ff283ee2e7cd167011f99238a681c7831076aba651226fb143734fce2851991`.
  This last image shows the short scroll area after keyboard focus reaches Identify;
  it is not a claim that every form element fits simultaneously above a keyboard.

All 453 unit tests in 68 files, TypeScript, ESLint and the configured Node build
pass. Unit additions cover control-geometry boundaries and the two layout guards.
Local lint excludes generated dependency-backup/tool-cache directories. Both test
listeners closed, and independent API counts at 2026-10-21T20:22:08.761Z confirmed
zero Auth users, wines, photos, erasure receipts/jobs, quota rows and Storage root
entries. No tokens, passwords, cached bodies, browser auth state or HAR are saved.

### Still Device-Level

These are Chromium browser tests using viewport/root-text changes and a virtual
camera. They do not simulate the operating system's keyboard, certify full WCAG
conformance, validate iOS Safari/PWA installation, or verify physical lens choice,
rotation, app backgrounding, HEIC capture, camera revocation or native file pickers
on a real phone. Real-device checks and production cutover remain separate gates.
No successful AI wine identification is inferred from the synthetic camera feed.
