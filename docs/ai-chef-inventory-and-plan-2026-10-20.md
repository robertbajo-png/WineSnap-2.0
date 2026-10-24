# WineSnap to AI Chef: Repository Inventory and Implementation Plan

Date: 2026-10-20. Status: source inventory completed; proposals await approval.

Historical inventory. The owner subsequently approved phase 2. See the
[2026-10-24 cooking-core implementation](cooking-core-2026-10-24.md) and
[latest local operations](local-windows-follow-up-2026-10-24.md).
The foundation now uses the standalone Windows Node runtime, not the old build wrapper.

## 1. Scope and Evidence

Reviewed GitHub `main` at `50b49c9f95be209831432eb67c619abf1e716b2a`
against the [new master brief](AI_CHEF_COOK_MODE_KETOLENS_MASTER_BRIEF.md).
Its application source is identical to `5ae6072`; the two later commits add the
brief only. Existing release reports are historical evidence, not fresh hosted
acceptance. No application code, migrations, secrets, user records, infrastructure
or production settings were changed during this inventory.

The adjacent local `KetoLens` source was inspected read-only for reuse. It has no
committed HEAD and has staged/local work; it is not a verified GitHub release or
an approved import. No files or private journal records were copied from it.

Fresh checks of the existing WineSnap source:

