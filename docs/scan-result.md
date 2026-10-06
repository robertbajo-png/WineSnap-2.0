# Scan result review

## Frontend behavior

- The scan result shows the submitted label image, identity, taste summary, four main aromas, serving temperature, glass and two food suggestions before saving.
- Additional aromas, pairings, identity fields and the original label text are expandable.
- Label/text identity and AI estimates are labelled separately. Wine type is marked as an AI estimate unless corrected by the user.
- Missing identity fields and estimates are explicit; missing taste values do not become midpoint scores.
- The identity editor supports name, producer, vintage, origin, grapes and type. At least a name or producer is required. A vintage must be a valid four-digit year or empty.
- Changing identity clears the original wine's taste and serving estimates. The original AI record is retained in `ai_raw`; user corrections do not forge label evidence.
- Saving keeps the result visible and changes the actions to the saved wine and cellar. There is no second match/success page.
- An in-flight save guard and retained saved ID prevent duplicate inserts from double taps or a retry after photo-gallery failure.
- The local submitted-image preview remains available after saving. Back navigation never deletes a saved label.
- The wine detail header shows the latest available personal tasting-note rating, or no stars when the user has not rated the wine. It does not derive ratings from taste intensity.
- Service-worker cache version: `2026-10-06-scan-result-overview`.

No database migration, dependency installation or new AI request is needed for this frontend change. Existing authentication, image access and label validation remain in place. This change does not verify or deploy GPT-6.1 gateway support.

## Verification

- Full suite: 277 tests in 44 files pass. Typecheck, lint and the client/SSR/Nitro production build pass.
- Unit tests: aroma deduplication, food payload validation, missing taste values, identity corrections and vintage validation.
- Render tests: information before saving, partial labels, text input, AI/user provenance, saved state, disabled actions and expandable aromas.
- Integration contracts: one review screen, guarded inserts, preserved original AI data, saved-image protection and real personal ratings.
- Browser verification remains pending: the local synthetic test page reached Chrome, but automation could not attach to inspect or operate it. No screenshot, responsive measurement or interactive browser pass is claimed.

Before publishing, check the result and identity editor at 320, 390 and 430 px width and desktop. Include a long wine name, a partial label, an unknown vintage, corrections, save failure/retry and saved navigation. Do not use real user data for destructive tests.
