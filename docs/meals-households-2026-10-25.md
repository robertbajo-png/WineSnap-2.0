# Phase 4: Pairing and Household Preferences

Scope: actual local WineSnap at `http://127.0.0.1:5210/kitchen`, with only
`pzniyupmgwvlldvztzqh` (WineSnap-test). No production deployment, merge, provider
change or Lovable task. Phase 3 remains intact; this is not the separate prototype.

## Reused and Corrected

- Reuses immutable recipe versions, completed Cook sessions, feedback, owned cellar
  rows, existing ingredient matching/normalization, Auth, privacy controls, protected
  image rendering and local recipe photographs. New panels load lazily.
- Adds Mat & vin, Familj and Maltider & vin through a secondary kitchen selector,
  retaining four primary navigation items. Recipe detail links to pairing; a finished
  cooking session links to meal registration. Wine pairings link back to recipes
  only for the wine owner, behind the test gate.
- Removes fabricated fallback dishes, 92/89/85/84 match numbers, calculated star
  ratings and nonfunctional category buttons from the older pairing page. It now
  shows only actual saved analysis suggestions, or an explicit empty/unavailable state.

## Suggestions, Not Measurements

Both dish-to-owned-wine and owned-wine-to-recipe views use deterministic culinary
rules with evidence, cautions and missing attributes. There are no invented match
percentages or model calls. Cellar suggestions use positive quantity, unconsumed,
owner-filtered wines only. The latest 200 wines are considered, with truncation
disclosed. Recipe choices combine the current saved cookbook with explicitly
identified inspiration recipes. Inspiration opens the existing review/save editor.

Ingredient-name heuristics propose an editable dish flavor profile. Unrecognized
ingredients do not imply a mild dish. Wine acidity/body/tannin/sweetness must be
present to support a rule; missing values stay unknown. Alcohol strength is not
available and its absence is stated for spicy dishes. Ranking points are internal
ordering, not validated taste probabilities. The shared wine-preference scorer is
available as an optional tie-breaker in the domain API; the UI does not currently
load private Wine Memory into these suggestions.

