# Dark Food And Wine Pilot UI

Date: 2026-11-05. The owner explicitly chose concept B after viewing both generated
boards. This implements the actual app behind an owned-only opt-in, not a new
prototype or a production cutover. Guided pilot sessions remain a later milestone.

## Implemented Source

- Shared charcoal, sage, muted wine and brass tokens; accessible-sized controls,
  restrained surfaces and no old AppShell decorative gradient in pilot mode.
- An actual home page with equal kitchen/cellar entries, a separate generated food
  and wine photograph, the owner's real resumable cooking session when present,
  authorized recent wines, pairing and separate Chef/sommelier entries.
- Home data is fetched after client authorization, fenced to the current owner
  and hidden after logout/account switch. Offline cellar data is not retained;
  cooking reuses its existing deliberately private offline cache and sync logic.
- Recent-wine thumbnails only use managed paths through the existing image proxy;
  arbitrary stored external image URLs are not automatically loaded by the home.
- Shared five-position navigation: Home, Kitchen, direct wine camera, Cellar,
  Profile. Existing routes/deep links stay intact; sommelier access remains in
  the home and cellar. Focused Cook Mode omits the global bottom navigation.
- Existing kitchen, recipe, timer, draft and input components receive the dark
  tokens. The cellar uses compact unframed rows with full-proportion bottle
  images and actual quantities rather than duplicate vintage badges.
- Existing immutable versions, recipe review, session rules, private images,
  memory epochs, Auth/RLS, quotas and provider routing are unchanged.

The raster concept boards are not app assets. The new illustrative header image
has its own provenance in `src/assets/pilot/CREDITS.md`. It does not identify a
user's meal or purchased bottle. No demo data is inserted into the owner's cellar
or cookbook by the UI. No new API, schema, provider key or migration is introduced.

## Opt-In And Rollback

`VITE_PILOT_UI_ENABLED` is explicitly allowlisted, default off and false in the
synthetic runtime-check build. It requires both the exact owned backend and
enabled cooking/privacy gates. Hosted-test/production opt-ins fail validation.
The client independently requires the owned and cooking flags.

The existing Windows wrapper accepts these presentation-only Update choices:

```powershell
./scripts/run-owned-windows.ps1 -Action Update -PilotUi Dark
./scripts/run-owned-windows.ps1 -Action Update -PilotUi Classic
```

No mode selection is accepted on another action. Normal updates/resume preserve
the installed `winesnap.pilot-ui` label; an unconfigured install stays classic.
Unknown labels/modes fail closed. Presentation selection does not reset the
public origin, credentials, database, tunnel or DNS. A failed image build leaves
the old app container intact. Do not run a UI rollback merely to exercise it.

Manual Update and local restore now wait up to two minutes for the existing
operation lock; PilotAccept uses the existing five-minute acceptance wait. An
observed supervisor collision is queued without deleting/bypassing locks or
stopping background services. Ordinary Verify/maintenance behavior is unchanged.

Service-worker version `2026-11-05-dark-pilot-2` requests an ordinary app update.
Same-origin gate credentials and private/no-store/Vary/redirect guards remain
unchanged. No forced reload of an owner's active session is performed.

## Verification Contract

TypeScript and the 48 focused build/owned-mode tests passed at the first source
checkpoint. The latest retained owned database archive was separately rehearsed:
75 tables, Auth identities/hashes, grants/RLS, row/share fingerprints and one
downloaded image matched, with isolated-resource cleanup and no live database
connection. This is not a new off-device recovery claim.

The manual Playwright action is:

```powershell
./scripts/run-owned-windows.ps1 -Action PilotAccept
```

It requires the installed dark label, normal fixture login and tagged disposable
accounts. It blocks external and AI requests, captures home/recipe/Cook/cellar at
360, 390, 430, 1024 and 1440 px, and adds 390 px Chef, memory, pairing and nutrition
views after their loading indicators disappear. It checks images, keyboard recipe
navigation, 44 px primary-nav targets, theme, destructive-text contrast, overflow
and post-logout private-home clearing, and attempts exact-owner cleanup in `finally`.
Screenshots/progress are ignored under `dist/owned-pilot-ui`; no browser session,
HAR, token or real-owner screenshot is saved. The existing synthetic fixture also
completes its own profile onboarding to avoid a first-login redirect during home
acceptance; no real profile is edited.

## Owned Verification

- Installed `dark-v1` on the exact owned Windows backend. A subsequent ordinary
  Update preserved the dark selection and existing public origin without an
  override; completed at 10:21 UTC on 2026-11-05. All 37 existing migrations were
  retained, zero applied, and app/database/Auth/Storage checks passed.
- The served service worker contains `2026-11-05-dark-pilot-2`. The installed app
  image uses frontend revision `a65205c`; later acceptance/documentation changes
  do not alter that Docker build's frontend inputs.
- Quality and Database Safety passed for that frontend revision on GitHub:
  [Quality](https://github.com/robertbajo-png/WineSnap-2.0/actions/runs/42008919783)
  and [Database Safety](https://github.com/robertbajo-png/WineSnap-2.0/actions/runs/42008919773).
  This includes typecheck, lint, tests, security checks, synthetic Node build,
  runtime checks and the client budget; the actual owned Docker build also passed.
- The first dark installation separately passed all ten existing browser-offline
  scenarios: edits/reload/timer persistence, private-shell isolation, reconnect,
  both conflict choices and logout erasure. The follow-up app build only changed
  semantic contrast colors and the cache revision, not offline/auth/data logic.
- A post-update anonymous HTTPS probe passed all 25 denial/isolation checks on
  the approved owned hostname. This is gate verification, not authenticated
  mobile or outside-home acceptance.
- Final disposable browser acceptance completed at 10:33 UTC: 24 responsive
  screen checks plus logout clearing passed, with zero external requests, blocked
  AI requests or JavaScript page errors, and exact-fixture cleanup completed.
  Screenshots were visually inspected on phones and desktop, including loaded
  memory/pairing states. The check waits for the client-only resumable session
  before asserting navigation, avoiding a transient SSR/hydration timing race.
  No owner session is reused; artifacts stay in ignored `dist`.

The latest local full backup was restored in isolation before installation:
75 tables, one downloaded image, Auth identities/hashes, RLS/grants, row/share
fingerprints and JWT owner isolation matched; temporary clone cleanup passed.
This is same-PC recovery only. Off-device and physical second-PC work stays
deferred. No real accounts, recipes or cellar contents were changed by acceptance.

Stage 2 is the shared experience, not completion of the remaining connected
journeys, comprehensive state review or guided pilot. Neither source unit success
nor these browser checks certify physical mobile devices/cameras, external SMTP
or public release. The old production, abandoned hosted test and deferred external
backup remain untouched.
