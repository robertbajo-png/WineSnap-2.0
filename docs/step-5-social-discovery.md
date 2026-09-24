# Step 5: Social discovery

Social discovery now reuses public profiles, follows, public wines, and Wine Memory instead of
creating a separate social graph.

## Privacy model

- `derived_preferences` remains private and owner-readable only.
- `user_taste_similarity` contains directional, aggregate results for the requesting user.
- RLS only permits `user_id = auth.uid()` reads.
- Discovery RPCs expose a rounded score, confidence, and shared evidence count, never preference
  keys, values, explanations, or source signals.
- Only public profiles and public wines can appear in discovery.
- Low-evidence results are presented as "not enough shared data" rather than a strong claim.

## Product behavior

- The existing following feed includes an evidence-aware taste-overlap label.
- Discover suggests relevant public profiles and wines from followed or sufficiently similar users.
- Saving a socially discovered wine records a `social` recommendation event and becomes an
  observed Wine Memory signal.
- Following and unfollowing keep using the existing `follows` table and policies.

## Staging acceptance checks

1. Apply all migrations in a disposable Supabase project.
2. Run `supabase/tests/step1_security.sql` through `step5_social_discovery.sql`.
3. Create two public test profiles with at least four reliable overlapping derived preferences.
4. Verify each user can only select similarity rows where they are `user_id`.
5. Verify private profiles and private wines never appear in either discovery RPC.
6. Confirm a low-evidence pair is shown as learning, not as strong overlap.
7. Save a discovered wine and verify one `recommendation_feedback` signal set is created.
8. Follow and unfollow a profile, then verify the feed and discovery controls remain consistent.