Rules draw on WSET's [pairing principles](https://www.wsetglobal.com/knowledge-centre/blog/2023/july/13/four-rules-to-masterful-food-and-wine-pairing),
[takeaway examples](https://www.wsetglobal.com/knowledge-centre/blog/2020/june/02/how-to-pair-wine-with-your-favourite-takeaway-meals/),
[spice guidance](https://www.wsetglobal.com/knowledge-centre/blog/2026/how-to-pair-drinks-with-spice/)
and the Washington State Wine Commission's [pairing guide](https://www.washingtonwine.org/your-wine-pairing-cheat-sheet/).
The precise thresholds and ingredient aliases are local engineering heuristics,
not certified recommendations or allergen/nutrition guarantees.

## Sharing Boundary

Five additive tables: `kitchen_households`, `kitchen_household_members`,
`kitchen_household_invites`, `kitchen_diners`, `meal_wine_links`.
Migration `20261025090000_meals_households.sql` defaults `meals_enabled` off.
Independent browser/runtime flags are `VITE_MEALS_ENABLED` and
`WINESNAP_MEALS_ENABLED`; the cooking, Chef and verified privacy gates remain required.

- Adult membership requires explicit confirmation and a single-use 256-bit code,
  valid 48 hours. Only its SHA-256 hash is stored; clients cannot select it.
  Codes are not URL parameters, emails or persistent browser storage. Creation
  and revocation are owner-only; token acceptance is serialized and rate-limited
  to 10 attempts/5 minutes. Invalid attempts commit their quota charge.
- Limits: five households/person, twelve adult members/household, twenty-four
  owned diner profiles/person, twenty preferences/profile, twelve open invitations
  per household. Reads paginate profiles and fail closed on inconsistent limits.
- Each adult manages only their own profiles, which are private by default.
  Explicit sharing exposes only that profile's nickname, adult/child type and ordinary
  food preferences to active members. The household owner cannot edit a peer's
  profiles. A member cannot read another cellar, private memory, recipes or chats.
- Child profiles have no account, birth date or health fields. Adult dietary choices
  are not copied to them. Wine is opt-in for adults; selecting only child profiles
  disables and hides wine suggestions. This is not verified age/guardian identity.
- Ingredient likes/dislikes are evaluated per selected profile. Cuisine, equipment
  and other unevaluated preferences are reported as requiring separate assessment.
  No shared profile data is sent to Gemini or copied into private meal history.
- Removal/revocation is enforced on the next server read; used codes cannot rejoin
  removed members. Removal also revokes pending invitations. Deleting a household
  or its owner detaches peers' profiles instead of deleting them. Offline or failed
  reads hide shared data; visible online views refresh every 15 seconds and on focus.
  Already downloaded information cannot be retroactively recalled. No offline family cache.
- A medical-word tripwire and strict schemas reject common clinical/allergy entries;
  they are not exhaustive sensitive-data detection. The UI prohibits health data.
  Public launch still needs an operator-approved household/children privacy assessment.

## Meal History and Privacy

Meal links require an owned, completed session and an owned wine. Composite owner
foreign keys, immutable session version references and revision checks prevent
foreign-ID substitution and stale updates. Exact replay is idempotent. One link per
session; food rating comes from cooking feedback, wine and pairing ratings are
separate optional 1-5 values. No inventory decrement or automatic preference learning.
The latest fifty registrations load their pinned recipe title and wine name even
when outside the current cookbook/history page. New registrations choose an
unregistered, synchronized completed session; existing rows can be edited/deleted.

Owner-filtered export includes all five tables. Global memory reset additionally
clears preferences in the caller's profiles, without deleting names, memberships,
recipes, meals or ratings. Food Memory's narrower reset remains separate. Account
erasure revokes pending-JWT access and cascades owned data. Expired invitations are
cleaned in bounded maintenance batches after seven further days. Privacy copy and
the reset confirmation describe these distinctions.

Snapshot v4 contains 35 application sections. Validation and isolated restore keep
legacy v1/v2/v3 support (20/24/30). A populated v4 restore verifies actual rows and
foreign keys in a disposable network-isolated PostgreSQL container. These are
application snapshots, not full PostgreSQL/Auth/platform backups; password hashes,
provider secrets and full platform state are not exported. Gates stay closed in a
restore until operator checks and later erasures are reconciled.

## Verification

- 756 unit tests / 90 files; TypeScript, full ESLint and zero runtime dependency
  vulnerabilities. Synthetic build, Node runtime smoke, client budget and separate
  prototype build pass. These synthetic artifacts are not deployed.
- Fresh local PostgreSQL applies all migrations and read-only security invariants,
  then synthetic kitchen, Chef and family/meal ownership/CAS/erasure acceptance.
- Live test wrapper uses already authorized DPAPI credentials over stdin, exact
  project/origin guards, disposable synthetic Auth accounts and `finally` cleanup.
  It exercises JWT/RLS, explicit sharing, foreign IDs, one-use/expired/revoked codes,
  quotas, meal ratings, export/reset/erasure, real browser forms, both pairing
  directions, offline hiding and snapshot restoration. Safe reports/screenshots
  remain ignored under `dist/local-windows-meals-report.json` and `dist/meals-qa/`.
- Responsive browser checks use 360/390/1024/1440px, populated views, Axe, screenshots
  and overflow checks. These do not certify physical iOS/Android devices, camera,
  background timers, SMTP, complete disaster recovery or public release readiness.
- Final hosted/local acceptance: 10/10 meals/household checks, 17/17 live Chef
  checks (including all four real Gemini actions), 20/20 Cook checks. No browser
  errors or cleanup failures. The single invitation was also raced by two users;
  exactly one joined. All temporary accounts and owned test rows were removed.
- Populated v4 restore: 35 tables, 3 synthetic accounts, 35 rows. Final clean
  snapshot: `snapshot-20261024-230108481.dpapi`; maintenance HTTP 200, no failed
  or remaining work. Privacy erasure receipts intentionally remain after cleanup.

```powershell
./scripts/configure-local-windows-ai.ps1 -Action TestMeals
./scripts/configure-local-windows-ai.ps1 -Action TestChef
./scripts/configure-local-windows-ai.ps1 -Action TestCooking
node scripts/check-cooking-database.mjs
./scripts/run-local-windows-operations.ps1 -Action Maintain
./scripts/run-local-windows-operations.ps1 -Action Backup
./scripts/rehearse-local-windows-snapshot.ps1
```

## Remaining Release Gates

Keep production intact. Full database/platform backup and restore access, physical
phone/PWA acceptance, working external email, operator privacy/provider review and
an explicit production rollout/rollback approval still apply. Optional Keto,
health tracking, voice and pantry are not included or enabled by this phase.
