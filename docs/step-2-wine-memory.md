# Step 2: Wine Memory foundation

Wine Memory now separates three concerns that were previously mixed together:

- `taste_signals` stores evidence and provenance from explicit profile choices,
  structured tasting notes, ratings, and natural-language feedback.
- `derived_preferences` contains deterministic aggregates with confidence,
  evidence count, and recency weighting.
- `taste_profile` remains the backwards-compatible summary used by existing
  screens, with added memory depth and confidence fields.

Natural-language feedback is processed by `extract-preference-signals`. The
model may only return a strict set of attributes and directions. Its output is
validated twice, stored as evidence, and then aggregated by SQL. The model does
not write a free-form permanent user profile.

## Staging acceptance checks

1. Apply all migrations in a disposable Supabase project.
2. Run `supabase/tests/step1_security.sql` and
   `supabase/tests/step2_wine_memory.sql`.
3. Confirm that existing profile choices and tasting notes are backfilled.
4. Save a structured tasting note and verify its rating, dimensions, aromas,
   grapes, region, producer, and wine type become signals.
5. Save feedback such as "I liked the fruit but it was too sweet" and verify
   the raw pending statement is replaced by validated extracted signals.
6. Confirm another authenticated user cannot read either table.
7. Generate recommendations and verify reliable memory evidence is included,
   while a new user receives the cold-start message.
