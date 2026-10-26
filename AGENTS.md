# WineSnap Repository Guidance

- Continue development in Codex using this Git repository. Do not send tasks,
  source code or credentials to Lovable, or reintroduce its build wrapper,
  preview-auth broker or AI gateway.
- The default Vite configuration uses the standalone Node runtime. Public build
  configuration lives under `config/independent`; no implicit production `.env`.
  `npm run build:check` is a synthetic offline smoke artifact, not a deployable app.
- Reuse the existing React/TanStack routes, mobile layout and Supabase contracts.
  The Chef prototype is separate from WineSnap, not a replacement frontend.
- Keep provider credentials only in server/Edge secret managers. Direct AI uses
  `OPENAI_API_KEY` and `GEMINI_API_KEY`; never expose them as `VITE_*` settings.
- Production data and the existing published site must remain intact until an
  owned destination, complete export, isolated restore and rollback are verified.
  Do not promote the empty test project or blindly replay migration histories.
- The current Windows installation uses its own empty local backend,
  `winesnap-owned-local`, through `scripts/run-owned-windows.ps1`.
  The owner abandoned hosted WineSnap-test (`pzniyupmgwvlldvztzqh`); its old
  wrappers are historical/manual tools, not the default runtime. Never print
  keys or ask for them in chat, or silently resume a hosted test connection.
- Run typecheck, lint, Vitest, synthetic Node build/runtime and client budget.
  Security-sensitive changes need focused regression tests; UI changes need
  desktop/mobile browser verification. Do not equate mocked AI with live AI.
- Follow the user's standing preference to commit and push completed work.
  Do not automatically merge or deploy while production gates remain unresolved.

Current migration status and cutover order:
`docs/lovable-exit-2026-10-23.md`. Earlier dated documents describe historical
preparation and must not override the current standalone default.
The current Windows backend supersedes hosted-test runtime instructions:
`docs/owned-local-windows-2026-10-25.md`. Operate only exact labelled local
containers/volumes and fixed loopback ports. Do not delete volumes, regenerate
lost root credentials, publish a tunnel or import real data automatically.
Use `run-owned-windows.ps1 -Action Features` for tagged, disposable backend
fixtures. `FeaturesAi` is a separate opt-in with up to eight real AI scenarios;
never schedule it or substitute it for browser/mobile verification. Clean up
only exact fixture IDs whose email and run metadata match, never real accounts.
For interactive browser acceptance, `BrowserPrepare` creates a separate local
fixture and sends a normal sign-in link only to the local inbox. `BrowserInspect`
reads its cooking state; `BrowserMemory` separately makes one live Gemini
extraction scenario. Always finish with `BrowserCleanup`. The private
`browser-fixture.json` manifest is independent of status reports; only matching
ID, synthetic email and administrator-written `app_metadata` allow cleanup.
Never schedule browser fixture preparation or live AI scenarios.
`BrowserConflict` can simulate a newer server revision only for the manifest's
exact synthetic cooking session and recipe version, after all fixture-owner
checks. It is a backend test operation, not proof that a browser is offline.
New owned backups use version 2 with the `owned-logical-v1` database/file manifest.
Use `scripts/rehearse-owned-recovery.ps1` for a same-PC, isolated restore of the
latest compatible encrypted archive, or `-BackupFile` with an exact archive
basename. It must never restore over the installed stack, expose ports, mount
permanent data, load provider keys or replay migrations. All clone resources
must match the random invocation's `owned-backup-rehearsal` labels and are
removed afterward. This is not portable/off-device or production recovery.

Phase-2 recipes and Cook Mode run in the actual local app at `/kitchen`, not
the illustrative Chef prototype on port 5200. See
`docs/cooking-core-2026-10-24.md`. Keep the cooking feature gated to WineSnap-test;
its database gate is independent from UI flags. Snapshots support legacy v1
(20 tables), cooking v2 (24 tables), Chef v3 (30 tables), and meals v4 (35 tables); none is a full
platform backup. Phase-3 AI Chef and inspectable Food Memory are test-only;
see `docs/ai-chef-food-memory-2026-10-24.md`. Preserve all independent gates.
Phase-4 pairing, household invitations and private meal history are also test-only;
see `docs/meals-households-2026-10-25.md`. Never send shared diner profiles to AI
or infer permission to read another member's cellar, recipes or private memory.
Recipe nutrition is a test-only, opt-in view calculation with no persisted dietary
profile. See `docs/recipe-nutrition-2026-10-25.md`; preserve unknowns, source/state
confirmation and EU/US distinctions. No automatic child diet or health tracking.
The owner separately approved these features on the owned local backend. Its
explicit build/server flags and database gates are required; this narrow
exception does not enable any feature on hosted test or production.

Current security/privacy release gates and data-flow inventory:
`docs/security-privacy-review-2026-10-25.md`. Passing test suites is not public
release approval or proof of supplier contracts, full recovery or legal compliance.
Supplier account evidence and draft processing/risk records:
`docs/supplier-privacy-review-2026-10-25.md`. Keep supplier release sign-off separate
from working export/erasure. Fonts ship locally with their OFL notices; do not
restore external font/CDN requests or imply zero-retention/EU-only AI processing.

`npm run release:check` is a source-only, read-only preflight; exit 2 means
release remains blocked. See `docs/release-readiness-2026-10-25.md`. Never create
operator attestations, copy credentials into evidence or treat local application
backup/restore success as full platform recovery. It is not a deploy command.

`scripts/rehearse-local-platform-recovery.ps1` is a separate synthetic local
PostgreSQL/Auth/Storage rehearsal, not a hosted WineSnap-test export. Always use
the PowerShell DPAPI wrapper: the private Node helper's create output contains
synthetic password hashes, passwords and signing material. No hosted URL is
accepted; never generalize it to production or claim portable/off-device recovery.
See the 2026-10-25 addendum in `docs/local-windows-follow-up-2026-10-24.md`.

Use `scripts/configure-test-database.ps1` for the separate PostgreSQL credential.
Its masked Window input saves an existing test password with CurrentUser
encryption; Check reuses it through private stdin in READ ONLY mode. NetworkCheck
verifies TLS reachability without authentication, not database/backup acceptance.
Never use the destructive CI database harness against hosted WineSnap-test,
substitute API keys for this password, reset it automatically, or weaken TLS.
