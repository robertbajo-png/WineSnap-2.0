# Phase 5: Local Recipe Nutrition Foundation

Scope is the actual WineSnap-test kitchen, not production or the illustrative
prototype. Independent `VITE_RECIPE_NUTRITION_ENABLED` requires the existing
test-only cooking and verified privacy gates. No database migration, provider
change, new credential, health table or production action is introduced.

## Boundary

Standard is the initial setting. The optional low-carbohydrate/Keto views are
temporary, adult-oriented recipe calculations. Switching off, leaving the view,
reloading or changing accounts discards the calculation inputs. No setting,
target or ingredient mapping goes into localStorage, IndexedDB, Food Memory,
households, account exports or server snapshots. There are no daily goals,
nutrition journals, weight tracking, ketone readings, diagnosis or claims of ketosis.
Adult modes are never applied to family or child profiles.

This is an engineering/test implementation, not a medical suitability assessment
or completion of independent nutrition/privacy review. Keep the production flag
off. Clinical use, health data collection, persistent dietary profiles and public
release need separate safety, privacy and operator approval.

## Reuse and Sources

Reuses the immutable recipe/version model, owned cookbook, pinned Cook version,
portion controls, existing food photographs and explicit Chef draft-review flow.
KetoLens's pure portion and carbohydrate concepts were reviewed read-only; its
approximate seed figures and early per-ingredient rounding were not copied.

Nineteen curated references were imported from Livsmedelsverket's public API.
Original four nutrient records, food versions, retrieval date, units and integrity
hashes are preserved in the bundled snapshot. Their [CC BY 4.0 attribution](../src/features/nutrition/CREDITS.md)
is visible in the panel. Generic source selection is deliberate, never an automatic
claim that a purchased product or free-text ingredient was correctly identified.
Users can instead transcribe a named package label with an explicit EU/US basis.

Livsmedelsverket describes its [carbohydrate field as available carbohydrate](https://www.livsmedelsverket.se/livsmedel-och-innehall/naringsamne/livsmedelsdatabasen/sok-naringsinnehall/ordlista-for-sok-naringsinnehall/naringsamnen),
already excluding fiber. FDA explains that [US Total Carbohydrate includes dietary fiber](https://www.accessdata.fda.gov/scripts/InteractiveNutritionFactsLabel/assets/InteractiveNFL_TotalCarbohydrate_October2021.pdf).
WineSnap therefore uses EU carbohydrate directly and subtracts known fiber once
from US total for its explicitly described comparison convention. Sugar alcohols
are not subtracted. This is not an insulin-dose calculator or a standardized
clinical definition of net carbohydrate.

## Calculation Contract

- Each ingredient needs an explicit reference or named label, edible gram weight,
  matching preparation state and confirmation. Source values are per 100 g edible
  food. Raw, cooked, dry and as-sold are not interchangeable.
- Only g/kg convert automatically. ml/dl/l, spoon measures, pieces and pinches
  require an entered edible weight; no guessed density or typical piece weight.
- Missing nutrients remain nullable, distinct from measured/reference zero.
  US total without fiber cannot support the carbohydrate calculation. Incomplete
  recipes show no final carbohydrate total or within-target verdict.
- Aggregate unrounded contributions, scale recipe totals by requested servings,
  then format at display time. The per-serving figure stays unchanged when all
  ingredients are scaled equally. Yield, drainage, cooking losses and leftovers
  are not estimated. A zero quantity contributes zero by definition.
- A voluntary recipe-level comparison limit has no preset clinical target.
  Comparison uses full precision and never labels a recipe medically appropriate,
  guaranteed Keto or likely to cause ketosis.
- Ingredient comparison requires the replacement's own explicit grams and state;
  no implicit 1:1 equivalence. It changes no recipe, timer, cooking state, stock
  quantity or family preference. Original and comparison numbers remain separate.

## Culinary Adaptation

The comparison can open an editable Chef adaptation request for the existing
owned recipe version. Only the ingredient name, replacement and gram amount are
prefilled, with a request to adjust affected steps and avoid nutrition guarantees.
Mode and comparison limit are not sent. Opening does not call the provider.
The user must submit the request, review the structured draft and explicitly save
a recipe version. Nutrition mapping does not silently attach to that new version.

## Verification and Release Status

Focused tests cover EU/US fiber, nullable fields, invalid values, missing densities,
mass units, preparation mismatch, zero quantity, portion scaling, precision at
thresholds, nonmutating substitutions, publisher values and snapshot hashes.
The browser test uses disposable test accounts, owned synthetic recipes, existing
encrypted credentials and exact-origin guards. It exercises the actual UI and one
explicitly requested real Gemini adaptation, not a mocked nutrition model.

```powershell
./scripts/configure-local-windows-ai.ps1 -Action TestNutrition
node scripts/refresh-nutrition-reference.mjs --update # maintainer-only public import
npm run typecheck
npm run lint
npm test -- --maxWorkers=1 --pool=threads
npm run build:check
node scripts/check-independent-runtime.mjs
node scripts/check-client-budget.mjs
```

Safe QA reports and screenshots belong under ignored `dist/`; never commit keys,
Auth tokens, test passwords or private recipe exports. Current snapshots remain
v4/35 tables because this feature adds no persisted domain data.

Full platform recovery, real-phone/PWA acceptance, SMTP, operator/provider/privacy
review and explicit production rollout remain open gates. Optional phase 6 health
tracking and phase 7 voice/pantry are not started by this implementation.
