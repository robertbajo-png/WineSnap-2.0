# Owned Windows Release Preflight

Date: 2026-11-04. Scope: source-only release preparation for the separate owned
Windows installation. No deployment, production/test access, account operation,
provider request, DNS change or operator attestation is performed.

## Correct Operational Scope

`node scripts/check-release-readiness.mjs` no longer reads the abandoned test's
WineSnapHosting reports. On Windows it reads only the bounded owned reports and
archive inventory under `%USERPROFILE%\WineSnapOwned`, reusing the existing owned
operations assessor. It never opens or decrypts credential stores or backups.

The existing read-only supervisor check is shared with
`scripts/check-owned-operations.mjs`. Its absolute PowerShell executable and fixed
status script run with bounded output, a timeout and the system-only environment
allowlist. Provider secrets and Node injection settings are not inherited. It does
not invoke the provisioning/start wrapper. Missing or malformed output becomes
unverified, never an exception that reveals raw stderr or a reason to start a job.

The release report now contains `ownedWindows`, not `localTest`. Its scope is
`owned_windows_only`, `affectsReleaseApproval` is always false, and all existing
freshness, exact-latest-archive, restore isolation, gate and maintenance checks
remain in effect. On other platforms `available` is false and owned status stays
unverified. This does not prevent the source-only operator contract from being
checked in CI.

Operational reports are advisory consistency checks. They are not new proof of
archive decryption, source identity, agreement validity or actual public access.
A newly rotated daily archive can require a new matching rehearsal while the app
is still healthy. The preflight does not automatically run that rehearsal.

## Explicit Owned Backend Evidence

The ignored operator-record path is unchanged:
`.winesnap-release-evidence.local.json`. No such record is created by this work.
The new fully pending template is `config/release/owned-windows.example.json`:

- Version 2 declares the exact backend kind `owned-windows`, the project
  `winesnap-owned-local` and an explicitly selected 32-hex installation ID.
- The exact candidate commit, clean source checkout, acceptable HTTPS origin and
  ten current, human-reviewed decisions remain mandatory.
- A backend-responsibility decision replaces the cloud-specific Supabase account
  decision. Database/Auth/Storage suppliers, hosting responsibility, location and
  retention still need review; self-hosting is not automatic acceptance.
- OpenAI, Gemini, hosting/delivery, privacy, audience/DPIA, full recovery, email,
  candidate/device acceptance and rollout/rollback remain separate required gates.
- Legacy version 1 is still strict and cloud-specific. Its record cannot become a
  Windows record merely by changing the version number or copying approvals.

The backend identifier is an operator declaration, not independent installation
verification. Origin syntax is not DNS ownership verification. Output does not
print the installation ID, reviewers, private references or unknown fields.
Malformed/mixed records, missing decisions, expired/future reviews and a changed
candidate remain blocked. There is no automatically approved or deferred status.

## Deferred Work Is Not Approval

The owner deferred an off-device copy and a physical second-PC recovery test after
the verified portable archive. They remain unverified and are not restarted here.
See [the portable checkpoint](portable-backup-2026-11-01.md). This preflight neither
reads the passphrase nor replaces the existing encrypted archive or its receipt.

External SMTP delivery, real mobile/cellular/camera and Windows cold-boot acceptance,
supplier/privacy decisions and explicit rollout authorization remain separate
release requirements. Existing private/local use is not blanket public release
approval. No operator records, legal sign-off or supplier acceptances are invented.

## Validation

Regression coverage checks the old and new strict evidence contracts, all ten
mandatory owned decisions, target/candidate selection, expiry, origin restrictions,
redaction, deferred-status rejection and independent operational hints. The CLI
fixture redirects the temporary user's home as well as local app data, so it cannot
inspect the real owner's runtime. Shared supervisor tests mock process execution
and check fixed arguments, timeout, output bounds and secret-free environments.

The preflight remains read-only. Exit 2 means operator acceptance is still blocked;
it does not mean a working app is broken. The check cannot deploy, sign agreements,
send email, resume a tunnel or waive a gate. Green unit/CI tests never authorize
publication or a cutover from the old production.

The manual Windows invocation returned the expected blocked exit 2, ten pending
operator decisions, `readOnly: true`, `productionTouched: false` and no historical
`localTest` hints. Its bounded supervisor inspection did not verify runtime health,
and the latest app/gate archives did not have current matching restore reports.
These remain explicit advisory issues, not a claim that the app is down. This
source-only follow-up did not restart services, run new backups or waive those
issues. The focused release/operations/supervisor regression run passed 105 tests.
