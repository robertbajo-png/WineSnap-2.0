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
