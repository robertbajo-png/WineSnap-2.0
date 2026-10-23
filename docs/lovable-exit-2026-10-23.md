# Lovable Exit and Codex Development

Date: 2026-10-23. Source candidate; production cutover has NOT occurred.

Later checkpoint on the same date: the original project is accessible again.
Its WineSnap GitHub sync is disconnected, and real database/Auth and image
exports have been downloaded, encrypted and rehearsed locally. See
`lovable-migration-checkpoint-2026-10-23.md`. New production hosting/backend and
owned AI access are still not provisioned; the old public service remains intact.

Local hosting update: an isolated Windows Docker app server is now available
on loopback port 5210 against the disposable hosted test backend. This is not
a public replacement host or a production backend migration. See
`local-windows-hosting-2026-10-23.md` for operation and boundaries.
Its later same-day update records working direct OpenAI text/image scanning in
that local test installation. Gemini and production AI remain separate gates.

The owner requested that WineSnap leave Lovable and continue in Codex. Codex is
the development environment, not the production host, database or model runtime.
No further development or verification is delegated to Lovable.

## Source Changes

- `npm run dev`, `build` and `preview` now use the previously tested standalone
  Vite/TanStack/Nitro Node configuration. `npm start` starts the full generated
  artifact in `dist/independent-runtime`. The old `*:independent` names remain
  compatibility aliases for existing test scripts, not a second implementation.
- Removed the Lovable build dependency, Nitro peer override, unused Cloudflare
  Vite dependency, preview editor/session broker and badge-space observer. Normal
  Supabase auth persistence and refresh remain enabled using its normal storage.
- Removed the tracked production `.env` default. Its old contents were public
  URL/anon configuration, not a server credential. Local `.env` is now ignored.
  Builds require deliberately supplied public settings, even when old root env
  files exist. The CLI project ID is local only, not the old hosted project.
- Removed the remote editor screenshot from social metadata in favor of the
  app's local icon. No UI redesign or product renaming is included.
- All six AI functions use fixed direct provider destinations. Label analysis
  uses OpenAI `gpt-6.1-sol`; other AI actions use Gemini `gemini-3.8-flash`.
  These are native API IDs, without the old `openai/` or `google/` gateway prefix.
- Provider keys are server-only, independent per provider and never redirected
  to a caller-configured URL. Redirects, silent provider fallbacks and automatic
  retries are disabled. Existing auth/quota gates, schemas, grounding and safe
  errors remain. Output is capped at 8192 tokens and each call at 45 seconds or
  less. Missing keys fail closed with 503; timeouts return 504. Ask records the
  actual configured model ID. This is not a global spend ledger or cost cap.
- OpenAI requests explicitly use `store: false`. This does not promise zero
  provider retention or EU-exclusive processing.
- GitHub CI exercises the default standalone build, with synthetic configuration
  and secret canaries. It never uses or deploys the real production database.
- Added a provider-neutral, non-root Node Docker image recipe with allowlisted
  build inputs. No local credential files enter the Docker context. The health
  route reports process liveness only, not database/model readiness.

## Runtime Configuration

1. Public browser build values: copy `config/independent/.env.example` to
   `config/independent/.env.local`, or supply the allowlisted `VITE_*` environment
   settings through the build host. Required: owned Supabase URL and publishable
   key. Never use a service-role key in a public slot.
2. Node server runtime: use `config/independent/server.env.example` as a reference
   for the hosting secret manager. Do not put it in the browser config directory.
   Server URL/key must refer to the same project as the browser build. Price
   schedules need their own secret and a separately monitored scheduler.
3. Hosted Supabase Edge Functions: configure `OPENAI_API_KEY` and `GEMINI_API_KEY`
   in the destination project's secret manager. Optional `OPENAI_LABEL_MODEL`
   and `GEMINI_FAST_MODEL` pin native provider model IDs. Do not reuse or fall
   back to `LOVABLE_API_KEY`. The model/endpoint contracts must be reaccepted
   whenever these pins change.
4. Deploy every required Edge Function to the explicitly verified destination,
   not merely the frontend. See `supabase/config.toml` and existing privacy/image
   rollout guides for JWT, image, maintenance and deletion gates.

```sh
npm ci
npm run typecheck
npm run lint
npm test
# Safe synthetic artifact only; no live services or writes:
npm run build:check
npm run test:independent
npm run test:bundle

# Real build requires explicit owned public configuration:
npm run build
# The runtime secret manager supplies server settings:
npm start
```

Deploy the whole `dist/independent-runtime` directory. A TLS reverse proxy or
hosting platform must terminate HTTPS for camera/PWA support. A Docker image can
also be built with public `--build-arg VITE_SUPABASE_URL=...` and
`--build-arg VITE_SUPABASE_PUBLISHABLE_KEY=...`; inject server secrets only at run
time. Keep operational flags off until coordinated acceptance. Docker execution
itself is not verified unless recorded below.

## Safe Cutover Order

