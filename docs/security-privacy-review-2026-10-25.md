# WineSnap Security and Privacy Release Review

Date: 2026-10-25. Scope: the standalone Windows application at
http://127.0.0.1:5210/ and disposable WineSnap-test
(`pzniyupmgwvlldvztzqh`). Production was not accessed or changed.

The subsequent [supplier and privacy follow-up](supplier-privacy-review-2026-10-25.md)
removes external font requests and separates supplier approval from the already
tested export/erasure operations. The verification counts below describe this
earlier security checkpoint, not that follow-up's additional tests.

**Decision: continue isolated acceptance testing; do not approve public release
or production cutover yet.** Technical tests cannot establish that operator
contracts, lawful bases, international transfers or actual provider settings
meet all legal requirements. This is an engineering review, not legal sign-off.

## Findings and Local Corrections

| Priority | Finding                                                                                                                                                                                                                | Correction and remaining boundary                                                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Chef checked pasted credentials only in the current question. Recipe fields, confirmed memory, selected feedback and earlier messages could bypass that check.                                                         | Apply the same credential tripwire to every outgoing Chef text source, provider content and cached results. Reject before provider access or persistence; return a non-sensitive error. Covers common OpenAI, Gemini, Supabase, GitHub and PEM formats, not arbitrary passwords, encoded secrets or complete DLP. Does not imply equivalent filtering in all wine AI handlers. |
| P1       | Recognized medical text in older user messages could be resent even though the current question was ordinary.                                                                                                          | Check user history as well as selected context. The built-in safety refusal remains allowed in assistant history, so a safe follow-up still works. Pattern checks are deliberately not presented as reliable detection of all health data.                                                                                                                                     |
| P2       | The worker accepted any same-origin image/script suffix into persistent asset cache and ignored private cache directives. Existing private images use protected API/external paths, but the policy was too permissive. | Limit caching to public build assets and known icons, omit cookies, reject authorization/query-bearing requests, redirects, private/no-store/no-cache and Cookie/Authorization/star Vary responses. Search only the current asset cache; retire older caches with a version bump.                                                                                              |
| P2       | Browser back/forward restoration could keep temporary nutrition state in the React heap without localStorage or a database write.                                                                                      | Remount the calculation on pagehide and persisted pageshow, clearing mode, limits, mappings and labels. Ordinary view/account changes already unmount it. This is UI lifecycle hygiene, not guaranteed physical memory erasure or protection against a compromised browser.                                                                                                    |
| P2       | Built standalone pages lacked basic response security headers.                                                                                                                                                         | Add nosniff, DENY framing, no-referrer, self-only camera with microphone/geolocation disabled, and a CSP restricting base URLs, objects, framing and form targets. Script/style nonce or hash enforcement is **not** implemented; test it separately against SSR hydration before making an XSS-CSP claim. HSTS belongs to the future stable HTTPS origin, not loopback HTTP.  |
| P2       | Privacy text omitted bounded Chef history, browser offline copies and Google Fonts requests.                                                                                                                           | Disclose these in both languages, explain that filters are incomplete, and retain the unverified-public-release warning. Disclosure alone is not a lawful-basis or transfer assessment.                                                                                                                                                                                        |

## Data Flow and Isolation Inventory

