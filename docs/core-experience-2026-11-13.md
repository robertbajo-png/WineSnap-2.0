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

## Remaining DEV-03 Work

These are substeps of the canonical roadmap, not a competing development plan:

- Finish the synthetic browser run and full CI for this source slice.
- Review gallery read failures versus empty state and account/wine changes while
  an image load or mutation is pending; preserve exact ownership and uncertain
  outcomes. Review late recommendation responses after wine/account changes.
- Review the remaining core screens, scan review/save, cookbook/Cook Mode,
  household/meal panels, memory, price provenance and keyboard/error states.
- After the owner naturally closes the existing viewer: complete DEV-02 real
  Check/Open/focus/heartbeat acceptance, take/rehearse the required current owned
  backup, then update only the owned app and run the affected fixture journeys.
  Do not waive those gates or mark DEV-03 complete from this source checkpoint.
