# WineSnap Supplier and Data Protection Review

Date: 2026-10-25. Scope: standalone source, the Windows test installation and
public supplier documentation. Production was not accessed or changed. No new
accounts, contracts, subscriptions, billing settings or supplier permissions
were created or accepted.

The [read-only release preflight](release-readiness-2026-10-25.md) now checks
recorded acceptance separately from local operational health. No new supplier
approval or account-specific evidence was established by that follow-up.

**Decision: public release remains blocked on account-specific evidence and
operator approval.** Document review is complete for the sources listed below;
it does not establish which terms bind Boleo AI or certify legal compliance.

## Completed Locally

- Removed browser connections to Google Fonts. The same Inter and Cormorant
  Garamond families now ship as pinned local WOFF2 assets, with full OFL licenses
  and checksums. No runtime font service or new package dependency is required.
- Separated `VITE_PRIVACY_SUPPLIERS_VERIFIED` from working privacy operations.
  Local test keeps export/erasure verification enabled but supplier approval
  explicitly false. Both checks plus complete contact/policy fields are needed
  to remove the unverified privacy notice. This is an operator assertion, not an
  automatic legal attestation or a public deployment authorization.
- Explained provider retention, optional tunnel handling and transfer uncertainty
  in both UI languages, without promising zero retention or EU-only processing.
- Prepared the [processing record, balancing assessment and DPIA screening](privacy-processing-assessment-2026-10-25.md).
  These remain an operator-review draft, not newly approved lawful bases.

## Evidence Status

`reviewed` means a public document was read; `observed` means source or local
runtime was checked; `unverified` means account-specific evidence is missing.
No supplier is marked fully approved solely because its API works.

| Service                   | Observed role and data                                                                                                                                                            | Public review                                                                                                            | Account acceptance                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase                  | Test Auth, relational records, saved images, functions and operational metadata. User-owned data stays subject to RLS and erasure.                                                | DPA and latest linked subprocessor list reviewed.                                                                        | Unverified contracting customer/entity, actual database region, applicable account terms, backup/log retention, support access and notification contact. Dashboard attempt for test only reached sign-in; no credentials or login flow were automated. |
| OpenAI API                | Server-side label images/text; fixed global Chat Completions endpoint, `store:false`, no browser provider key.                                                                    | Official API data-control documentation reviewed. Account-specific DPA/business agreement not verified.                  | Unverified key-to-business-project ownership, agreement, sharing opt-in, retention controls and residency eligibility. Existing encrypted key presence does not prove these.                                                                           |
| Google Gemini API         | Server-side wine questions/recommendations and explicit Chef context/history/feedback. No shared diner profiles.                                                                  | API terms, processor terms, abuse policy and optional logging policy reviewed.                                           | Unverified exact key-to-Cloud-project binding, active billing, account entity/region, project logging/datasets, notification contact and applicable transfer terms. No Google setting was changed.                                                     |
| Cloudflare                | Optional owner-email-protected Quick Tunnel. It handles connection traffic, source IP and the email/PIN gate; direct loopback use bypasses this path.                             | Customer DPA and Quick Tunnel documentation reviewed.                                                                    | Unverified applicability of a customer agreement/DPA to this particular accountless test service, processing/retention and eventual owned-domain service. Do not assume standard customer DPA acceptance from a working tunnel.                        |
| Public price catalog      | Local test downloads a fixed public catalog from `susbolaget.emrik.org`, then matches locally. No user wine name, account ID, cellar row or token goes to that mirror.            | Source inspection; commercial data rights, availability and source terms still need separate acceptance.                 | No user-data processor relationship inferred from this flow. Server IP/connection metadata remain visible to the host. Future `bolaget.io` query mode has a different disclosure boundary and needs reassessment.                                      |
| Email sender              | Custom SMTP is not configured in current test evidence; no real delivery is accepted. Tunnel PIN delivery is not WineSnap password-recovery delivery.                             | Existing SMTP gap retained.                                                                                              | Select a sender, establish terms/retention, verify delivery and monitored support/incident contact before public registration.                                                                                                                         |
| Local storage/development | Boleo AI's Windows host, Docker runtime and DPAPI-encrypted application snapshots. GitHub receives source and synthetic CI artifacts, not credential stores or user-data exports. | Source/operational isolation reviewed in the security report.                                                            | Physical host/OS backup/sync, off-device recovery, development access and any future CI reports containing personal data need operator control. Local serving does not make Supabase or AI local.                                                      |
| Font delivery             | Own-origin static assets.                                                                                                                                                         | Fontsource 5.3.0 archives checked against registry SHA-512; individual files checked with SHA-256; OFL notices included. | Removed as an end-user external font recipient. Fontsource/npm were asset acquisition sources, not runtime processors of app traffic.                                                                                                                  |

## Provider Findings and Required Decisions

### Supabase

