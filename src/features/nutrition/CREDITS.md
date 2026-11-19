# Nutrition Reference Subset

Source: Livsmedelsverkets Livsmedelsdatabas version 2026-07-01.
Retrieved through the [official public API](https://dataportal.livsmedelsverket.se/livsmedel/swagger/index.html).
License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.sv),
as specified by that API's OpenAPI document.

`slv-reference.json` contains a curated subset of 19 public food records and
their original CHO, FIBT, PROT and FAT nutrient records. Numeric values and their
metadata are retained without alteration. Other nutrients are omitted, not set
to zero. Each food includes the original record version, publisher metadata,
retrieval timestamp and a SHA-256 integrity hash over `{food,nutrients}`.
The raw/cooked/dry/as-sold classification is a WineSnap curation field, not a
new publisher measurement. Users must check it against what they weighed.

`catalog.ts` derives a clearly separate application representation. Recipe totals,
portions and ingredient comparisons are WineSnap calculations, not publisher
records or analyses of the finished dish. The curated list is not a comprehensive
product database, cooking-yield model or medical nutrition resource.

The importer is a maintainer action, never a runtime lookup with user ingredients:

```powershell
node scripts/refresh-nutrition-reference.mjs --update
```

The dataset version is deliberately pinned. Newer source records require manual
dataset-version review before importing; the script must not silently relabel
new data with an old version. Attribution remains visible in the recipe panel.

Concepts for EU/US carbohydrate treatment and gram-based portions were reviewed
in the adjacent, user-owned KetoLens source. WineSnap deliberately differs by
preserving unknown values, avoiding ingredient-level rounding and requiring
explicit ingredient-reference and preparation-state confirmation. No KetoLens
health tracking, settings database, meal photo logging or ketone model is copied.