| Data                                                        | Destination and use                                                                                                                  | Retention and control                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, cellar, photos, ratings and preferences               | Supabase test Auth/database/Storage; client uses a public publishable key, RLS and authenticated requests                            | Owner controls and account erasure; deliberately public wines/profiles/shares are separate from private ownership. Protected image proxy rechecks access on each retrieval. Previously downloaded copies cannot be recalled.                                               |
| Scanned label image or text                                 | Local server to OpenAI for label analysis                                                                                            | No cellar persistence without save. Provider logging is separate from WineSnap persistence. Avoid people, location and personal text in source photos.                                                                                                                     |
| Wine chat and recommendations                               | Local server to Gemini using bounded account context                                                                                 | Existing privacy export, reset and active conversation cleanup; inspect the exact handler when expanding context. No claim of universal free-text redaction.                                                                                                               |
| Recipes, immutable versions, Cook sessions and feedback     | Own Supabase rows; selected recipe fields/step can be sent to Chef                                                                   | Retained until deletion/account erasure. Private notes and internal owner identifiers are not Chef recipe context. IndexedDB offline copy is owner-scoped, access-validity limited to 24 hours, not separately encrypted by the app, and cleared on logout/account change. |
| Chef questions, prior messages, drafts and request metadata | Gemini through the server, at most 12 prior messages plus bounded selected recipe, confirmed memory and explicitly selected feedback | Requests/unsaved drafts: 24 hours; conversations: 90 days through active maintenance. Safety refusals substitute a generic stored question for recognized safety/medical prompts.                                                                                          |
| Food Memory                                                 | Explicitly confirmed culinary evidence in own rows; bounded confirmed entries sent to Chef                                           | Inspect/correct/forget/reset. Reset clears related conversations/drafts; limited tombstones prevent automatic relearning. No automatic clinical profile.                                                                                                                   |
| Adult/child diner profiles and household relations          | Own rows; only explicitly shared profiles readable by invited adults                                                                 | Ordinary food preferences only; no dates of birth, health fields or automatic child diet. Not sent to AI. Member removal/revocation limits future access; peer-owned data is not erased by another user's account deletion.                                                |
| Recipe nutrition inputs                                     | Current component state and public food-reference bundle                                                                             | No nutrition table, persistent dietary profile, health measurement, automatic AI call or child diet. AI substitution handoff is culinary text and grams only, with separate manual submission. Browser lifecycle reset adds protection against restored UI state.          |
| Erasure ledger and application snapshots                    | Private local/server operations                                                                                                      | Ledger 30 days after completed erasure; encrypted local application snapshots rotate within seven days/seven copies. Restore must reconcile newer erasures before serving. This is not full Auth/platform recovery.                                                        |
| Font requests                                               | Browser loads Google Fonts from the links in `src/routes/__root.tsx`                                                                 | External connection metadata is not eliminated by local hosting. Prefer self-hosted licensed font files in the next privacy-hardening pass.                                                                                                                                |

Owner IDs are derived from verified JWTs; privileged server credentials do not
replace owner checks. Feature flags and database gates for kitchen, Chef and meals
remain test-only. No new schema, roles, policies, accounts or migrations are part
of the source corrections above. Disposable acceptance accounts are separate.

## Public Release Gates in Priority Order

1. **Operator and suppliers.** Boleo AI must approve the processing inventory,
   purpose-specific lawful bases, legitimate-interest balancing where used,
   actual retention, processor agreements and international-transfer safeguards.
   Verify the real Supabase region, contracts, Google project billing and OpenAI
   project data controls; the presence of an API key is not evidence of any of
   these. Keep `VITE_PRIVACY_SUPPLIERS_VERIFIED` false until supplier checks are
   complete. The separate operations flag may be true for tested export/erasure
   in WineSnap-test; it is not supplier approval. Do not bypass the warning by
   filling text alone.
2. **Adult access and child-data assessment.** Review service audience and adult
   access controls before offering Gemini-backed features publicly. A household
   checkbox or a child diner record is not proof of an adequate age/access model.
   Establish authority, transparency and lawful basis for adult-entered child
   profiles separately; the account holder's contract is not automatically a
   basis for every processing operation about another person.
3. **DPIA screening and health boundary.** Record likelihood/severity, affected
   people, profiling, children, third-party AI and accidental health disclosures.
   The combination warrants documented screening; whether a full DPIA is legally
   required depends on the actual processing and risk, not the feature name.
   Keep health tracking and clinical use disabled. A keyword filter or optional
   Keto label does not settle the Article 9 assessment.
4. **Full recovery.** Obtain an approved PostgreSQL connection, verify a full dump
   plus Auth/Storage/configuration recovery, isolate the restore and replay newer
   erasure receipts. Existing v4/35-table API snapshots are useful but not a
   transactional database backup and do not restore passwords or the platform.
   Verify off-device recovery and key availability before changing old hosting.
