# Food And Wine Pilot Development

Date: 2026-11-05. The owner requested implementation of the reviewed plan.
Scope: the existing repository and separately owned Windows WineSnap, never the
old production or abandoned hosted test. There is no automatic merge or release.

## Locked Product Decisions

- Food and wine are equally important, not a wine app with a hidden kitchen.
- The next milestone is a guided pilot on the owner's PC, not internet self-signup.
- Use WineSnap as the temporary name through the pilot.
- Create a new coherent visual design, not just a refresh of the current shell.
- Compare light and dark concepts first. The owner selects the direction before
  it is implemented in the actual app. An implementation request does not pick a
  visual direction automatically.
- Reuse recipes, Cook Mode, Food Memory, wine memory, pairing, Auth, image access
  and the owned backend. No new database format, public API or AI model is planned.
- Off-device backup and physical second-PC recovery remain explicitly deferred.

Estimated implementation effort after the review: three to four focused working
weeks, plus owner review and pilot sessions. This is an estimate, not a deadline.

## Stage Status

1. Design comparison: complete. The owner selected B (dark) on 2026-11-05.
   See [the comparison](design/pilot-2026-11-05/README.md).
2. Shared visual system and navigation: complete in the owned dark installation.
   See [implementation and verification](dark-pilot-ui-2026-11-05.md).
3. Connected food/wine journeys: complete in the owned dark installation.
   See [implementation and acceptance](connected-journeys-2026-11-06.md).
4. Complete and consistent core states: complete in the owned installation,
   with browser/offline acceptance. See [the receipt](core-states-2026-11-06.md).
5. Actual owned-app regression and controlled candidate: complete for local pilot.
   See [regression and demo](pilot-regression-2026-11-07.md).
6. Guided pilot and corrective iteration: pending.

Concept illustrations are not running UI, device testing, data changes or release
evidence. Stage 1 changed no application component or deployed image. Stage 2 now
installs the selected design behind an owned-only opt-in, with responsive browser
and local offline acceptance. This does not close the broader stage-5 regression
journeys or approve public release. The existing Chef
prototype remains historical, not the pilot application.

## Delivery Sequence

### 1. Compare And Approve Design

Compare the same home, recipe detail, Cook Mode and cellar screens in light and
dark directions, using the same example recipe, quantities, timer and wine list.
The comparison must include usable photography, readable content and equal
kitchen/cellar entry points. Record the owner's explicit A/B selection before
stage 2; if neither is accepted, revise the concepts instead of choosing for them.

### 2. Implement The Shared Experience

Apply the selected visual system to the existing app, keeping recognizable food
and wine context, accessible type and stable component sizing. The five primary
navigation positions are Home, Kitchen, scan camera, Cellar and Profile. The
camera opens the existing wine camera directly, without a second scan call to
action or an intermediate chooser. Cook Mode keeps a focused layout.

Add `VITE_PILOT_UI_ENABLED`, off by default, with explicit owned-build wiring.
Keep the old experience available when disabled. Preserve existing routes and
deep links. The home should offer useful next actions rather than a landing page.
New copy uses the existing localization system; icons use the existing library.

### 3. Connect Real User Journeys

Refine recipe-to-owned-wine and wine-to-recipe navigation using the implemented
pairing engine, with explanations and unknowns instead of fabricated percentages.
Preserve a cooking session when navigating to wine. Chef and sommelier retain
separate histories and authorized contexts. Do not merge private memory domains.

### 4. Finish Core States

Make scan review, explicit wine/image save, recipe-draft review, timers, syncing
and memory controls coherent in the selected design. Loading, empty, provider
quota/error, offline and retry states must be actionable. Preserve unknown wine
facts, draft confirmation, pinned recipe versions and explicit memory learning.
Do not silently retry paid AI calls or substitute providers/models.

### 5. Verify And Install Only The Owned Candidate

Investigate the bounded supervisor warning and distinguish missing/current
rehearsal evidence from application failure. Verify the latest local recovery
copy before an actual owned update; do not resume deferred off-device work.
Install only after acceptance, keep data and a documented rollback, and use the
real app on port 5212 rather than the separate design prototype on port 5200.

Require typecheck, lint, unit tests, database safety, build/runtime and client
budget checks. Verify layouts and keyboard operation at 360, 390, 430, 1024 and
1440 pixels, including loaded content and error/empty states. Responsive browser
checks are not physical mobile/camera or background-timer certification.

The five core acceptance journeys are:

- Approved original label image -> identity review -> wine and correct image save.
- Chef recipe draft -> user review -> saved private recipe version.
- Cook Mode -> timer -> reload/offline -> reconnect and session resume.
- Recipe -> owned wine and wine -> recipe without losing the working context.
- Memory correction/forgetting -> logout/account switch without private leftovers.

### 6. Run And Improve The Guided Pilot

Default to three to five adults, one at a time with the owner. Use separate
demonstration accounts and clearly marked example recipes/wines, not the owner's
private cellar, account or real passwords. Keep normal Auth/RLS and local-inbox
flows. No public account onboarding or external SMTP is required for this stage.

Record task obstacles and misunderstandings without new tracking/analytics.
Prioritize security/data loss first, blocking workflows second and cosmetic
issues third. Clean only exact disposable fixtures, never unrelated user data.
Each completed implementation stage gets a status update, commit and push.

## After The Guided Pilot

The next milestone can address external email, invited testing on participants'
own devices and the final name, after a separate decision. Weekly planning and
shopping lists depend on feedback rather than expanding the first pilot now.
Advanced keto/health logging, voice, fridge recognition and payments are outside
this delivery. Public release still requires independent operator, supplier,
privacy, device, recovery and rollout acceptance; neither the pilot nor green CI
waives any gate.
