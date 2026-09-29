# Step 6: Restaurant menu mode

WineSnap can now read a pasted or photographed restaurant wine list and rank
the extracted wines against the signed-in user's Wine Memory.

## What changed

- The AI gateway extracts menu facts and neutral style information. It does not
  receive a client-supplied taste profile and does not assign match scores.
- The Edge Function loads the authenticated user's explicit profile and
  evidence-backed `derived_preferences` on the server.
- Deterministic ranking combines personal taste with the selected dish, maximum
  menu price, and familiar/balanced/adventurous mode.
- The UI distinguishes taste match, confidence, budget fit, and food pairing
  instead of presenting one opaque score.
- Menu photos are resized in the browser, validated by the Edge Function, and
  processed transiently. New photos are not stored as data URLs.
- Restaurant picks can be liked, disliked, or saved to the wishlist, feeding
  the existing Wine Memory feedback loop.
- Scan history stores structured constraints and extracted wine data under the
  existing owner-only RLS policy.

## Database migration

`20260928090000_add_restaurant_menu_mode.sql` adds `constraints`,
`extracted_wines`, and `language` to `restaurant_scans`, and allows
`restaurant` as a recommendation feedback source.

Apply this migration before deploying the matching frontend and Edge Function.
No production migration or Edge Function deployment is performed by this step.

## Verification

- Unit tests cover common menu price formats, budget ordering, dish fit, and
  exploration mode.
- Contract tests guard server-side taste loading, transient image handling,
  owner-only history, and model-independent scoring.
- Release verification includes TypeScript, ESLint, Vitest, production build,
  and responsive browser inspection.