5. **Owned HTTPS and email operations.** Select a stable owned origin, complete
   TLS/auth redirects and recovery links, configure a verified SMTP sender and
   test actual delivery. Recheck cookie/cache/header behavior at that origin,
   including the script CSP policy and tunnel access. Do not treat a temporary
   tunnel, loopback test or synthetic recovery link as public hosting acceptance.
6. **Device and rollout acceptance.** Check real iOS/Android camera, PWA install,
   permissions, logout, back history, cache update and offline boundaries. Sign
   off feature flags, incident response, maintenance alerts, restore/runbook and
   rollback. Production requires a separate approved rollout; no automatic merge
   or deployment follows this review.

## Legal and Provider References

- [IMY on health data](https://www.imy.se/vanliga-fragor-och-svar/vad-ar-personuppgifter-om-halsa/):
  information revealing physical or mental health can be sensitive personal data.
  An unsupported field or disclaimer does not prevent free text from containing it.
- [IMY on DPIAs](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/):
  likely high-risk processing requires a prior assessment; unresolved high risk
  can require prior consultation. Our recommendation is to document screening
  now, not to claim that every recipe application necessarily requires a DPIA.
- [Gemini API terms](https://ai.google.dev/gemini-api/terms), effective 2026-03-23:
  public API clients in the EEA/Switzerland/UK require Paid Services and the terms
  restrict under-18 use/audience. EEA/Swiss/UK data-use provisions also extend the
  paid-service data treatment to otherwise free services; this does not remove
  the public-client Paid Services requirement. Paid-service prompts/responses are
  not used to improve Google's products, but limited safety logging and global
  processing remain possible. Verify the actual project and applicable agreement.
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data):
  API data is not used for training by default without opt-in. Default abuse
  monitoring for Chat Completions can retain data for 30 days, with endpoint,
  image-safety and account-control exceptions. No zero-retention or EU-only claim
  is made for the installed project.
- [Supabase backups](https://supabase.com/docs/guides/platform/backups) and
  [SMTP](https://supabase.com/docs/guides/auth/auth-smtp): the existing recovery and
  delivery gates remain as documented in `local-windows-follow-up-2026-10-24.md`.

## Verification

- **821 unit tests in 91 files pass**, including outgoing recipe/feedback/memory/
  history tripwires, provider and cached-result handling, decoded structured
  output, safe follow-up after a refusal and worker cache/authorization rules.
- TypeScript, ESLint, synthetic standalone build, portable Node smoke and client
  budget pass. Largest compressed client script: 109,876 bytes. Prototype build
  also passes. Build warnings about existing dependency directives remain
  non-blocking; no dependency versions were changed for this review.
- Fresh lockfile runtime audit: **zero known advisories**, using Node 22/npm in
  a disposable read-only container with only package manifests mounted. No
  credentials or application data were supplied to that container.
- Actual built local server returns the new security headers. It remains healthy,
  loopback-only, non-root, read-only and limited to 768 MB, with credentials kept
  outside container environment variables.
- Actual browser/test-backend acceptance: **Chef 17/17, Cook Mode 20/20,
  households/meals 10/10 and nutrition 9/9**. Includes real Gemini generation,
  explicit saving, export/reset/erasure, owner/peer isolation, revocation and
  complete offline cooking reload. Browser runtime and fixture cleanup errors: 0.
- Nutrition lifecycle tests dispatch persisted page events and exercise ordinary
  back navigation. This is not certification of real Safari/Android BFCache
  behavior. Accessibility/overflow checks pass at 360, 390, 1024 and 1440 pixels;
  mobile and desktop screenshots were visually inspected.
- An encrypted v4 application snapshot with 35 table sections and zero Auth
  accounts passed the isolated PostgreSQL restore rehearsal. Ten retained rows
  remain; erasure receipts are intentionally retained, not cleared as fixtures.
  No Storage files remained. Restore containers were cleaned. Full platform
  recovery remains a release gate, not a passed result.

Evidence: ignored `dist/local-windows-{chef,cooking,meals,nutrition}-report.json`,
screenshots under their QA directories, `dist/client-budget.json` and private
Windows backup/restore status. No keys, tokens, synthetic passwords or private
exports belong in this report. Changes go only to the existing development
branch; public production release remains unapproved.