1. Establish source ownership/export access. The previous release audit could not
   access the current Lovable project or the source Supabase production project
   `mervdrbnwgreaifobasw`. Do not fabricate data or replace users with test users.
2. Inventory and export actual schema, data, Auth user IDs/password hashes,
   identities/provider settings and Storage bytes/metadata. Include receipts,
   erasure jobs and journals, share IDs, functions, cron and email configuration.
   A SQL dump alone is not a complete application backup.
3. Reconcile native Supabase and Drizzle histories before applying anything.
   Restore to an isolated owned staging project; reconcile counts and samples,
   preserve IDs and shares, remap stored image paths safely, and reapply erasure
   receipts so deleted data cannot reappear. Do not replay all migrations blindly.
4. Deploy the same candidate to owned staging hosting and Edge Functions, with
   owned provider keys, approved processor terms, redirects, mail, quotas and
   schedules. Test actual scan/AI/save, existing share links, revoked images,
   account recovery, deletion, backups and phone/PWA camera behavior.
5. Freeze source writes, take a final reconciled export/restore, define rollback
   and switch the approved domain only after acceptance. Retain the old service
   read-only during the agreed rollback window; do not allow unsynchronised
   writes to two databases. Different origins require re-login and PWA reinstall;
   do not transfer browser tokens through query strings or editor messages.
6. In the actual owned Lovable project, disconnect this repository's GitHub sync
   so later Lovable edits cannot overwrite Codex work. Do not revoke an entire
   GitHub app installation used by other projects. Remove old hosting and revoke
   obsolete gateway access only after backup, rollback and new runtime verification.

## Current Boundaries

- The WineSnap project's two-way GitHub sync is now disconnected and confirmed
  in the project UI. The account-wide GitHub installation was not removed, so
  other projects remain unaffected. DNS/hosting, billing and the Lovable project
  itself were not changed. The published `wine-scene-snap.lovable.app` site
  remains the old service during migration.
- `WineSnap-test` (`pzniyupmgwvlldvztzqh`) remains disposable test infrastructure,
  not a replacement production database. Existing encrypted test keys are reused
  without requesting them again. No real production data is changed.
- No owned direct-provider key is available in this checkout. Provider transport
  and error contracts are tested with synthetic HTTP, not real AI inference.
- A new hosting/domain account has not been provisioned or purchased. Existing
  privacy/backup/scheduler/device production gates still apply. Migration is not
  certified complete until the data and actual deployed system pass acceptance.
- The signed-in Supabase organization cannot create a third free project: its
  two-project allowance is already used. No existing project was paused,
  deleted, upgraded or repurposed. This is an observed account limit, not an
  inferred deployment failure.

## Verification on 2026-10-23

- TypeScript and ESLint pass. All 522 Vitest tests in 74 files pass, including
  actual isolated Edge handlers for the six provider paths, missing-key 503s,
  output budgets, timeouts, auth denial and non-retry/provider-key isolation.
- Lockfile regeneration removes 95 obsolete package entries, adds none and
  changes no retained package versions. Production audit: no high, critical or
  moderate findings; the previously documented low esbuild advisory remains.
- Default Node synthetic build and portable artifact smoke pass, including the
  new non-cacheable health route and existing API auth/cron guards. Client asset
  budget passes; largest compressed JS asset in the test build is 107,463 bytes.
- An actual clean Linux Docker build runs strict `npm ci` using the updated lock
  and the default production build with synthetic public values. The non-root
  container reaches `healthy`, serves six SSR pages, manifest, worker and icon,
  returns health 200 with `no-store` and unknown-route 404. The disposable
  container is stopped afterward. No provider or production credentials are used.
  Docker emits a name-based warning for the _public_ publishable-key build ARG;
  a service-role/secret key must never be passed there.
- Actual standalone WineSnap with the disposable hosted test backend passes all
  34 page/viewport accessibility and overflow checks at 390px and 1440px. Normal
  password login works without the removed editor broker. Mobile and desktop
  screenshots are visually inspected; no badge offset or broken image is present.
- All 25 actual built-app image, sharing/revocation, camera and PWA browser
  scenarios pass; test fixtures and processes are cleaned afterward. Camera video
  is synthetic Chromium media, not a physical iPhone/Android camera certification.
  These browser suites deliberately block AI endpoints and do not verify live AI.
- Local evidence is in ignored `dist/lovable-exit-unit-report.json`,
  `lovable-exit-audit-report.json`, `release-ui-report.json` and
  `hosted-image-mobile-report.json`. No key or synthetic password is committed.

## Provider References

Verified against [OpenAI's GPT-6.1 Sol documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
the [Chat Completions request contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
and [Google's OpenAI-compatible Gemini endpoint](https://ai.google.dev/gemini-api/docs/openai).
The existing label schema uses Chat Completions without tool calling; Gemini
retains the existing function-call contract. Availability for the owner's account
and quality/latency on real labels remain deployment acceptance checks.