| Check                     | Result and limitation                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest                    | 370 tests pass in 59 files                                                                                                                                                                                                            |
| TypeScript                | `tsc --noEmit` passes                                                                                                                                                                                                                 |
| ESLint                    | Passes; generated local `node_modules.release-backup/**` excluded                                                                                                                                                                     |
| Production build          | Client, SSR and Nitro/Cloudflare output pass; 2,532 client modules                                                                                                                                                                    |
| Build warnings            | Main client chunk 568.25 kB, 174.51 kB gzip; dependency directives, unknown Nitro/Rollup `platform` option and overridden Wrangler entry warnings remain                                                                              |
| Independent clean install | GitHub [Quality for the audited main revision](https://github.com/robertbajo-png/WineSnap-2.0/actions/runs/39463938761) passes `npm ci`, typecheck, lint, tests and build                                                             |
| Local dependency fidelity | `node_modules` is a junction to `WineSnap-scan-review`; installed Lovable build wrapper is 2.23.1, lock/manifest require 2.25.3. Local checks are not a lock-exact clean-install proof. No install was performed through the junction |
| SQL/restore               | Scripts and 11 invariant files inspected; October 13 report records 33 migrations and synthetic restore passing. Not rerun in this inventory                                                                                          |
| Hosted/device checks      | Not performed: no fresh authenticated database, Storage, AI-provider, camera, Safari, installed-PWA or visual acceptance                                                                                                              |

Useful fresh-check commands, with a configured Node/npm environment:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

Use `npm ci` in a fresh isolated checkout for reproducibility, not through the
existing dependency junction. Do not call the current build Lovable-independent:
it still imports Lovable's build wrapper.

## 2. Executive Decision

Keep this repository, React/TanStack and the working wine domain. Build new food
capabilities alongside them, behind disabled flags. Do not rewrite WineSnap as
Expo and do not merge the separate KetoLens application wholesale.

The first usable release should contain a cookbook, structured recipe detail,
real resumable Cook Mode, and context-aware AI Chef with inspectable Food Memory.
Existing wine functionality stays available. Household support, advanced keto,
fridge recognition, voice and payments are not prerequisites for that release.

There are two independent tracks: product development and removal of Lovable
dependencies. A local design prototype needs neither a production database move
nor new user-data collection. A public replacement needs verified owner-controlled
infrastructure and a separately approved cutover.

## 3. Current Architecture and Reuse Map

| Area              | What is actually present                                                                                                                                                           | Decision / missing work                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend          | React 19, TypeScript, TanStack Start/file routes, Vite 7, Tailwind 4, Radix UI, Lucide, Zod, React Hook Form; route loading largely uses local effects/state                       | Retain stack and accessible primitives. Do not mistake an installed React Query package for an established application-wide query layer    |
| Navigation/design | `AppShell`, `BottomNav`, `styles.css`: wine-first five-position navigation, prominent scan action, dark burgundy/gold theme; main width 448 px, 720 px at desktop breakpoint       | New scoped culinary shell and tablet Cook layout; retain wine routes. Do not globally recolor all screens in one patch                     |
| Localization      | English/Swedish catalog and language provider in `src/i18n`                                                                                                                        | Extend the same catalogs; audit hard-coded strings and document language when changing shell                                               |
| Auth              | Supabase browser session, account-change handling, login/signup/reset routes, server JWT validation, Auth-linked profiles and roles                                                | Retain security patterns. Verify SMTP, OAuth, redirect allowlists and signing configuration before any domain/project move                 |
| Wine scan         | `LiveCamera`, cropper, `scan.tsx`, label validation; identity evidence separated from estimated taste; pending image is a local Blob, uploaded on explicit save                    | Reuse camera/crop/error infrastructure, not wine-label prompts or schema for food recognition                                              |
| Cellar/detail     | Stock, ratings, tasting notes/aroma intensities, photos, collector lots, prices, drinking-window estimates, legacy/public shares                                                   | Preserve unchanged with regression coverage; keep old URLs reachable                                                                       |
| Wine Memory       | SQL `taste_signals`, `derived_preferences`, `taste_profile`; source/confidence/evidence/status, deterministic aggregation, time weighting, tasting/profile/recommendation triggers | Reuse evidence pipeline pattern. Existing attributes, references and extraction are wine-specific, not a general food-memory engine        |
| Memory controls   | `/taste` edits stated wine settings; feature-gated `DataControls` can reset learned memory                                                                                         | No dedicated evidence browser or per-memory confirm/correct/forget UX found. Read-only signal grants do not provide those write operations |
| Chat              | `/ask`, Markdown rendering and viewport, private `ai_conversations`/`ai_messages`, atomic `store_ai_exchange`; bounded history and wine context                                    | Reuse UI/storage contracts. Extend validated context union; do not merely rename the sommelier system prompt                               |
| Recommendations   | Shared deterministic wine scoring, evidence bands, feedback events, source-linked candidate catalog                                                                                | Retain wine engine; build separate food scoring and hard exclusions. Curated wine catalog has 12 identities, not global product coverage   |
| Social            | Public/private profiles, follows, feed, similarity/discovery RPCs                                                                                                                  | Keep wine sharing boundaries. No basis to publish meals, household data or health-related preferences automatically                        |
| Restaurant        | Menu photo/text extraction, constraints, deterministic ranking, saved `restaurant_scans`                                                                                           | Reuse input/review patterns. It is not a recipe engine or cooking-session store                                                            |
| Server            | Four TanStack HTTP routes for prices/matching; six Deno AI functions, three privacy functions; shared auth/quota helpers                                                           | Keep two existing runtime boundaries initially; share pure domain modules, avoid a new microservice framework                              |
| Pricing           | Deterministic, identity/size/vintage-aware matching against `api.bolaget.io`; authenticated manual routes and fail-closed cron                                                     | Retain, explicitly separate retail estimates from investment valuations; source reliability remains an external gate                       |
| Privacy           | Disabled analytics, gated export/reset/erasure, durable erasure jobs/receipts, bounded retention, restore operation                                                                | Reuse scaffolding, extend every inventory/retention/deletion/export path for new tables and files; implementation is not deployment proof  |
| Offline/PWA       | Manifest, explicit update dialog, static-asset cache and offline shell; account HTML and APIs not cached                                                                           | Not an offline recipe/session engine. Add deliberate private offline persistence and account-switch cleanup for Cook Mode                  |
| Payments          | No subscription, checkout, webhook or entitlement schema/implementation found; roles and short-window quotas exist                                                                 | Preserve quotas; no commercial integration or unlimited-usage promise without approval                                                     |
| Quality/deploy    | GitHub Quality workflow; local SQL/restore scripts; Cloudflare-shaped build output                                                                                                 | No checked-in independent deploy workflow or complete authenticated browser E2E suite; clean build alone is not release readiness          |

Source anchors: [package](../package.json), [shell](../src/components/AppShell.tsx),
[scan](../src/routes/scan.tsx), [camera](../src/components/LiveCamera.tsx),
[chat](../supabase/functions/ask-winesnap/index.ts),
[memory schema](../supabase/migrations/20260924090000_add_wine_memory_foundation.sql),
[scoring](../supabase/functions/_shared/recommendationScoring.ts),
[privacy operations](privacy-operations.md), [service worker](../public/sw.js).

### Data model and migration discipline

There are 33 SQL migrations defining 20 public application tables: profiles,
roles, wines, taste profile, tasting notes, wishlist, analytics, photos, follows,
restaurant scans, AI quotas, signals, derived preferences, conversations/messages,
recommendation events, taste similarity, collector lots and two privacy tables.
Storage bucket/policy SQL is separate from the object bytes themselves.

`drizzle/schema.ts` is intentionally blank. The two generated Drizzle migrations
mirror retail/wishlist SQL also present in `supabase/migrations`. Historical
production evidence records them in the platform Drizzle ledger but not the
native Supabase ledger. Reconcile actual schema/history using verified evidence
before native CLI deployment; never replay them just because a ledger lacks rows.
See [October 10 report](release-hardening-2026-10-10.md).

Generated Supabase client types cover 18 public tables but not the two new
service-only privacy tables/RPCs. Regenerate from the verified target schema as
part of deployment work, not from an assumed database state. The pending aroma
column artifact is documented as already applied, not a fresh migration to run.

The root README is not a reliable current inventory: it still says there is no
automated test suite, names older AI defaults, describes optional scheduler-secret
enforcement and cached account navigations. Current source/tests show the opposite
for those behaviors. Repair documentation without weakening the implemented guards;
do not treat older release claims as current production verification.

## 4. Lovable Dependency / Exit Audit

Classification refers to the target architecture, not permission to remove today.

| Dependency                 | Evidence                                                                                                                | Classification / action                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build wrapper              | `package.json`, `vite.config.ts` import `@lovable.dev/vite-tanstack-config`                                             | Replace. Explicitly own React, TanStack, Tailwind, alias, env, SSR and deployment plugin configuration; compare build and route parity. Do not add duplicate plugins underneath the existing wrapper       |
| Local tooling              | Wrapper hides environment/sandbox/dev behaviors; Wrangler is not a direct manifest dependency                           | Replace implicit behavior with documented, pinned standard tooling and clean-checkout commands                                                                                                             |
| AI gateway                 | All six AI functions fetch `ai.gateway.lovable.dev/v1/chat/completions` with server-side `LOVABLE_API_KEY`              | Replace in the independent candidate with direct provider adapters. Leave current production functions untouched until approved cutover                                                                    |
| AI model IDs/contracts     | `_shared/aiModels.ts`: `openai/gpt-6.1-sol`, `google/gemini-3.8-flash`; strict label JSON vs forced-tool/text contracts | Gateway IDs are source configuration, not proof of live access or direct-provider compatibility. Translate requests/responses deliberately, evaluate exact configured models, no silent model substitution |
| Migration configuration    | `drizzle.config.ts` reads `LOVABLE_DB_MIGRATION_URL`                                                                    | Replace platform-only migration entry point after reconciling dual ledgers; keep historical files, do not overwrite migration history                                                                      |
| Database/Auth/Storage      | Supabase SDK and configured production project `mervdrbnwgreaifobasw`; README describes Lovable Cloud                   | Retain temporarily. Protocol/source is portable; account ownership, transfer/export rights, region, backups and management access are unverified                                                           |
| Edge Functions             | `supabase/functions`, `supabase/config.toml`                                                                            | Retain source, deploy separately to the approved owner-controlled target. Frontend publication does not deploy these functions                                                                             |
| Hosting/domain             | Historical published URL `wine-scene-snap.lovable.app`; no owned-domain deployment manifest/evidence                    | Replace for candidate, retain old production site during migration. `lovable.app` itself cannot be assumed transferable                                                                                    |
| Preview Auth broker        | `previewAuthStorage.ts`, browser client import                                                                          | Replace for independent runtime; it already falls back to localStorage outside recognized editor frames. Never migrate tokens through arbitrary parent windows                                             |
| UI badge/metadata          | `HostBadgeSpace`, root OpenGraph/Twitter image from external R2 preview URL                                             | Remove platform layout adapter from independent shell; replace share image with an owned asset. Do not modify the old hosted badge or infer control of its R2 account                                      |
| Privacy/client diagnostics | Privacy provider disclosures and missing-env errors mention Lovable                                                     | Update only when processing/runtime really changes, not preemptively                                                                                                                                       |
| Portable source            | React components, pure TypeScript, SQL, Supabase client protocols, tests, bundled wine assets                           | No necessary Lovable execution dependency. Retain; verify asset provenance before rebranding/public redistribution                                                                                         |
| `.lovable/plan`            | Historical design document                                                                                              | No runtime dependency. Keep history or archive; deleting it does not migrate infrastructure                                                                                                                |

Important correction: leaving the Lovable editor is not the same as taking control
of its managed cloud resources. No owner access, transfer mechanism or full export
capability has been confirmed in this audit.

## 5. KetoLens Reuse Assessment

Inspected local paths relative to `../KetoLens`:

| Candidate                                        | Reuse value                                                                                                  | Boundary                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/domain.ts` and `tests/domain.test.ts` | EU/US carbohydrate conventions, portion-by-grams, totals, timezone/date handling and finite-value validation | Port pure functions/tests after review; keep unknown nutrition distinct from zero and avoid premature rounding during aggregation                                   |
| `src/types/index.ts`                             | Original vs confirmed estimates, provenance, meal and measured-blood-BHB separation                          | Adapt into server-validated contracts with ownership; current ketone type supports blood BHB only, not breath/urine                                                 |
| `src/features/recipes/library.ts`                | Four structured starter recipes, nine source-labeled reference ingredients                                   | Small seed/demo library, not a licensed comprehensive nutrition API or validated food-safety corpus. Audit cooking state, yields, allergens and image rights        |
| `src/services/ai.ts`                             | Interfaces and honest demo states                                                                            | Actual scanner returns no recognized ingredients; coach is fixed local logic. No real AI integration to transfer                                                    |
| Repository/persistence                           | Local-first write/error-handling patterns                                                                    | Native Expo SQLite and browser localStorage are single-profile; no authenticated cloud sync. Do not import the singleton journal database as the new shared backend |
| Expo UI/camera/health                            | Interaction ideas and source patterns                                                                        | Not drop-in React DOM components. Health service is unavailable/demo; no working HealthKit/Health Connect integration to claim                                      |
| Export/photos                                    | User-control patterns                                                                                        | Export includes photo references rather than portable photo bytes; WineSnap's v2 export pattern is more relevant                                                    |

No local KetoLens tests or APK/device checks were rerun here. Preserve its staged
work. Freeze and approve a source snapshot/license inventory before extracting
anything; do not introduce Expo dependencies into WineSnap for these calculations.

## 6. Proposed Target Architecture

Keep one modular app, not separate food/wine/keto applications:

```text
React/TanStack mobile PWA + tablet Cook layout
  culinary shell | existing Wine routes | account/privacy
  pure recipe/quantity/timer logic | versioned private offline session store
         |
JWT-authenticated server/Edge domain actions
  recipe validation | cook-session transitions | consent/scope checks
  food memory | existing wine memory | authorized contextual retrieval
         |
Owner-controlled Postgres/Auth/private Storage + explicit migrations
         |
Server-only AI adapters -> direct provider APIs
  schema validation, bounded tokens/time, safe error codes, cost metadata
```

Preferred initial hosting candidate: independently managed Cloudflare Workers for
the existing SSR/API output, with separately administered Supabase for database,
Auth, Storage and Edge Functions. This minimizes source changes versus a new
database/auth stack. Existing config is only a starting point, not a deploy proof.
If account ownership/runtime compatibility prevents that choice, evaluate a
standard Node host for the same TanStack app before considering a rewrite.

### Domain rules

- Keep existing wine tables/contracts stable. Add food tables rather than adding
  recipe columns to `wines` or changing wine CHECK constraints to accept food.
- Keep durable recipe versions immutable. A cooking session pins one version;
  AI adaptations create proposals/variants and require explicit acceptance.
- Preserve source quantities/units; calculate servings/conversions deterministically.
  Time, leavening, pan geometry and safe temperatures do not scale linearly with
  ingredient amounts. Maintain reviewed rules for these exceptions.
- Model timers with persisted deadlines and paused remaining time, not an interval
  counter. Reconcile on resume/clock changes, recover elapsed state, and mark
  background alarm delivery as best-effort until device-tested. Persist active
  step and session revision; reject conflicting updates, do not silently merge them.
- Store offline sessions privately, partition by account, and purge on sign-out,
  erasure and account switch. Offline cooking uses a downloaded recipe snapshot;
  offline AI is unavailable, never a pretend response. Use an explicit sync/conflict
  policy; restarting the app must not resurrect an erased account's session.
- Separate culinary restrictions, optional nutrition preferences and measured
  health data. Exclude sensitive fields from generic prompts/social similarity.
  Review collection purposes/consent and applicable obligations before enabling
  health-related production records; a settings toggle is not a compliance proof.
- Start with scoped SQL retrieval, not a vector store. Wine chat currently retrieves
  up to 30 recent wines, 20 preferences and 12 messages, with a 24,000-character
  context cap; it cannot substantiate exhaustive claims about an entire cellar.
  Add targeted owner-filtered queries for full-history questions before extending
  that pattern to a large cookbook.
- User recipe notes, imported recipes, label text and model output remain untrusted
  data. Chat cannot directly execute writes. Allowlisted server actions validate
  ownership, constraints, version and user confirmation independently.

### Additive table proposals, not migrations

| Proposed table/group                                        | Minimum fields and invariants                                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipes`                                                   | id, owner_id, title, current_version_id, source/provenance, timestamps; private by default                                                                                                           |
| `recipe_versions`                                           | recipe_id, version, parent_version_id, servings, validated ingredient/step/equipment structure, safety-reference version, source and accepted_by; unique recipe/version and same-owner relationships |
| `cooking_sessions`                                          | owner_id, recipe_version_id, status, active_step_id, servings, session adaptations, revision, started/finished/synced_at; immutable base-version reference                                           |
| `cooking_timers`                                            | owner/session/step, stable name, state, deadline_at, remaining_ms, revision; positive bounded durations and account-scoped actions                                                                   |
| `cooking_feedback`                                          | owner/session, original note/rating, observed_at; one source for later signals, retry-idempotent ingestion                                                                                           |
| `food_signals`, `food_preferences`, `food_memory_overrides` | subject/owner, attribute/direction, evidence/source id, confidence, status, observation/derivation timestamps; deterministic rebuild and explicit corrections/tombstones                             |
| `meal_wine_links`                                           | owner/session/wine, separate food/wine/pairing feedback; ownership checks for both sides, no implicit public share                                                                                   |
| Later: households/members/profiles                          | Actual authenticated members, invitation/role boundaries and separately represented dependent profiles; no default exposure of personal history or health data                                       |
| Later: ingredient/nutrition references                      | stable source record/version, preparation state, units, per-100g basis, EU/US convention, allergens/provenance/uncertainty; unknown values remain nullable                                           |
| Later: dietary settings, logged meals, ketone measurements  | explicit optional collection, method/unit validation, isolated grants/retention/export; not shared wine-profile columns                                                                              |

Use owner/parent composite constraints or equivalent verified triggers so a supplied
foreign ID cannot link another user's recipe/session. Add restrictive RLS with
`USING` and `WITH CHECK`, indexes, bounded payloads and Auth-deletion behavior.
Extend privacy export allowlists, memory reset scopes, erasure, Storage cleanup,
restore receipts and offline cleanup in the same phase as each new table.

### Endpoint and context proposals

Reuse existing Supabase user-JWT/client conventions; names below are proposals.
All mutating requests require authenticated authorization, bounded validated input,
idempotency keys where retried and expected revision for concurrent updates.

| Action                | Request -> response                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipe-generate`     | ingredients, servings, time/equipment/confirmed restrictions -> validated unsaved draft, provenance, unknowns/warnings, request id                                     |
| `recipe-save-version` | draft or accepted adaptation, recipe id, expected revision -> durable immutable version id                                                                             |
| `cook-session`        | start/resume/advance/pause/complete, version/session, expected revision -> authoritative session state and timers                                                      |
| `cook-timer`          | session, timer, start/pause/resume/cancel, expected revision -> persisted timer state                                                                                  |
| Contextual Chef       | extend conversation domain/context with recipeVersionId/sessionId/stepId or existing wineId -> answer plus optional structured proposals; never arbitrary state writes |
| `cooking-feedback`    | session, note/rating, idempotency key -> saved feedback then validated extraction result/status                                                                        |
| `food-memory-control` | evidence/preference id, confirm/correct/forget and expected revision -> recomputed owner-only memory                                                                   |

Keep old Ask WineSnap clients compatible during rollout. Server resolves referenced
objects itself; never trusts a client-supplied user ID or claimed household scope.
Use a discriminated context union instead of arbitrary prompt JSON. Do not send
an entire family journal or all health measurements to answer a step question.

### Text Wireframes for the Design Phase

These are structural proposals, not implemented or visually verified screens.

```text
Home:    editorial dish image + What shall we cook?
         compact prompt/ingredients entry
         real recent session or honest empty state; one relevant suggestion

Kitchen: Cookbook | Ingredients
         search/filter + unframed recipe list
         workbench: ingredient chips + time/equipment/servings + generate action

Recipe:  dish image/title + servings/time + optional supported nutrition
         Ingredients | Method | Your versions
         stable Start cooking action

Cook:    step 3 of 7 + dish name + pause/exit
         current instruction, relevant quantities, optional safety reference
         named timers; Previous / Next; contextual Help
         tablet: ingredients alongside current step; phone: sequential layout

Wine:    existing cellar/scan/recommendations, unchanged deep links
You:     preferences, Food/Wine Memory, privacy; optional Keto setting
```

Proposed primary navigation: Home | Kitchen | Cook | Wine | You. Cook opens the
active session or a meaningful recipe picker, never a dead tab. Camera becomes an
explicit contextual action inside Wine/Kitchen. Prototype empty/error/loading,
keyboard, large-text, no-wine and keto-disabled states; use real licensed/bundled
food imagery and scoped tokens, not only a static mood board.

## 7. Safe Independent Migration and Release Plan

1. Establish owner access: hosting/DNS, database/Auth/Storage management, exports,
   deployed function versions, gateway usage, provider accounts and billing. A
   publishable client key is not management access. Record what can and cannot be
   exported from the current managed platform; no transfer is assumed possible.
2. Freeze an inventory of schema, grants/RLS, triggers/extensions, users/UUIDs,
   Auth settings/providers/SMTP, buckets/object paths/counts/checksums, public share
   IDs, deployed functions, cron/Vault configuration and migration ledgers. Keep
   credentials and real export data outside Git, chat and unprotected logs.
3. Prove export/restore in an isolated owner-controlled staging environment. Copy
   actual Storage bytes and policies, not just metadata. Reapply the independently
   retained erasure ledger before access opens. Existing synthetic PostgreSQL
   template-copy tests do not prove this hosted process.
4. Verify identity migration feasibility. Supabase documents migrating users and
   password hashes when Auth-schema export is available; this managed source's
   access is not yet established. Preserve UUIDs and owner links; test login,
   password reset, OAuth and redirects using synthetic accounts. Plan explicit
   reauthentication for a new origin/project; do not promise token/session carryover
   or rotate/copy JWT secrets casually. If hashes cannot be exported, propose a
   user-notified recovery/re-enrollment path and obtain approval first.
5. Build independent candidate: replace wrapper, pin tooling, provision secrets
   securely, deploy unchanged wine contracts and direct-provider adapters to
   staging. Test each of the six AI flows separately. Keep privacy RPC-before-Edge
   deployment ordering; updated AI access fails closed if the privacy RPC is absent.
6. Add GitHub CI for SQL invariants, real staged JWT/Storage checks and browser E2E
   with disposable accounts. Deployment uses protected environments, least-privilege
   credentials, preview/staging targets and explicit production approval. No new
   auto-deploy from arbitrary pushes to main.
7. Define parity gates: old share links/identifiers, private/shared images, owner
   isolation, stock/ratings/history, collector constraints, prices/failure states,
   memory/chat, export/deletion, reset mail, AI quality/cost and installed PWA.
8. Request separate cutover approval. Keep old resources until validated final
   snapshot and data reconciliation. If moving databases, pause writes and workers,
   sync final deltas, check counts/checksums and switch one authoritative writer.
   Do not allow two diverging writable cellars. Set explicit downtime/abort criteria.
9. Switch approved domain/redirects, configure TLS and health checks. A new origin
   needs a fresh login/PWA install; an old-origin service worker cannot migrate
   itself across domains. Keep approved legacy share redirects/site available.
10. Rollback must include data, not just a DNS flip. Before new writes, routing can
    revert to the verified old target. After new writes, freeze and reconcile deltas
    before reversal; never discard new recipes or cellar changes. Rotate/revoke old
    secrets only after dependency removal and rollback-window approval. Cancel old
    resources only under separate explicit authorization.

The Auth-export limitation and separate Storage copy requirement are supported by
the official [Auth migration guide](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects),
[backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
and [backup boundaries](https://supabase.com/docs/guides/platform/backups), reviewed
on 2026-10-20. They do not establish this project's actual access or backup state.

## 8. Prioritized Phases and Acceptance Gates

Estimates are focused engineering days for one experienced developer assisted by
Codex, not elapsed-time guarantees. They exclude access waits, vendor support,
external safety/privacy review and major design revisions. No implementation is
authorized merely by this estimate.

| Order / phase              | Deliverables                                                                                                                                   | Dependencies and acceptance                                                                                                                                              | Effort                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 0A: this inventory         | Source reuse/exit audit, architecture/schema/API proposals, wireframe outline, risks and rollout plan                                          | Complete as a source assessment; live ownership/export evidence remains open                                                                                             | Completed                     |
| 0B: independent foundation | Clean reproducible checkout/build, wrapper replacement on feature branch, verified infrastructure/export feasibility, isolated staging plan    | No production writes; explicit infrastructure approval before provisioning/costs; owned build works without Lovable package                                              | 5-8 days, plus external waits |
| 1: design prototype        | Home, Cookbook, Workbench, Recipe, Cook, contextual Chef and integrated Wine; optional Keto preview                                            | Can proceed alongside access discovery; isolated flags/local synthetic data, no real AI/health writes; mobile/tablet review and explicit design approval                 | 3-5 days                      |
| 2: cooking core            | Recipe/version validation, quantities/units, private recipe save, real resumable sessions and multi-timers, feedback capture, offline behavior | Phase 1 accepted; additive schema rehearsed in staging, RLS/foreign-ID/concurrency tests; scales quantities correctly, restores paused/expired timers, reports conflicts | 8-12 days                     |
| 3: AI Chef / Food Memory   | Direct adapters, structured recipe drafts/adaptations, contextual help, evidence extraction, per-memory controls                               | Foundation + cooking contracts; no unsafe state writes or invented memory, weak evidence handled honestly, cost/latency/safety evals pass                                | 6-10 days                     |
| Release gate: core MVP     | Wine regression, staged Auth/Storage/privacy, device/PWA, restore drill, alerts, approved production plan                                      | 0B and phases 1-3; explicit cutover approval; no health tracking or payments required                                                                                    | 4-7 days                      |
| 4: pairing / family        | Bidirectional dish/wine suggestions, optional cellar grounding, simple per-person meal preferences                                             | Core stable; household invitation/permission model tested, child/adult dietary separation                                                                                | 5-8 days                      |
| 5: basic optional Keto     | Explicit toggle, nutrition sources/provenance, recipe-level estimates and substitutions                                                        | Audited ingredient pipeline, unknowns, EU/US/portion tests, safety/privacy review; may overlap later core work but not block MVP                                         | 4-7 days                      |
| 6: advanced tracking       | Confirmable meal photos, logs/targets, manual typed ketone readings                                                                            | Separate safety/data-protection approval, restricted access/export/delete, measured vs estimated separation, no diagnostic claims                                        | 8-15 days plus review         |
| 7: advanced voice / pantry | Supported-device voice, confirmed food/pantry observations, richer planning                                                                    | Core reliable and user demand demonstrated; background limitations disclosed and voice-free fallback works                                                               | 6-12 days                     |

Core MVP planning envelope: 26-42 focused days across foundation, design, core,
AI and release hardening, approximately 5-9 working weeks before external delays.
Do not present all optional phases as part of that envelope. The most uncertain
items are managed-cloud exit permissions, Auth migration, real-device/background
behavior, food safety and nutrition-source quality.

### Flags and rollback boundaries

Proposed flags: `CULINARY_UI_ENABLED`, `COOKING_CORE_ENABLED`,
`FOOD_MEMORY_ENABLED`, `HOUSEHOLDS_ENABLED`, `KETO_MODE_AVAILABLE`,
`HEALTH_LOGGING_ENABLED`, `VOICE_COOK_ENABLED`. All start off. A user must also
opt into Keto Mode; availability is not consent. UI flags are not authorization:
server checks must reject disabled mutations and unauthorized scopes.

Retain the existing privacy gates. Do not enable
`VITE_PRIVACY_OPERATIONS_VERIFIED` just to remove a warning. Roll back additive
features by disabling actions/routes and preserving stored versions, not by
dropping new tables. Schema, Edge and frontend versions have separate checkpoints.

## 9. Test, Risk and Operational Priorities

| Priority | Risk / missing evidence                                                                                                   | Required mitigation                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | No fresh proof of production control, full export, independent storage restore, or applied October 13 privacy/role repair | Verify access/schema/history/actual backups before promising migration or release; keep old app/data intact                                                |
| P0       | New health/household domains could leak through public wine/social/context paths                                          | Private separate tables, server-scoped retrieval, cross-user/child/adult tests and separate health collection approval                                     |
| P0       | Recipe hallucinations, unsafe substitutions/allergen handling or changed temperatures                                     | Reviewed source/rules, structured validation, explicit unknowns and escalation; no safety guarantees from an LLM schema alone                              |
| P1       | Timer intervals/background audio and local cache are not reliable cooking-state persistence                               | Deadline-based state machine, deterministic clock tests, resume/restart/conflict tests; actual Android/iOS foreground/background QA                        |
| P1       | Memory can overfit, conflict or be reconstructed after forgetting                                                         | Source-linked extraction, idempotency, evidence counts, correction precedence and deletion/tombstone tests; no permanent preferences from chat prose alone |
| P1       | Current tests include source-string contracts and mocked UI/hooks/handlers, not full hosted behavior                      | Add real browser flows plus staged JWT/RLS/Storage tests; preserve 370-test wine baseline                                                                  |
| P1       | AI quota is per function/window, not a total spending cap; no complete cost ledger                                        | Per-user/project budget reservation, concurrency control, bounded outputs/retries, provider usage reconciliation, billing-safe alarms                      |
| P1       | Drift in README, generated schema types and dual migration ledgers                                                        | Update docs/types only against verified code/schema; one documented migration authority for future changes                                                 |
| P2       | Large initial client chunk and chart/Markdown surfaces can hurt mobile/cook loading                                       | Route/domain splitting and measured loading/performance budgets before adding culinary assets                                                              |
| P2       | Food/recipe images and nutrition references may lack adequate provenance or completeness                                  | Verify licenses/source versions, local asset ownership, raw/cooked/yield assumptions and uncertainty                                                       |

Testing additions by layer:

- Pure units/property-style cases: serving ratios, mixed units, fractions, unknown
  units, density-dependent conversions, zero/invalid amounts, rounding, nutrition
  conventions, substitutions and safety-rule non-scaling.
- State tests: session revisions, repeated commands/idempotency, multiple timers,
  pause/resume/expiry, clock changes, process restart, offline sync, account switch,
  logout and erasure with queued local writes.
- SQL/handler tests: own/stranger/anonymous/erased sessions, foreign child IDs,
  household scopes, immutable versions, privileged actions and rollback-safe writes.
- AI eval set: known wines, multilingual labels, recipe structure/units, unsupported
  nutrition, allergies/substitutions, prompt injection, weak/contradictory evidence,
  contextual active step and refusal/timeouts/truncated outputs. Record per-action
  error, latency, validated success and cost; human-review safety-critical cases.
- Browser/device: start-to-finish cooking, saved variants, timers, keyboard/focus,
  360/390 px phones, 768/1024 px tablets, large text, offline reload, camera denied,
  PWA update without losing state, iOS/Android real devices and no-wine/keto-off use.
- Operational drill: independent database plus actual object restore, Auth/login,
  share IDs, erasure receipts, signed-link behavior, cron HTTP outcomes, alert
  delivery and documented cutover/rollback rehearsal.

## 10. Initial Cost Model and Decisions Needed

Costs below are planning examples in USD, not a quote, observed invoice or
authorization to purchase. Public prices checked 2026-10-20:

- [Cloudflare Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/)
  has a $5/month subscription baseline; usage can add cost.
- [Supabase Pro](https://supabase.com/pricing) starts at $25/month including one
  project; an additional small project starts at $10/month. Included file storage
  is 100 GB, with published overage $0.0213/GB; separate backup copies and traffic
  can add cost. Validate organization/project billing and staging choice first.
- [OpenAI Standard token pricing](https://developers.openai.com/api/docs/pricing)
  lists short-context GPT-6.1 Sol at $2/million input tokens and $10/million output
  tokens. This is an example for the already configured reader model, not a decision
  to use it for every Chef action or proof of this account's access. Direct Gemini
  pricing/contracts and project access still need confirmation before selection.

Example uncached text action at those GPT rates: 4,000 billed input tokens and
1,000 billed output tokens cost $0.018. At 100 users x 40 such actions/month,
that is $72 AI plus approximately $30 base hosting/database, or $102 before
staging, tax, images/audio, longer outputs/reasoning, retries, mail, monitoring,
backups and overages. An additional $10 staging project makes that example $112.
At 1,000 users with the same action mix, the AI component alone becomes $720.
These are arithmetic scenarios, not predictions of actual usage or Gemini costs.

Storage sizing example: 100 users x 20 saved photos x 0.5 MB is about 1 GB of
originals. At 1,000 users it is about 10 GB before variants and backups. Enforce
image size/type/dimension bounds and avoid retaining unsaved captures. Preserve
privacy deletions across originals, derivatives, backups and offline caches.

Before implementation infrastructure work, confirm target-account ownership and
spend approval, managed-cloud export rights and intended first-release scope.
Before prototype signoff, decide navigation and the treatment of the existing
Wine area. Before public launch, confirm domain, privacy/safety operations,
device coverage and rollback ownership. Billing/subscriptions, advanced ketones,
automatic resource deletion and production cutover require separate decisions.

## Next Approved-Work Boundary

This inventory does not start phase 1, replace dependencies, import KetoLens,
provision resources or authorize production deployment. Recommended next step:
review the scope and approve an isolated culinary design prototype, while owner
access/export feasibility is established in parallel. Keep database/auth migration
as a separately gated task; it need not block a local visual review.
