# WineSnap

Scan a wine label (or type the wine), get producer, grape, flavour profile and food pairings, and build a personal cellar, taste profile, wishlist and social feed.

## Stack

- TanStack Start (React 19, Vite 7) — file routes in `src/routes`
- Tailwind v4 via `src/styles.css`
- Lovable Cloud (Postgres + Auth + Storage) — client in `src/integrations/supabase`
- AI: `openai/gpt-5` for label/text analysis, `google/gemini-3-flash-preview` for suggestions, restaurant matching and Systembolaget matching

## Key surfaces

| Area | Route |
| --- | --- |
| Home / scan entry | `/`, `/scan` |
| Cellar + statistics | `/cellar`, `/cellar/overview` |
| Wine detail (overview, aromas, pairings, notes, AI picks) | `/wine/$id` |
| Personalised suggestions | `/for-you` |
| Taste settings | `/taste` |
| Wishlist & price watch | `/wishlist` |
| Restaurant mode | `/restaurant` |
| Social feed & profiles | `/friends`, `/u/$username` |
| Public share link | `/w/$shareId` |

## Backend endpoints

- `POST /api/public/hooks/match-systembolaget` — AI matches a wishlist wine to a Systembolaget product.
  Requires a valid Supabase `Authorization: Bearer <access_token>`; input validated with Zod;
  8s catalogue timeout, 20s AI timeout; only matches with confidence ≥ 55 are accepted.
- `POST /api/public/hooks/check-wishlist-prices` — scheduled price check.
  Optional `x-cron-secret` header (set the `CRON_SECRET` server secret to enforce it);
  paginates the whole wishlist (200/page, 2000/run), collects per-row errors,
  and never re-sends an alert that is still unseen or that isn't a better price.

## Security model

- Row Level Security on every table; all user data scoped to `auth.uid()`.
- Profiles: readable by their owner, plus publicly readable only when `is_public = true`.
- Wines: owner-only, plus public read when `is_public = true` (share links use `share_id`).
- Roles live in `user_roles` and are checked with the `has_role()` security-definer function.
- The service-role client is only loaded inside server handlers, never at module scope.

## PWA / offline

`public/sw.js` caches static assets (cache-first, refreshed in background) and page navigations
(network-first, falling back to cache then `public/offline.html`). API and server-function traffic is
never cached. The worker self-updates: a new build installs and activates without a hard refresh.
Registration happens in `src/routes/__root.tsx` and is skipped in development.

## Scripts

```bash
bun run dev      # dev server
bun run build    # production build
bun run lint     # eslint (currently clean: 0 errors, 0 warnings)
bun run format   # prettier
```

## Known limitations

- No automated test suite yet (login, scan, cellar, sharing, recommendations and wishlist are
  verified manually). This is the largest remaining gap.
- One shared database serves both preview and production; there is no separate test project,
  so RLS/JWT verification is done against real data with care.
- Price data comes from the community `bolaget.io` mirror of the Systembolaget catalogue, not the
  official API. Swap `fetchPrice()` in the cron route if that changes.
- The database linter reports one pre-existing warning: an extension installed in the `public`
  schema (used by `wines.share_id`). Moving it would invalidate existing share links.