The [current DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)
is dated August 1, 2026 and forms part of the applicable customer agreement. Its
regional-storage language does not eliminate support or onward-transfer review.
It incorporates transfer mechanisms and requires customer processing details.
The [October 12 subprocessor list](https://supabase.com/legal/subprocessor-list/October-12-2026.pdf)
includes hosting, support, monitoring and communications providers across countries;
not every listed service necessarily receives every WineSnap field. Confirm actual
services, customer identity, regional settings and applicable safeguards rather
than treating the public list as proof of account configuration.

No production region is inferred from test, and no database location is inferred
from an edge response header, DNS, API hostname or low latency.

### OpenAI

[API data controls](https://developers.openai.com/api/docs/guides/your-data)
distinguish application storage from abuse logs. Default API content is not used
for training without opt-in; abuse monitoring can retain content for up to 30 days
with safety/legal exceptions. Image safety review and prompt-cache limitations
also matter. `store:false` is not zero retention. The configured global endpoint
does not prove EU processing; changing to a regional hostname without account
eligibility and model/endpoint acceptance would not establish it either.

Before release, obtain the business account/project linkage, applicable agreement
and DPA evidence, sharing status and actual retention/residency settings. Do not
call organization-admin APIs with a normal inference key or broaden its access.

### Gemini

The [API terms](https://ai.google.dev/gemini-api/terms), effective March 23, 2026,
require Paid Services for public API clients in the EEA/Switzerland/UK and restrict
under-18 use/audience. Regional data-use provisions extend paid-service data
treatment to otherwise free services in those regions; they do not waive the
public-client paid-service requirement. Working inference is not billing proof.

The [abuse policy](https://ai.google.dev/gemini-api/docs/usage-policies) describes
55-day retention of prompts, context and output for enforcement. The
[separate project logging policy](https://ai.google.dev/gemini-api/docs/logs-policy)
describes optional developer logs, configurable 7/14/28/55-day expiry and datasets
without a set retention period. Disable optional content logging/sharing unless
separately justified; this would not switch off mandatory abuse monitoring.

The [processor terms](https://business.safety.google/processorterms/) cover
processor instructions, assistance and subprocessors; incident delivery depends
on a valid notification contact. Confirm the applicable account agreement,
international-transfer clauses, exact project and that contact. Do not send real
users' records into AI Studio datasets as a test or accept supplier terms here.

### Cloudflare and Hosting

[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
are documented for development/testing, not production. The protected test tunnel
remains unchanged. The [customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
describes processor duties, subprocessors, incidents and transfer provisions;
its existence does not prove that this accountless service is covered for Boleo
AI. Resolve the actual service/agreement before selecting a permanent path.

## Operator Acceptance Checklist

1. Verify Boleo AI's legal identity and account ownership for each intended service.
   Store billing/project identifiers and account screenshots privately, not in Git
   or chat; record only a protected evidence reference and review date here.
2. Establish which agreement/DPA already applies, including automatic incorporation
   where applicable. Complete missing processing annexes and contacts through an
   authorized representative; do not unnecessarily create duplicate agreements.
3. Record storage/processing/support locations, subprocessors, the applicable
   transfer mechanism and any required assessment/additional safeguards. EU database
   placement alone is insufficient evidence of the entire processing chain.
4. Confirm business AI projects, Google billing and adult-only audience controls;
   inspect optional logging, sharing, datasets and actual deletion/retention.
   Keep family/child and health-related expansion test-only pending risk review.
5. Approve the processing record, purpose-specific lawful bases, security balancing
   assessment, retention schedule, rights process and DPIA decision. Set a working
   supplier-incident and data-rights contact. Public source review cannot approve
   these organizational decisions.
6. Record named reviewer/date/evidence and outstanding exceptions before setting
   `VITE_PRIVACY_SUPPLIERS_VERIFIED=true`. This does not clear the separate recovery,
   SMTP, owned HTTPS, device and production rollout gates.

[IMY's processor-agreement guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsansvariga-och-personuppgiftsbitraden/personuppgiftsbitradesavtal/)
supports identifying the actual controller/processor relationship and documenting
instructions. [IMY's transfer guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/overforing-till-tredje-land/)
supports assessing the actual transfer and safeguards rather than assuming a DPA
or TLS alone settles it. These are acceptance tasks, not claims of completed legal
review or a substitute for advice on disputed or high-risk processing.

## Verification

- **829 unit tests in 92 files pass**, including the separate approval gate,
  inherited-configuration isolation, font hashes/licenses and worker version cleanup.
- TypeScript, ESLint, synthetic build, portable Node smoke, prototype build and
  client budget pass. Largest compressed client script: 109,762 bytes. Fresh
  runtime dependency audit: zero known advisories; dependency versions unchanged.
- The actual Windows test app passes all five privacy browser groups: unverified
  notice, both local variable-font families including extended Latin, bilingual
  accessibility/layout, distributed licenses and offline font fetches through
  the current worker. Eight language/viewport combinations cover English/Swedish
  at 360/390/1024/1440 pixels. No external request attempts, runtime errors, Axe
  violations or horizontal overflow were observed in that public-page test.
- Local app remains healthy, loopback-only, non-root and read-only. Existing
  encrypted AI configuration is present; no new live AI call was needed for this
  supplier review. No new accounts, SQL migrations or production requests occurred.
- Safe evidence is in ignored `dist/local-windows-privacy-report.json`,
  `dist/supplier-privacy-qa/` and `dist/client-budget.json`. New fonts are 204,700
  bytes total before transport compression; the four selected subsets are
  included locally, not fetched from a vendor during use.

Reproduce the read-only public-page check after starting the actual local test
app with `node scripts/check-local-windows-privacy.mjs`. It requires the existing
Windows QA runtime, no API credentials, synthetic accounts or AI request.

Supabase integration discovery found an available but uninstalled connection.
Its optional setup can enable account-scoped follow-up; no access was granted
or treated as confirmed, and work did not wait on it. Do not send API keys or
private supplier evidence in chat. Privacy release approval remains false while
account evidence is absent.
