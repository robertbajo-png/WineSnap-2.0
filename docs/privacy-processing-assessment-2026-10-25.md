# WineSnap Processing Record and Risk Assessment

Date: 2026-10-25. **Draft for operator approval, not an adopted legal opinion.**
Scope: intended independent release and the currently isolated Windows test.
Public launch and health tracking remain unapproved. No supplier agreement,
new lawful basis or consent model was accepted through this engineering work.

## Controller and Accountability

Public trading name: Boleo AI. Approved public postal contact: Morkullevagen 23,
30570 Haverdal, Sweden (the UI preserves the supplied Swedish spelling).
Actual legal entity/registration, authorized decision maker and actively monitored
support, supplier-notification and incident contacts remain to be verified.
Do not substitute a private email address or invent a company registration number.

Data subjects: adult account holders, people in intentionally shared content,
invited household adults and children described by an adult in optional diner
profiles. Service accounts/developers have a separate provider account-data role.
An account holder is not automatically authorized to provide every other person's
data. No automated decision with legal or similarly significant effects is
intended, but preference inference remains profiling and needs transparent purpose.

## Processing Record

This initial record maps source behavior, not production configuration. For each
row Boleo AI must approve the actual purpose, necessity, basis, recipients and
retention before release. Proposed bases preserve the earlier account-service
policy but do not automatically extend it to children, health data or new purposes.

| Activity and purpose                                  | Data and people                                                                                     | Recipients and safeguards                                                                                                     | Retention and proposed basis for review                                                                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account, login and requested private collection       | Adult contact/Auth identifiers, wines/photos, purchases, ratings, collector records and preferences | Supabase and local app; owner RLS, protected image reads, recent-auth erasure and bounded exports                             | Saved records until removal or account erasure, with inactivity review rather than automatic deletion. Contract only for processing objectively necessary to requested service.                                                                              |
| Explicit public profile/wine/link sharing             | Selected wine/profile fields and possible people in photos                                          | Viewers chosen by visibility/share rules; revocation limits future reads, not copies already obtained                         | Until withdrawn/erased, with receiver-copy limitation. Assess necessity/basis for this optional feature; a UI share action is not automatically GDPR consent for unrelated use.                                                                              |
| Label reading, wine chat and personal recommendations | Submitted label/text, bounded own collection/preferences and conversation                           | OpenAI/Gemini through server, no provider key in browser; minimize context, no tools, quotas                                  | App conversations 90 days by active maintenance; unsaved scan not stored in cellar. Provider retention separate. Assess necessity and clear user information for AI processing, not a blanket model-training basis.                                          |
| Recipes, Cook Mode, Chef and Food Memory              | Own recipe versions, sessions, feedback, confirmed culinary evidence, bounded Chef messages         | Supabase, local owner-scoped offline copy and explicitly requested Gemini context; inspect/correct/forget/reset               | Recipes/history/memory until removal; drafts/requests 24 hours, Chef conversations 90 days, offline access validity 24 hours. New culinary purposes need explicit approval and compatible notice.                                                            |
| Shared households, diners and meal history            | Adult-entered name/nickname, adult/child type and ordinary food preferences; private ratings        | Only invited adults and explicitly shared profiles; no peer cellar access or diner profiles sent to AI                        | Until deletion; invitation 48-hour use window plus cleanup after seven further days. Determine authority and lawful basis for each non-user/child context; the adult user's contract alone is not assumed sufficient.                                        |
| Temporary recipe nutrition estimates                  | Opt-in recipe mode, gram weights, labels, limit and substitution calculations                       | Component state only, public reference bundle; no nutrition table/profile or automatic AI transfer                            | Discard on view/account change and page lifecycle reset; manually submitted culinary substitution becomes a separate Chef request. No daily targets, ketone readings, treatment or child diets.                                                              |
| Security, erasure and recovery                        | Account UUIDs, quotas, fixed failure codes, operational timestamps, erasure ledger and snapshots    | Restricted server/Windows operations, DPAPI copies, no prompt bodies in app error logs, receipt reconciliation before restore | Quota 30 days, erasure receipt 30 days after completion, local snapshots seven days/seven copies. Diagnostic/security log targets 14/30 days remain to be proven for each actual system. Limited legitimate interests proposed below, not silently approved. |
| Interface and connection delivery                     | Server/device connection metadata; font requests contain no account content                         | Own-origin local fonts; Supabase/AI when used; optional Cloudflare email-protected test path                                  | No external font recipient. Provider-side connection/log retention and permanent hosting remain unverified; no analytics/marketing purpose introduced.                                                                                                       |

The [supplier review](supplier-privacy-review-2026-10-25.md) separates known
endpoints from unverified account locations, retention and agreements. Rights
workflow: verify identity proportionately; export own records/files, correct,
reset memory, erase account and handle provider-held records through the operator.
The earlier [privacy runbook](privacy-operations.md) remains the technical procedure.
Keep private decision/evidence copies access-controlled, not in a public source repo.

