# Phase 3: AI Chef and Food Memory

Date: 2026-10-24. Scope: local WineSnap and disposable WineSnap-test only.
Production, main, Lovable, existing wine AI routing and provider keys are unchanged.
Implementation and local/test acceptance completed. This is not a production rollout.

## Delivered Workflow

The actual `/kitchen` app has four tabs: recipes, cooking, Chef and Food Memory.
Chef supports general culinary questions, an owned saved recipe, or a synchronized
active cooking session. The server retrieves the pinned version and active step;
it does not trust a client-supplied recipe, user ID or timer state. Offline and
unsynchronized cooking cannot start contextual AI. Existing Cook Mode remains
usable offline without AI.

Recipe creation and adaptation produce validated, private drafts. Review opens
the existing recipe editor; only its explicit save creates a recipe/version.
Adapting a recipe never changes a pinned session, checks an ingredient or starts a
timer. The wine cellar and sommelier remain separate; full dish/wine pairing and
household permissions belong to the next phase.

Chef calls the already configured direct Gemini adapter (`gemini-3.8-flash`), not
Lovable or a new OpenAI workload. Credentials remain in the existing private RAM
file, restored from the authorized Windows-encrypted store. The provider endpoint
is fixed and redirects are rejected. Structured outputs use Google's documented
[OpenAI-compatible JSON-schema contract](https://ai.google.dev/gemini-api/docs/openai#structured-output),
followed by strict application validation of content, units, limits, serving count
and duration. Truncated/refused/malformed answers cannot be committed as recipes.

## Inspectable Memory

- Explicit statements are confirmed by the user action itself. Feedback extraction
  is opt-in per selected note and creates only pending candidates with an exact
  quotation, recipe title, timestamp and source reference.
- The user can confirm, correct, inspect sources, forget one preference or reset
  all food memory. Corrections retain the superseded evidence as corrected,
  rather than presenting it as current preference.
- Deterministic aggregation deduplicates sources, decays inferred evidence with
  a 180-day half-life and reduces contradictory evidence. A single inferred
  source remains weak even after confirmation. Evidence below 0.35 is not sent
  to Chef. These weights are heuristics, not calibrated probabilities.
- The latest explicit statement/correction overrides inferred direction. Only
  confirmed, owner-scoped evidence is considered; at most 24 eligible preferences
  enter provider context. More than 500 signals fails closed instead of silently
  displaying an incomplete inventory.
- Forget removes matching raw memory evidence and creates a private SHA-256 value
  barrier. This is personal metadata, not anonymization. Old feedback cannot
  automatically recreate that value. An explicit new statement can reinstate it.
- Reset clears signals/barriers and advances a feedback cutoff. Earlier feedback
  cannot be analyzed into new memory, including through a stale client. Recipes
  and original cooking history/feedback remain unless separately erased.
- Correction, forgetting and reset clear Chef chat/draft history. A memory epoch
  also prevents an in-flight or cached answer based on older memory from being
  committed or replayed. Concurrent ordinary confirmation can therefore return
  a conflict instead of a stale answer.

## Safety And Cost Boundaries

There are no model tools and no model-authorized database/session mutations.
Recipe text, memory, feedback, chat history and prompts are untrusted data.
Common clinical/allergy and food-safety questions receive a fixed, sourced safety
response without a provider call. Their original question is not saved in Chef
history. Common medical fields/notes are rejected for Food Memory. This is a
conservative tripwire, not a comprehensive medical/allergen classifier or food
safety certification. Review ingredients and preparation yourself. Ordinary
ingredient dislikes are checked against the draft's ingredient list with limited
culinary aliases; this does not certify allergen absence or cross-contamination.
The safety response links [official food-safety guidance](https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety).

Atomic reservation permits 20 chat requests or 5 requests per other action per
five-minute fixed window, at most 100 per user/day and 1,000 for this test project
per UTC day. Context is bounded to 24,000 bytes; output is capped at 1,536 tokens
for chat and 4,096 for recipe/extraction, with a 45-second provider deadline.
Chef does not automatically retry a provider request, switch model or fall back to
another provider. A request ID plus input hash makes a completed retry reusable
without another provider call/quota reservation. Failed/pending IDs return a
conflict; a fresh intentional request or conversation uses a new ID.

The request ledger records configured model, returned input/output usage when
available, duration and validated outcome. Request limits are not a dollar billing
cap or a reconciled provider invoice. A provider-side project spending alert/cap
remains an operational prerequisite before wider exposure.

## Data And Operations

New tables: `food_memory_state`, `food_signals`, `food_memory_tombstones`,
`chef_conversations`, `chef_messages`, `chef_requests`. All have RLS and cascading
Auth ownership. Authenticated clients can read only their allowed own rows and
cannot write tables directly. The small memory-control RPC is owner-bound; only
the server role can reserve or finish AI requests. Erasure-requested accounts
fail closed even with an older valid JWT. Tombstones are service-only but included
in the owner's privacy export.

Migrations, applied only to WineSnap-test:

1. `20261024220000_ai_chef_food_memory.sql`, additive, Chef database gate off.
2. `20261024223000_chef_conflict_status.sql`, terminal PT409 business conflicts.

The second migration is deliberate: live testing reproduced hosted PostgREST's
retry behavior for SQLSTATE 40001. The original applied migration is preserved.
See [Supabase's explanation](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).

Client `VITE_AI_CHEF_ENABLED`, Node `WINESNAP_AI_CHEF_ENABLED` and database
`kitchen_config.chef_enabled` are independent gates. Cooking and verified privacy
gates are also required. Independent/default builds keep Chef off; local Compose
enables it only for the pinned test destination. Rollback disables the gates and
rebuilds the local app; do not drop tables or replay migration history.

Owner export/reset/erasure include the new data. Scheduled local privacy
maintenance cleans request/draft records after 24 hours and Chef conversations
after 90 days in bounded batches. Confirmed preferences and recipes persist until
user removal/account erasure. The privacy page and global reset confirmation now
describe the added scope when Chef is enabled.

Encrypted application snapshots use v3 (30 tables); restore still accepts v1
(20) and v2 (24). Schema/config/secret/Auth-password/full-platform backup remains
out of scope. Snapshot production is not transactionally consistent PostgreSQL
backup, and restoring it does not grant public-release readiness. Later erasure
receipts must be reapplied before recovered data is served.

## Verification

Fresh acceptance on 2026-10-24:

- 736 unit tests in 88 files pass; TypeScript, full ESLint, synthetic Node build,
  runtime/auth smoke and client budgets pass. The actual running local artifact
  also meets the 200 KiB JS / 40 KiB CSS per-file gzip budgets (largest JS 111,234 bytes).
- All migrations, read-only cooking/Chef invariants and transactional ownership,
  source, epoch, idempotency and erasure scenarios pass in isolated PostgreSQL 17.
  GitHub's synthetic database runner now includes the cooking and Chef scenarios.
- 17/17 live Chef browser/backend checks pass, using real Gemini for chat, recipe
  generation, adaptation and evidence extraction; the real UI also generates and
  explicitly saves a reviewed draft. Provider errors, truncation, unsafe writes,
  missing context and account-switch fencing have focused regression coverage.
- 20/20 existing recipe/Cook Mode browser/backend checks pass, including offline
  reload, timer/session resume, synchronization conflicts, pinned history and
  erasure. Both browser suites report zero runtime errors and zero cleanup failures.
- Axe/overflow checks pass at 360, 390, 1024 and 1440 px. Populated Markdown
  answers also pass accessibility at 390/1440; the culinary theme explicitly
  overrides wine-theme emphasis/table colors to maintain readable contrast.
- The latest live quota run admits exactly five remaining reservations out of
  16 simultaneous attempts at a new window, without provider calls. Another run
  with two already used reservations admits exactly three. Cached retries do not
  create another exchange or spend another reservation.
- A populated v3 snapshot restores all 30 sections, two synthetic accounts and
  36 rows. The Cook regression separately restores 30 sections and 14 rows.
  Legacy v2 restores 24 sections after the new migrations.
- Final clean snapshot `snapshot-20261024-214948482.dpapi` restores 30 sections,
  zero accounts and three retained privacy receipts. Read-only backend counts
  confirm zero wines, recipes, sessions and Chef/Food Memory rows after cleanup;
  the existing erasure receipts are intentionally preserved. Privacy/price
  maintenance and the local watchdog report healthy status.

Safe generated acceptance reports remain in ignored `dist/`; no synthetic login
credentials are committed or retained in normal logs. Production was not contacted.

Local reproducible commands:

```powershell
./scripts/configure-local-windows-ai.ps1 -Action TestChef
./scripts/configure-local-windows-ai.ps1 -Action TestCooking
node scripts/check-cooking-database.mjs
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
npm run build:check
node scripts/check-independent-runtime.mjs
node scripts/check-client-budget.mjs
```

Live tests use only temporary synthetic users and delete them in `finally`.
Safe JSON reports and screenshots are under ignored `dist/chef-qa` and
`dist/local-windows-chef-report.json`. No credentials or real user records are
included in committed reports. Physical iOS/Android camera, installed-PWA
background behavior, provider contracts, SMTP delivery and full database backup
are separate release gates and are not certified by these tests.
