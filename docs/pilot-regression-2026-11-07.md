# Owned Pilot Regression And UI Demo

Stage 5 is in progress. The installed frontend remains the verified dark
candidate `2d98270`; this work adds owned-only acceptance and demo operators,
not production changes, a new AI model, public onboarding or a new data format.

## Scope

- PilotJourneys explicitly allows one original-label UI analysis and one Chef
  generation through the installed app. Its ordinary request guard blocks every
  other provider/external request. Scenario counts are not upstream billing counts.
- The image journey includes review, explicit save and a private-proxy read whose
  bytes must match the previously approved original. Chef includes explicit review,
  save and reload. No automatic paid retry or fallback is introduced.
- PilotAccept also exercises memory correction/forgetting, logout cache erasure,
  a second ordinary synthetic account and denial of the first account's recipe.
  Both administrator-tagged fixture manifests are retained for scoped cleanup.
- Image cleanup verifies the exact synthetic owner before querying referenced
  paths. Foreign, nested and unbounded paths are refused before deletion.
- PilotDemo opens the actual owned app in a separate visible, ephemeral browser
  with a normal synthetic login and clearly marked example records. Local Chef
  examples are marked as demo, not AI output. Provider/external calls and image
  uploads are blocked. It closes after 15 minutes or when the user closes it,
  then deletes only the exact tagged demo account. PilotDemoCleanup is the manual
  recovery action after an interrupted viewer. No browser login state is exported.

## Evidence So Far

- The initial attempt could not reach the Linux engine. Docker Desktop's first
  startup was cancelled; a normal launch of the existing installation recovered
  the engine. No engine reset, volume deletion or reinstall was performed.
- The existing owned stack and limited supervisor recovered, with all expected
  services healthy. The old production and abandoned hosted test were untouched.
- Features completed: 11 backend checks, zero failures or AI scenarios, exact
  fixture cleanup. App, Auth and Storage verification passed.
- The current archive `owned-20261107-170951456.dpapi` passed an isolated restore
  at 22:18 UTC: 75 tables, Auth hashes/identities, grants, policies/functions,
  rows/share IDs and one image matched. JWT isolation and temporary cleanup passed.
  This remains same-PC recovery only; deferred off-device work was not resumed.
- Focused isolated unit tests passed 20 assertions. A no-isolation trial showed
  cross-file mock contamination; the normal isolated run passed. Full CI and
  the new browser/live scenarios remain pending.

Stage 5 must not be marked complete until the remaining operations, live/browser
acceptance, rollback record and source checks are actually verified. This does
not attest physical mobile/background timers, external email, cold boot,
off-device recovery, supplier approval or public release.
