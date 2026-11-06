# Connected Food And Wine Journeys

Pilot plan stage 3, owned dark experience only. Implementation is in source;
owned installation and browser acceptance are pending at this checkpoint.
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

Stage 4 (comprehensive core-state consistency), stage 5 (broader five-journey
regression/release preparation) and guided human pilots remain separate work.