The structure follows the accountability fields in
[GDPR Article 30 via IMY](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/).
No claim is made that all small-business exemptions or organizational obligations
have been determined. Regularly revise the actual record rather than treating this
draft or an unverified feature flag as the authoritative legal register.

## Security Legitimate Interest Assessment

**Purpose:** protect private collections, prevent quota abuse and ensure erased
accounts do not reappear after recovery. Not advertising, model training,
profiling children or retaining conversation content for debugging.

**Necessity:** counts/UUIDs/timestamps support atomic quotas and limited erasure
reconciliation; purely anonymous totals cannot block the relevant account. Avoid
full IP histories, arbitrary request dumps and prompt/photo logs. Prefer aggregate
metrics and short fixed codes when they serve the same purpose.

**Balancing:** an adult can reasonably expect security checks, but UUIDs and
preferences are still personal data. A shared device, child-related text or a
restored backup increases harm. Limit access, purpose and time; disclose the
processing and provide objection/rights review. A security interest does not
justify indefinite logs, excessive photo copies or unrelated analytics.

**Decision pending:** Boleo AI must approve necessity, actual retention and the
balancing outcome, identify the responsible reviewer and record objection handling.
Unknown supplier log periods and full recovery are unresolved safeguards.
The [IMY balancing guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/)
requires documenting the necessity and comparison of interests; the outline above
is a project-specific assessment proposal, not a signed decision.

## DPIA Screening

Engineering recommendation: complete and approve the screening before any public
launch, and carry out a full DPIA for the expanded family/nutrition/AI-memory scope
unless a documented, qualified determination establishes that it is unnecessary.
Do not infer a legal conclusion merely from a score, company size or Keto label.
[IMY's DPIA guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/)
ties the obligation to likely high risk; unresolved high residual risk can require
prior consultation. Our recommendation is precautionary, not an authority ruling.

| Risk                                                                            | Existing reduction                                                                                                       | Residual decision or missing evidence                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI receives personal/health/religious information hidden in free text or photos | Narrow selected context, explicit requests, supported key/medical tripwires, warnings and no clinical memory model       | Filters are incomplete; determine special-category handling and lawful routes. No health tracking expansion. Provider logging/transfers unresolved.                             |
| Child data is supplied or shared without authority; a minor directly uses AI    | Private diner defaults, explicit sharing, adult household confirmation, no child wine/diet inference or diner-to-AI flow | Verify audience/access controls, guardian authority, age-appropriate notice and rights for non-users. A checkbox is not proof of all of these.                                  |
| Cross-account data, revoked sharing or stale browser state leaks                | RLS/JWT ownership tests, current image checks, private account cache, revocation reload, page-state reset                | Shared-device and physical-phone behavior; compromised clients and previously copied data cannot be recalled.                                                                   |
| Preference inference becomes intrusive or silently changes purpose              | Confirm/correct/forget/reset evidence, no health targets, no automatic meal-rating memory                                | Resolve optional personalization basis/objection model; no use for advertising, decisions about eligibility or new model training without a separate assessment.                |
| Supplier compromise, unapproved training/logging or international access        | Fixed server endpoints, secret isolation, `store:false` for label calls, bounded payloads                                | Account/DPA/billing/sharing/notification and transfer evidence still missing. Local server encryption does not make provider inference end-to-end encrypted from that provider. |
| Lost host or restore recreates erased data                                      | DPAPI snapshots, seven-day rotation, 30-day receipts and isolated application restore                                    | Full Auth/Storage/platform and off-device recovery not accepted; verify OS backup/sync and protection of recovery material.                                                     |

Approval record still required: scope/version, reviewer/authority, affected-user
input where appropriate, risks, alternatives, mitigation owners, residual-risk
decision and next review trigger. Reassess at provider/model/region changes,
permanent internet launch, new analytics, child accounts, health data or voice.

## Incident and Rights Operations

Proposed incident owner: an authorized Boleo AI representative; named person,
substitute and monitored notification route must be assigned privately. Preserve
minimal evidence, contain access without destroying the audit trail, assess
affected data/people and coordinate with suppliers. Do not change production or
make a regulatory filing as an automated consequence of this draft.

For a reportable breach, assess the notification deadline from awareness, not
from completion of investigation; IMY describes a 72-hour window and possible
supplements. Document both report/no-report reasons and assess notification of
affected people. See [IMY's incident guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/hantering-av-personuppgiftsincidenter/).
The supplier contacts, escalation tabletop and monitored delivery are not yet
accepted. Ordinary data-rights requests use the separate verified identity and
response process, not publication of exports or personal identifiers in Git.
