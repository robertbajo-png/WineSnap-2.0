# DEV-03 Core Experience Checkpoint

Scope: source and an isolated synthetic frontend only. The real owned viewer is
still the earlier opener and may contain unsaved work. No installed app update,
backend migration, owner mutation, password action or internet change is part of
this checkpoint. Old production and abandoned hosted test are excluded.

## First Source Slice

- The wine-detail bottle and gallery thumbnails now use contain, not cover:
  tall labels/bottles remain inspectable without cropping their top or bottom.
- Unbroken wine names, origins, grapes and aroma labels can wrap within their
  existing columns. The approved dark palette, home and camera layout remain.
- The back control uses the existing translated label and tooltip.
- Gallery editing defaults to read-only and requires explicit owner editability
  plus a signed-in user. The detail page also hides edit/delete controls for a
  non-owner. Existing Auth, RLS, image access and storage rules are unchanged;
  hiding controls is not an authorization boundary.
- Public sharing is unavailable in owned/private builds and on loopback or
  otherwise unsuitable origins. The menu explains this before any mutation.
  The click handler independently rechecks availability before querying/updating
  a wine. Existing public flags and legacy share IDs are not changed or revoked.
- The service-worker revision is prepared for the next owned update. No running
  owner's browser is reloaded or updated automatically.

## Verification Method

The focused unit suite covers public-sharing availability and read-only/owner
gallery controls, alongside the existing aroma controls. Its latest run passed
three files / 22 tests. Earlier overloaded local runs were interrupted, not
counted as passes. Full CI and browser results must be recorded separately.

`scripts/check-core-experience-browser.mjs` accepts only a synthetic frontend
artifact with the known fake URL/key markers and no hosted project URL. Its
server has outbound fetch blocked and listens on a separate random loopback
port, never the installed app/API/inbox ports. Browser data comes from mocked
fixture GETs; no real login, stored session, user image or AI provider is used.
It checks long labels and contained media at 320/390/1440 px and 125% root text,
disabled local sharing, keyboard return and read-only gallery controls. Ignored
screenshots and a credential-free status report live in `dist/core-experience`.
This is source UI evidence, not installed backend/RLS or physical-device proof.

On this slow Windows checkout, the compiled fixture can also be exported with
the Dockerfile's separate `artifact` target and the same fake public URL/key.
That target copies only `dist/independent-runtime`; the normal final `runtime`
stage remains the default. No image needs to be started or connected to an owned
network. The existing Docker build-input allowlist remains unchanged. Never pass
server/provider secrets as build arguments or run this fixture as the real app.
An earlier full development-image export was cancelled after compilation; it is
not a completed export or installation.

## Observed Source Acceptance

- The isolated artifact export completed successfully. The deployment contract
  suite passed four tests, including the artifact-only copy and unchanged final
  non-root runtime stage. These are separate from the 22 focused UI/domain tests.
- The source browser check passed all six cases: full bottle/long-label layouts
  at 320, 390 and 1440 px with 125% root text; unavailable local sharing and menu
  keyboard return; read-only gallery; full-height contained photo and focus return.
- Browser page errors, forbidden external requests and mutations were all zero.
  Its isolated server/browser were closed and cleanup was confirmed. No provider
  request, real login, installed-app rebuild or real owner data was involved.
- The three detail screenshots and mobile photo view were visually inspected.
  They contain deliberately long synthetic names and a synthetic bottle only.
- Full GitHub Quality and Database Safety passed for `eb7a011` and the final
  source/tooling checkpoint `5e866da`, both push and PR. This includes typecheck,
  lint, the full unit suite, synthetic build/runtime and client budget, not a
  new real-owner or installed-feature acceptance.

## Second Source Slice: Gallery And Late Responses

- Gallery loading, empty, read error and offline states are distinct. Fresh reads
  use request generations; reconnect may reload metadata but never retries a
  save/delete. A keyed owner/wine/editability boundary removes old photos, crop
  files and lightboxes immediately when context changes.
- Photo writes capture and server-verify the normal owner's JWT before creating
  an immutable account client. Privacy status, wine ownership and current view
  are checked between steps. Existing Storage operation policies already allow
  list/upload/update/delete while blocking direct downloads; none are changed.
- Saves reuse scan reconciliation, a stable metadata UUID, the same private path
  and Blob. A lost upload can explicitly retry the same bytes; a lost insert
  reply is read back before another insert. Pending attempts lock new selections
  and stay only in memory, with a keep-this-page-open warning.
- JPEG/PNG/WebP/GIF/AVIF retain their actual MIME type/extension, within the
  existing 10 MB limit. Unsupported or oversized output is rejected before writes.
- Deletion confirms metadata removal before touching bytes, checks all current
  owner references (bounded, paginated), retains still-referenced/uncertain legacy
  paths and confirms exact-file absence through the permitted listing operation.
  Failed cleanup remains an explicit retry, not a false success or automatic job.
- Wine-detail state is keyed by wine, account and language. Leaving that context
  aborts recommendations; late results and feedback cannot populate the new view.
  Detail-page recommendation/wishlist writes use the original verified account.
  Concurrent suggestion submission is blocked; reconnect/account changes do not
  automatically start another AI request.
- New account operations have bounded network/authentication waits and private
  no-store/no-redirect requests. Existing callers without a scope keep their
  previous contracts; no provider model, role, password or database schema changes.

Focused verification passed eight files / 56 tests, including lost replies,
cross-account guards, denied metadata deletion, retained references on a later
page, uncertain cleanup, MIME validation, cancellation and existing wishlist
deduplication. Local typecheck passed before the final narrow additions; current
full CI and extended browser acceptance remain separate pending evidence.

## Remaining DEV-03 Work

These are substeps of the canonical roadmap, not a competing development plan:

- The first source slice is verified; retain its checks during subsequent work.
- Finish extended source browser and full CI checks for the second slice, then
  retain the scenarios in broader regression. Mocked auth/AI is not live-provider,
  real-JWT/RLS or installed-owner acceptance.
- Review the remaining core screens, scan review/save, cookbook/Cook Mode,
  household/meal panels, memory, price provenance and keyboard/error states.
- After the owner naturally closes the existing viewer: complete DEV-02 real
  Check/Open/focus/heartbeat acceptance, take/rehearse the required current owned
  backup, then update only the owned app and run the affected fixture journeys.
  Do not waive those gates or mark DEV-03 complete from this source checkpoint.
