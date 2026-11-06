# Connected Food And Wine Journeys

Pilot plan stage 3, completed in the owned dark experience on 2026-11-06.
Source, owned installation and disposable browser acceptance are verified.
No old production, hosted test, provider model, database schema or private
memory domain is changed.

## Implemented

- Recipe detail and pairing links retain the exact saved recipe-version ID and
  chosen servings. Wine detail offers an explicit return to that recipe.
- Cook Mode can open wine suggestions and return to the same active session.
  Its pinned version, checked ingredients, step and timer deadlines are not
  rewritten by navigation. No extra cooking session is created.
- Owned wine pages also open the real wine-to-recipe pairing view. Saved recipes
  open their actual detail; inspiration recipes still require explicit review/save.
- Context links contain bounded identifiers and servings, never credentials,
  recipes, profiles, arbitrary return URLs or AI prompts. They use the existing
  hash/deep-link mechanism; no new persistent navigation store is introduced.
- Recipe/session resolution is exact and owner-scoped. A foreign, missing,
  completed or mismatched context is unavailable rather than silently replaced.
  An explicitly requested missing wine is not replaced by the first bottle.
  Historical owned versions not in the current cookbook are fetched by exact
  ID after normal account/gate verification, without changing the cookbook or
  substituting the newest version. Completed/mismatched session returns fail closed.
- Existing deterministic pairing explanations, cautions and unknowns remain.
  No invented match percentages, paid AI calls or provider fallbacks are added.
  Adult wine opt-in and child-profile restrictions remain in force.
- Chef and sommelier remain separate, with existing independent histories,
  authorization and context handling. No food/wine/private family memory is merged.
- New return links use the selected pilot theme, existing icons and Swedish/
  English localization. Classic routes and pilot-off behavior stay available.

## Verification

Focused journey/domain tests cover exact version resolution, owner isolation,
unchanged input sessions, pinned older versions, completed/mismatched sessions,
malformed/duplicate parameters, invalid servings, external return destinations
and legacy entry points. The first run passed 52 tests.

The existing disposable owned `PilotAccept` action now adds recipe/wine round
trips at 360, 390, 430, 1024 and 1440 px, servings after reload, keyboard return,
Cook-to-wine return with an actual timer and unchanged server-state fingerprint,
wine-to-recipe return and unavailable-target handling. It still blocks every
external/provider request and cleans only its exact administrator-tagged fixture.
This is not physical camera, mobile-background-timer or public-release evidence.

The service-worker revision is `2026-11-06-connected-food-wine`. Existing cache
isolation and same-origin gate-cookie rules are unchanged; no forced owner reload.
An owned-only update must preserve `dark-v1`, the approved HTTPS origin and
device-access binding. Require the latest local recovery rehearsal before that
update; deferred off-device recovery is not resumed.

## Owned Acceptance Receipt

- Before installation, the latest retained archive
  `owned-20261106-092147898.dpapi` was restored in an isolated clone: 75 tables,
  Auth hashes/identities, grants/policies/functions, rows/share IDs and one
  downloaded storage object matched. JWT owner isolation and temporary-resource
  cleanup passed. The running installation was not stopped or connected to by
  that restore rehearsal. This is same-PC recovery only.
- Frontend source `cbf81fc` passed Quality and Database Safety, including full
  typecheck, lint, tests, dependency security, synthetic build/runtime, client
  budget and the separate prototype build. Later acceptance-only source
  `e72e269` also passed all four push/pull-request workflows.
- Owned Update completed at 11:32 UTC, preserving `dark-v1`, the existing approved
  HTTPS origin and device-access binding. All 37 existing migrations were retained;
  zero new migrations ran. Database, Auth, Storage and application checks passed.
  The previous running app image was retained as
  `winesnap-owned:journeys-rollback-20261106`; no actual rollback was performed.
- The first completed browser run passed 42 checks. The expanded run completed at
  11:41 UTC with 43 checks: five responsive widths, recipe/wine round trips with
  servings after reload and keyboard return, cooking/wine round trips with an
  unchanged server-state fingerprint/revision, wine-to-recipe navigation,
  unavailable recipe/wine handling, secondary panels and logout clearing.
- Both runs had zero external requests, attempted AI calls and JavaScript page
  errors. Exact synthetic fixture cleanup completed. No real account, saved
  recipe, cellar row or provider choice was changed by acceptance.
- Visual inspection includes loaded wine-return controls at 360/390/1440 px.
  The capture helper waits for committed paint and checks the rendered navigation
  pixels so a transient loading shell cannot count as a loaded wine screenshot.
  Screenshots remain ignored under `dist/owned-pilot-ui`; no owner screenshot,
  browser login state, token, HAR or trace is exported.

Stage 4 (comprehensive core-state consistency), stage 5 (broader five-journey
regression/release preparation) and guided human pilots remain separate work.
