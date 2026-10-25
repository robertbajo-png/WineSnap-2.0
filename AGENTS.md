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
- `pzniyupmgwvlldvztzqh` is the approved disposable test project. Test wrappers
  reuse locally encrypted credentials; never print keys or ask for them in chat.
- Run typecheck, lint, Vitest, synthetic Node build/runtime and client budget.
  Security-sensitive changes need focused regression tests; UI changes need
  desktop/mobile browser verification. Do not equate mocked AI with live AI.
- Follow the user's standing preference to commit and push completed work.
  Do not automatically merge or deploy while production gates remain unresolved.

Current migration status and cutover order:
`docs/lovable-exit-2026-10-23.md`. Earlier dated documents describe historical
preparation and must not override the current standalone default.

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
