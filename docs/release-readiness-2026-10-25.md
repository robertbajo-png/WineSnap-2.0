# WineSnap Release Acceptance Check

Date: 2026-10-25. Scope: the source checkout and existing local test status only.
No production operation, agreement acceptance or supplier setting change occurs.

## Current Result

Public release is still blocked. Supplier account access is unchanged; no new
account-specific agreement, billing, region or data-control evidence is accepted.
The tool does not create approvals or interpret a generic request to continue as
legal sign-off. The [supplier review](supplier-privacy-review-2026-10-25.md) and
[privacy assessment draft](privacy-processing-assessment-2026-10-25.md) remain the
substantive checklists.

## Automated Command

Run `npm run release:check` from the source checkout, not the web container.
The equivalent is `node scripts/check-release-readiness.mjs`. No arguments,
provider keys, login, network requests or database access are needed. Output is
sanitized JSON; the command does not write files, deploy or change build flags.

- Exit 2: blocked; this is the expected current result, not a failed app test.
- Exit 0: the recorded operator attestations satisfy this preflight contract.
  It is not independent proof of agreement validity, domain ownership or legal
  compliance, and it does not itself authorize an automated deployment.
- Exit 1: invocation/runtime failure, never approval.

Missing, invalid, incomplete, stale or future evidence cannot pass. The exact
candidate commit must match an identified, clean source checkout. A declared
release origin must have suitable HTTPS origin syntax, without credentials,
queries, paths, a test hostname or a temporary Quick Tunnel. No DNS request is
made and syntax is not ownership verification. The disposable Supabase project
cannot be declared the public release backend.

## Private Operator Records

`config/release/acceptance.example.json` documents the format, with all ten gates
pending and no selected target. No private evidence file is created by the tool.
Only after actual acceptance, operator records may be stored in the ignored
`.winesnap-release-evidence.local.json` in this checkout. Never force-add that
file, credentials, account screenshots or agreement copies to Git.
Git ignore is not encryption or an access-control check: protect operator records
with appropriate local permissions and retention. The tool validates bounded
input and avoids disclosure; it does not establish the file's confidentiality.

Each verified decision needs a human reviewer, ISO timestamp and an opaque
protected evidence reference, not a password, token or account export. References
are not followed or printed. Reconfirmation within 30 days and at most five
minutes of clock skew are internal preflight rules, not statutory contract
expiry periods. A changed candidate requires fresh candidate-bound acceptance.

The ten decisions cover Supabase, OpenAI, Gemini, hosting, privacy governance,
audience/DPIA, full recovery, email, candidate/device acceptance and release/
rollback authorization. A provider's public documentation, a working API or the
two privacy build flags do not substitute for these records. Not-applicable
scope questions require a documented decision, not silently skipping a gate.

## Local Operational Hints

On Windows the command may read only the existing bounded maintenance, backup and
restore status JSON under `%LOCALAPPDATA%\WineSnapHosting`. It does not open keys,
encrypted snapshots, browser data or management sessions. Redirected paths,
malformed files and files over 64 KiB are refused without exposing their content.

These advisory hints require recent exact-test-project success, zero maintenance
failures/backlog, current 35-table application snapshot coverage and a cleaned
isolated restore of that same latest snapshot. The 26-hour freshness window is
an operational check, not a data-retention period. Hints never satisfy release
gates or turn application snapshots into full Auth/Storage/platform recovery.

GitHub Quality checks enforce that ordinary CI without private operator evidence
stays blocked. No deployment action is added. Regression tests cover all gates,
candidate changes, timestamps, targets, invalid input, private-data redaction,
path redirection and application-vs-platform recovery.

## Verification

All 865 unit tests in 93 files pass, including 36 release-preflight regressions.
TypeScript, ESLint, synthetic standalone build, Node runtime smoke, prototype
build and client budget pass. Largest compressed client script remains 109,762
bytes. No application UI or runtime configuration changed in this follow-up.

Read-only inspection finds current local-test maintenance, application backup
and matching isolated application-restore reports. The actual local app also
passes the existing healthy/loopback/non-root/read-only check. This does not
verify supplier accounts, platform backups, physical devices or production.
The actual command correctly reports blocked acceptance rather than upgrading
these observations to release approval. No operator evidence file was created.
