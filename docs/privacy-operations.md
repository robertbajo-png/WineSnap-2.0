# WineSnap privacy implementation and release gate

Operator-approved policy, 2026-10-13. This is an engineering implementation and
operating procedure, not a legal certification. The production rollout has not
been performed by creating these files. No real account or cellar was erased.

## Implemented in source

- Optional usage events are disabled in the client; the migration revokes legacy
  client INSERT on `analytics_events`. Existing events become maintenance purge
  candidates. Applying the migration itself does not purge these events.
- AI logs contain fixed failure labels/status codes, not model responses, prompts
  or arbitrary error objects. Ask's model context omits internal account/wine IDs
  and internal routes. User-submitted content can still contain personal data.
- Unsaved scan images are kept in browser memory and submitted to AI only. Storage
  upload happens on explicit save. Failed saves attempt immediate file cleanup.
- Profile offers a v2 JSON export that embeds actual file bytes, social relation
  records involving the caller and server-side quota records. The server derives
  identity from verified Auth, never the request body. Signed links remain internal
  to the download and do not survive in the final JSON. Any failed dataset/file or
  account switch aborts the whole export. Limits: 20,000 rows, 20 MiB server JSON,
  500 files and 50 MiB combined raw browser payload; larger access requests are
  handled by the operator. Provider-held personal data is not silently deemed
  outside the right of access just because it is outside this export.
- Memory reset preserves wines/ratings and stated profile settings, but removes
  computed taste, derived signals, feedback and similarity records. New activity
  can learn new preferences; this is a reset, not a permanent personalization opt-out.
- Erasure requires explicit UI confirmation and a recent verified sign-in. It
  records a durable request, hides public shares/profile and blocks authenticated
  reads/writes/uploads through restrictive RLS, including unexpired deleted-user
  JWTs. The worker removes owned Storage files in all buckets before deleting Auth.
  Legacy photo metadata without an Auth FK is removed explicitly. Batches and
  five-minute claims support retries without reporting partial erasure as complete.
- A service-only erasure receipt survives the Auth cascade. It contains account ID
  and request/completion times, not wine/chat contents; cleanup expires completed
  receipts after 30 days. A missing completion mark is reconciled by maintenance.
- Fixed retention windows: messages/conversations 90 days, quota records 30 days;
  unused wine uploads older than 23 hours are candidates for hourly cleanup. Saved
  wine/photo references and newer uploads are excluded, including legacy image URLs.
  Batches are bounded and report backlog/failures. Inactivity over 24 months is a
  manual-review count, never an automatic account deletion or a delivered notice.
- `privacy-maintenance` previews by default. Execution is fail-closed behind a
  separate high-entropy scheduler secret and enable flag. Anonymous/user JWTs do
  not authorize maintenance. Migration alone does not schedule or run erasure.

## Deployment sequence

1. Confirm the actual legal entity behind Boleo AI and an actively monitored
   postal/contact route. Preserve the existing approved postal address; do not
   invent an email, company registration number or signed provider agreement.
2. Rehearse all migrations and `step11_privacy.sql` against a disposable project.
   Test real JWT and Storage HTTP using synthetic accounts, including concurrent
   uploads, large erasure retries, old signed links, export files and fresh sign-in.
3. Back up production and reconcile the existing Lovable/native migration ledgers
   using verified deployment history, not by replaying already-applied migrations.
   Apply `20261013180000_privacy_controls.sql` before any updated Edge functions.
4. Deploy `privacy-controls`, `privacy-export`, `privacy-maintenance` and all six
   modified AI functions. AI access deliberately fails closed if the active-account
   RPC is not installed. Check status codes before publishing the frontend.
5. Securely configure a unique >=32-character `PRIVACY_CRON_SECRET`. Dry-run the
   maintenance function with `{"execute":false}` and inspect candidate counts.
   Secrets must not appear in chat, client environment variables, source or logs.
6. Only after staging acceptance, set `PRIVACY_MAINTENANCE_ENABLED=true` and
   `PRIVACY_DELETION_ENABLED=true`. Configure `pg_cron`, `pg_net` and Vault using
   the platform's documented operator flow; apply `supabase/operations/privacy-cron.sql`.
   An hourly successful HTTP invocation is required, not just a green cron SQL row.
7. Monitor maintenance HTTP failures, `more_batches_required`, oldest pending
   erasure request and persistent `last_error_code`. Investigate stalled requests
   promptly and respond to rights requests without undue delay, normally within
   one month; the operator handles applicable exceptions/extensions transparently.
8. Verify the deletion/export UI using only disposable accounts, then publish.
   Enable `VITE_PRIVACY_CONTROLS_ENABLED=true` only after backend acceptance; until
   then the current v1 export remains and new reset/erasure controls are hidden.
   `VITE_PRIVACY_OPERATIONS_VERIFIED` must stay false until this checklist AND the
   provider/legal checks below are complete. Text fields alone cannot clear the gate.

## Backup and provider obligations still requiring external evidence

The 14-day diagnostic-log, 30-day security-log and at-most-30-day backup periods are
operator targets, not enforced by a client constant. Confirm the actual plan,
platform settings and any exported/off-site copies. Platform logs may use different
retention settings. Do not publish these targets as achieved until verified.

