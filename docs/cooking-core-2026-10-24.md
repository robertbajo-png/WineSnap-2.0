# Cooking Core: Phase 2

Date: 2026-10-24. Development branch: `codex/revocable-image-access`.
The implementation is for the Windows app at http://127.0.0.1:5210/kitchen
and disposable WineSnap-test (`pzniyupmgwvlldvztzqh`) only. No production
deployment, migration, account change or Lovable work is included.

## Delivered Scope

- Private cookbook with search, bundled starting recipes, a structured editor,
  saved immutable versions, version browsing and non-destructive archiving.
- Deterministic portions based on each recipe's original serving count.
  Compatible mass/volume conversions are explicit; changing between mass,
  volume and count requires a new quantity, never a guessed density.
- Cook Mode pins a saved version, with persistent step, servings, ingredient
  checkboxes, up to eight named timers, pause/resume/restart/removal and session
  completion/abandonment. A recipe edit cannot rewrite an existing session.
- Feedback is saved atomically with completion. Recent private cooking history
  retains its original recipe version and feedback, including across reloads.
- Foreground online synchronization and an account-partitioned IndexedDB copy.
  Pending changes remain explicitly pending. Remote revision conflicts require
  a choice; a second tab cannot silently overwrite a newer local record.
- Export, account erasure, private cache cleanup and versioned encrypted
  application snapshots include the new cooking domain.

AI recipe generation, contextual AI Chef, learned Food Memory, household
profiles, Keto, pantry recognition, voice and payments are not part of phase 2.
The design prototype remains a separate illustrative application; this feature
uses real account-authorized database persistence in the actual WineSnap app.

## Data And Authorization

The additive migration `20261024200000_cooking_core.sql` creates
`kitchen_recipes`, `kitchen_recipe_versions`, `cooking_sessions`,
`cooking_feedback` and the service-only `kitchen_config` gate.
All five tables have RLS. Authenticated users have owner-filtered read access
to their cooking records, not direct INSERT/UPDATE/DELETE access. Anonymous
users have neither reads nor mutation RPC execution.

Allowlisted SECURITY DEFINER actions use an empty search path, derive owner
identity from `auth.uid()`, validate bounded documents/state, check the operator
gate and active-account status, and enforce optimistic revisions. Composite
foreign keys prevent a supplied foreign recipe/version/session ID from linking
another owner's records. Session request IDs make retries idempotent; there is
at most one running/paused session per account. Finished sessions cannot be
reactivated by an old offline client. Recipe limits are 200 per account and
100 versions per recipe; sessions are capped at 1,000 per account.

The migration defaults to **disabled**. It was first rehearsed in a disposable
network-isolated PostgreSQL 17 database. Dashboard preflight then verified zero
accounts/wines and no existing cooking schema in WineSnap-test. Only the new
migration was applied in one guarded transaction with its actual native history
record; no older migration directory was replayed. The test-only gate was
enabled for authenticated acceptance. Existing production was not opened.

`VITE_COOKING_CORE_ENABLED=true` is accepted only for the exact test backend,
with both verified privacy switches enabled. The Windows Compose candidate
also sets `WINESNAP_COOKING_CORE_ENABLED=true` for local export/backup coverage.
Ordinary and synthetic offline builds keep the feature off. A client flag is
not authorization: the database gate independently rejects disabled actions.

## Offline And Timer Boundaries

Recipes/session state must first be downloaded with verified account access.
The account-specific cache has a maximum 24-hour verified-access age and is
validated before use. A usable browser Auth session is also required; the age
limit is not a promise that authentication will last 24 hours offline.
Online loads verify access before displaying a cached account. Explicit denial
clears the copy; a temporary network/provider failure does not masquerade as an
authentication denial or erase pending work.

Only the marked, generic SSR shell for `/kitchen` is cacheable. It contains no
account/recipe/session data, is fetched without cookies and uses the same
canonical route when offline, avoiding a hydration mismatch. Other account
HTML, API responses and authentication tokens are not added to the service
worker cache. Static assets remain cacheable under the existing policy.

