# Step 1 security rollout

This rollout must be rehearsed in a disposable Supabase project before it is
applied to the WineSnap production database.

## What Step 1 changes

- The `wine-labels` bucket becomes private.
- Owners and visitors to explicitly shared wines receive one-hour signed image
  URLs instead of permanent public URLs.
- Existing image URLs are connected to `wine_photos` during migration so old
  public shares keep working.
- All AI Edge Functions require a valid user JWT.
- AI requests use an atomic, per-user quota stored in `ai_rate_limits`.
- GitHub Actions runs type checking, lint, unit tests, and a production build.

## Staging rehearsal

1. Create a separate Supabase project containing no production user data.
2. Link the Supabase CLI to that project.
3. Apply every migration from scratch with `supabase db reset` locally, or
   `supabase db push` against the disposable remote project.
4. Run `supabase/tests/step1_security.sql` in the SQL editor or with `psql`.
5. Deploy the four AI functions: `analyze-wine`, `restaurant-match`,
   `taste-suggestions`, and `wine-suggestions`.
6. Set the same gateway secrets used by production, but use staging credentials
   and limits where the provider supports them.
7. Test with two separate users and one signed-out browser session.

## Required acceptance checks

- User A can view their own private bottle image.
- User B and a signed-out visitor cannot read User A's private bottle image by
  storage path.
- User B and a signed-out visitor can view the image after User A enables the
  wine's public share.
- Disabling that share blocks creation of new signed URLs. Already issued URLs
  expire after at most one hour.
- All four AI functions return `401` without a valid JWT.
- The request after each function's configured quota returns `429` and a
  `Retry-After` header.
- Existing `wines.share_id` links still resolve after all migrations.
- `npm run check` passes before deployment.

## Production rollout

Take a database backup, apply the migration during a low-traffic window, deploy
the four functions, then deploy the frontend. Verify one private image, one
public share, and one AI request immediately after release. Roll back the app
deployment if signed image creation fails; do not make the bucket public as a
workaround.