Before restoring any old database, export the current erasure receipts/jobs to a
separate protected operator location. After restoration reapply outstanding and
completed erasures before opening public access or issuing new tokens. Keep that
protected receipt copy no longer than its justified retention. The SQL receipt
table alone is not independent of the database being restored. A staging restoration
rehearsal and an operator alerting/contact mechanism remain required.

Confirm agreements cover the actual hosted app and AI-gateway flow, not merely the
Lovable development chat. Record applicable DPAs, subprocessors, model-specific
retention/training terms, locations and lawful international-transfer safeguards.
An EU database location or a vendor GDPR marketing statement is not sufficient
proof of the whole chain. No zero-retention or EU-only-processing claim is made.

## Processing register and risk decision

| Processing                                            | Purpose / proposed basis                                                            | Retention / safeguard                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Account, cellar, photos, purchases, ratings, wishlist | Requested service; contract only where genuinely necessary                          | While service is needed; periodic inactivity review; erasure on closure      |
| Requested scanning and AI questions                   | Deliver requested analysis; necessity must be documented                            | Browser-only unsaved scan; 90-day app chat; provider period must be verified |
| Taste memory / personalization                        | Explicitly described personalized service; verify contractual necessity per feature | User reset; account erasure; transparent derived preferences                 |
| Security, quotas and failure monitoring               | Proposed legitimate interests: service protection and abuse prevention              | Data minimization; quotas 30 days; platform log targets 14/30 days           |
| Erasure jobs and receipts                             | Fulfil erasure obligations and prevent restored data from returning                 | Pending handling; receipt 30 days after completion; service-only access      |
| Optional product analytics                            | Disabled; a later change requires its own lawful-basis/device-consent assessment    | No new events; existing rows purged by enabled maintenance                   |

Legitimate-interest assessment draft: the concrete interest is availability and
protection of users' private cellar data. Fixed codes/counts and short-lived quotas
are less intrusive than keeping prompts, images, IP histories or entire responses.
Access is restricted; no marketing reuse is allowed. Document why each actual log
field and period is necessary, reasonable user expectations and how objections are
handled. Operator approval of this implementation is not proof that an unreviewed
platform log or provider reuse satisfies that balancing exercise.

Risk screening: bottle scans/free-text can accidentally contain faces, location or
health information; recommendations infer preferences; private photos, exports and
old shares can disclose data. Limit model context, warn users not to submit sensitive
information, keep sharing explicit, and test owner isolation. Determine and record
whether a DPIA is needed based on actual scale, audience, categories and processing;
do not assume all AI is high-risk or that a small app is automatically exempt.
Ordinary contract necessity and a warning alone do not authorize special-category
processing. If health or other special-category data is actually processed, assess
the applicable Article 9 condition as well as Article 6 before approving that flow.

Maintain a rights-request log and a breach procedure: contain the incident, preserve
necessary evidence, assess notification obligations and applicable GDPR deadlines,
and coordinate with processors. A usable contact route and operator response process
must exist even for users who cannot log in.

## Verification, 2026-10-13

- 370 Vitest tests pass in 59 files. Checks include actual Edge-handler execution
  with mocked Auth/HTTP, erasure ordering/retries, export bytes/limits and UI
  confirmation/rollout guards. Component tests are not real-browser focus proof.
- TypeScript and full ESLint pass. Production client/SSR/Nitro build passes;
  existing dependency/Nitro and large-chunk warnings remain.
- All 33 migrations and 11 SQL invariant files pass in a fresh disposable local
  PostgreSQL cluster, including the erasure-trigger repair, stale JWT restrictions,
  retained-receipt restoration guard, old conversation titles, safe dry run and
  legacy share/image preservation. No real user data was used.
- The rebuilt local runtime returns HTTP 200 for `/privacy`, with Boleo AI, the
  approved address, retention information and the pending-deployment warning.
- No production migration, Edge deployment, Vault secret, cron activation,
  provider-setting change or successful hosted erasure is claimed. There is no
  connected Supabase/Lovable deployment tool in this session. Fresh browser/device
  and hosted acceptance remain required before enabling the flags.

## Primary references reviewed

- [IMY: retention](https://www.imy.se/vanliga-fragor-och-svar/hur-lange-far-vi-spara-uppgifter/)
- [IMY: contract necessity](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/foretag/behandling-av-personuppgifter-vid-tillhandahallande-av-onlinetjanster/)
- [IMY: legitimate interests](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/)
- [IMY: processor agreements](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsansvariga-och-personuppgiftsbitraden/personuppgiftsbitradesavtal/)
- [IMY: special-category data](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/kansliga-personuppgifter/)
- [PTS: device storage and cookies](https://www.pts.se/internet-och-telefoni/kakor-cookies/)
- [Supabase: deletion constraints and JWT lifetime](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase: backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase: scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Lovable: AI connector](https://docs.lovable.dev/features/ai)

Local tests prove local contracts, not hosted JWT, Storage file deletion, vendor
agreements or physical-device behavior. Keep those release gates separate.
