# WineSnap

Scan a wine label (or type the wine), get producer, grape, flavour profile and food pairings, and build a personal cellar, taste profile, wishlist and social feed.

## Stack

- TanStack Start (React 19, Vite 8) — file routes in `src/routes`
- Tailwind v4 via `src/styles.css`
- Owner-controlled Node runtime (Nitro); no Lovable build/editor dependency.
- Supabase (Postgres + Auth + Storage) — client in `src/integrations/supabase`.
- AI: six Edge Functions call OpenAI or Gemini directly using server-only owned
  keys. Defaults in `supabase/functions/_shared/aiModels.ts`: `gpt-6.1-sol` for
  label/text analysis, `gemini-3.8-flash` for other AI actions. Real provider access
  and deployed responses still require staging verification.

Development continues in Codex. See [the Lovable exit and cutover guide](docs/lovable-exit-2026-10-23.md)
for configuration and remaining infrastructure/data migration. The old published
service is not automatically migrated by these source changes.

## Key surfaces

| Area                                                      | Route                         |
| --------------------------------------------------------- | ----------------------------- |
| Home / scan entry                                         | `/`, `/scan`                  |
| Cellar + statistics                                       | `/cellar`, `/cellar/overview` |
| Wine detail (overview, aromas, pairings, notes, AI picks) | `/wine/$id`                   |
| Personalised suggestions                                  | `/for-you`                    |
| Taste settings                                            | `/taste`                      |
| Wishlist & price watch                                    | `/wishlist`                   |
| Restaurant mode                                           | `/restaurant`                 |
| Social feed & profiles                                    | `/friends`, `/u/$username`    |
| Public share link                                         | `/w/$shareId`                 |

## Backend endpoints

- `POST /api/public/hooks/match-systembolaget` — deterministic catalogue matching;
  no AI call. Requires an authenticated owner and validated input. Producer,
  cuvee, vintage and recorded bottle size must match; ambiguous results require
  explicit confirmation rather than accepting a fuzzy match.
- `POST /api/public/hooks/refresh-cellar-values` and
  `POST /api/public/hooks/refresh-wishlist-prices` — authenticated, owner-scoped
  manual checks. Existing prices are retained when the source fails.
- `POST /api/public/hooks/check-wishlist-prices` — scheduled price check.
  Fails closed with 503 if `CRON_SECRET` is absent and 401 if `x-cron-secret`
  does not match. Reports individual row failures and avoids duplicate unseen
  or non-improving alerts. A deployed, monitored schedule is a separate gate.
- `POST /functions/v1/wine-image` — feature-gated, non-cacheable image proxy
  checking current owner/public-share/erasure access on every request. Backend,
  client flag and restrictive Storage policy must be rolled out together.
- Privacy controls, export and maintenance are separate Edge Functions with
  explicit deployment and operational gates in `docs/privacy-operations.md`.

## Security model

- Row Level Security on every table; all user data scoped to `auth.uid()`.
- Profiles: readable by their owner, plus publicly readable only when `is_public = true`.
- Wines: owner-only, plus public read when `is_public = true` (share links use `share_id`).
- Roles live in `user_roles` and are checked with the `has_role()` security-definer function.
- The service-role client is only loaded inside server handlers, never at module scope.

## PWA / offline

`public/sw.js` caches public bundled assets and an offline shell, not account
HTML, private images or API responses. Navigation is network-only with the
offline shell as a failure fallback; private pages are not available offline.
`AppUpdate` registers the worker outside development. A waiting update activates
only after the user explicitly confirms reloading; obsolete WineSnap caches are
then removed without deleting unrelated caches. Bump the worker version at release.

## Scripts

```bash
npm run dev         # standalone dev server; deliberate public config required
npm run check       # typecheck, ESLint, Vitest and production build
npm run test:bundle # compressed client-asset size budget, after a build
npm run test:security # reject high/critical production dependency advisories
npm run test:database # disposable CI PostgreSQL only, never production
npm run build:check # synthetic Node-runtime check, never deploy this artifact
npm run test:independent
npm start           # real Node artifact; runtime secrets supplied by hosting
npm run dev:chef    # isolated culinary prototype, not the WineSnap app
```

Public build settings: `config/independent/.env.example`. Server settings:
`config/independent/server.env.example`. AI secrets: `supabase/functions/.env.example`.
The old root production `.env` is no longer tracked or loaded by the build.
`npm run check` requires a deliberate real public configuration for its final
build; CI uses `build:check` instead. Deploy the whole `dist/independent-runtime`
artifact, not just static assets. A non-root Docker recipe is included.

## Known limitations

- Automated unit/SQL and hosted image/browser/PWA tests exist. See the dated
  reports in `docs/`; automated Chromium checks do not certify real phones,
  real AI, email delivery or production deployment.
- `WineSnap-test` (`pzniyupmgwvlldvztzqh`) is the disposable hosted test backend.
  Production is separate; never run destructive acceptance against real users.
- The revocable image proxy has been verified only in WineSnap-test. Production
  migration history, old signed/direct URLs, cache retirement, backups and
  coordinated frontend/backend publication remain explicit rollout gates.
- Price data comes from the community `bolaget.io` mirror of the Systembolaget catalogue, not the
  official API. Successful fresh quotes and a monitored price scheduler require
  hosted verification; do not promise an automatic daily price feed beforehand.
- Do not move extensions or replay migration ledgers blindly. Preserve existing
  share IDs/defaults and verify actual schema/history before any change.
- The actual local/test app now has [private recipes and durable Cook Mode](docs/cooking-core-2026-10-24.md)
  and [direct AI Chef with inspectable Food Memory](docs/ai-chef-food-memory-2026-10-24.md)
  at `/kitchen`. These features remain independently gated to WineSnap-test, not
  production. The separate illustrative prototype is not the running app.
- [Food/wine pairing, household preferences and meal history](docs/meals-households-2026-10-25.md)
  are available in the actual local test kitchen, with independent build/database
  gates. Invitations share only explicitly selected diner profiles, never a peer's
  cellar or Food Memory. Snapshot v4 includes all 35 application tables.