Offline edits use an atomic local revision check and are synchronized only
after rechecking the account and server gate. Newer server data is never silently
merged over local work. Sign-out/account changes clear private offline copies;
privacy reset and erasure also attempt cleanup. If the browser refuses cleanup,
the privacy UI reports the limitation and still completes required sign-out.
Remote erasure cannot be observed while fully offline; stale work is denied
when access is checked again and cannot recreate an erased Auth identity.

Timers persist absolute deadlines and paused remaining duration. Pausing a
session remembers which timers were running, without restarting manually paused
ones. Completion/abandonment stops them. Clock discontinuities are surfaced.
Background notifications, alarms during sleep and physical-device behavior are
not guaranteed by foreground browser timers. Expiration never advances a step
or declares food safe. Only ingredient quantities scale; temperatures, cooking
time, pan geometry and food-safety decisions do not scale automatically.

## Privacy And Recovery

Local owner export includes all four personal cooking tables only under the
verified cooking rollout switch. Other builds retain their prior export
inventory. Account-state policies block queued-erasure accounts, and Auth
deletion cascades through recipes, immutable versions, sessions and feedback.
Raw cooking feedback is not yet used to derive AI preferences.

Application snapshot v2 includes 24 table sections. Verification/restoration
still accepts the earlier v1 format with its exact 20-table contract. Cooking
rows are restored in the existing network-isolated rehearsal, compared as
typed database rows and checked with native foreign keys. The operator gate
defaults off in the reconstructed schema and is not silently activated from a
snapshot. Erasure-receipt reconciliation is still required before restored data
could ever be served.

These remain **application snapshots, not full PostgreSQL/Supabase backups**.
Auth passwords/identities, a live Storage/Auth service, platform settings and
portable off-device disaster recovery remain outside their scope. The existing
SMTP/full-database-connection release gates are unchanged.

## Verification And Operation

```powershell
# No keys are printed or requested; the wrapper reuses the existing DPAPI stores.
./scripts/configure-local-windows-ai.ps1 -Action TestCooking
# Synthetic SQL/RLS/ownership/version/retry/erasure rehearsal, no hosted writes:
node scripts/check-cooking-database.mjs
./scripts/watch-local-windows.ps1 -SelfTest
```

The live browser suite uses the actual local built app, real test JWT/RLS/RPC
requests and disposable accounts, with no AI-provider requests. It checks
recipe save/versioning, portions/conversion, persisted timers, full offline
reload, remote and multi-tab conflicts, history, export, sign-out and erasure.
It creates a real encrypted v2 application snapshot and waits for its automatic
24-table restore before deleting its synthetic accounts. Safe reports and
screenshots are ignored under `dist/`; keys, passwords and browser sessions
are never committed.

Final acceptance:

- 698 unit tests across 85 files pass; TypeScript and full-project ESLint pass.
- Synthetic standalone build, Node runtime smoke and client asset budget pass.
- All 20 actual-app browser/backend checks pass, with zero runtime errors and
  zero fixture-cleanup failures. This includes full offline reload/reconnect,
  both server and local-tab conflict protection, export and erasure.
- Cook layouts pass overflow checks and automated accessibility at 360, 390,
  1024 and 1440 CSS pixels; recipe-library layouts also pass mobile/desktop
  overflow checks. Images decode and screenshots were visually inspected.
- A real encrypted v2 snapshot with both synthetic accounts and cooking data
  restores all 24 table sections automatically with confirmed sandbox cleanup.
  Full PostgreSQL/Supabase disaster recovery is not claimed.
- The default-off SQL contract passes the isolated migration/ownership/version/
  retry/erasure rehearsal. Actual hosted JWT/RLS behavior passes separately in
  the browser/backend suite; it is not inferred from mocked Auth contracts.

Automated accessibility/viewport checks do not substitute for physical
iPhone/Android, screen-reader, sleep/background-alarm or full production-release
acceptance. No live AI calls were needed for phase 2.

Rollback for this candidate is to disable the cooking gate/UI and retain data,
not drop its new tables or rewrite old WineSnap migrations. No production
promotion or merge to main is authorized by these development checks.
