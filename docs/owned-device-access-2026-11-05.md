# Private Password-Free Device Access

Owner request: avoid both WineSnap passwords on their own devices, without giving
other visitors access. This is an owned-only, opt-in identity handoff, not removal
of authentication, RLS, the gate or account isolation. Production and hosted test
are out of scope. No DNS/tunnel/firewall/OS-security change is involved.

## Mechanism

- The installed digest-pinned Authelia 4.39.28 already supports passkey login.
  The opt-in adds discoverable, user-verified WebAuthn credentials through that
  provider. No custom WebAuthn engine, virtual owner authenticator, experimental
  factor policy or credential synchronization service is introduced.
- The gate stays default-deny and permits only `robert` on the approved leaf
  hostname. Device access now adds an owner-only two-factor step-up for the
  existing `/admin` view; ordinary app routes keep their one-factor policy.
  Existing Secure/HttpOnly/SameSite cookies, 30-minute inactivity and
  two-hour maximum sessions remain. An unlocked approved device/browser can still
  access its active session; device locks and safe passkey storage are required.
- After that provider authenticates the owner, the app exchanges the verified
  gate session for the existing account's normal GoTrue session. It independently
  asks `/gate/api/state`; forged `Remote-User`/Authorization headers are ignored.
- The binding is a single existing confirmed user UUID, selected by the operator's
  explicit email on the exact owned backend. The client cannot select an email,
  UUID or redirect. Normal owned backend credentials remain in private tmpfs.
- The exchange requires the exact origin/host and JSON intent, rejects duplicate
  cookies, rate-limits exchanges, and returns private/no-store data without CORS.
  Only a normal `authenticated` session for the configured UUID is accepted.
- GoTrue's existing-account recovery grant is consumed server-side, without a
  password change or email send. This avoids magiclink generation's account-create
  behavior during deletion. Missing/inactive/deleting accounts fail closed.
- The browser uses the existing Supabase session machinery and existing per-user
  data policies. Explicit sign-out ends this browser's app and gate sessions;
  automatic handoff is suppressed until an explicit new device sign-in.

No route is exempted from the gate; no owner cookie/token is embedded in client
source or a public URL. Other visitors still see the gate. The loopback test
browser and hosted builds do not perform the device handoff.

## Operator Workflow

Use only `configure-owned-device-access.ps1`, never the private Node operator:

```powershell
./scripts/configure-owned-device-access.ps1 -Action Prepare -OwnerEmail '<local owner email>'
./scripts/run-owned-windows.ps1 -Action Update
./scripts/configure-owned-device-access.ps1 -Action Enable
./scripts/configure-owned-device-access.ps1 -Action Enroll
./scripts/configure-owned-device-access.ps1 -Action Status
```

Prepare validates the exact labelled web/gateway/Auth containers and existing
confirmed account. It stages a disabled binding and CurrentUser-encrypted,
one-hour enrollment material. It does not activate access or change a password.
Installation and source/security verification must precede Enable.
Repeating Prepare explicitly revalidates the existing account and installation.
If the staged credential still exactly matches the current gate, it renews only
the one-hour operator window and preserves all passwords/keys and activation.
Foreign mappings or changed storage/session keys fail closed.

Enable preserves the existing gate session, storage-encryption and reset keys.
It replaces only the unavailable gate password hash with an operator-generated
random setup credential, retained only in Windows-encrypted enrollment material.
The original encrypted gate store gets a private rollback copy. The app password
and all wine/recipe/image data stay unchanged. It injects the binding and restarts
only the verified gate/proxy to enable passkeys. Failures remain closed and may
require operator completion; do not blindly replay or overwrite credentials.

Enroll uses a normal provider login with that private setup credential in a fresh
visible browser. Its identity-elevation code is consumed privately from the
provider's local file notifier, never printed/shared. The human must create and
approve their real passkey using their authenticator. The registered credential
then gets an encrypted gate backup and isolated restore rehearsal before the
fresh-context sign-in check. The helper never approves
Windows Hello, phone biometrics, device PINs or password-manager dialogs.

The setup window waits up to 30 minutes. It then checks a separate cookie-free
context for actual passkey sign-in and the correct app account, requiring a real
human approval. No browser storage state, trace, HAR, owner screenshot or cookie
artifact is exported. The operator report contains booleans/phase only.

`Status.completed` means the read succeeded, not that a device is enrolled.
Completion requires the nested enrollment's `passkeyLoginVerified` and
`appOwnerSessionVerified` flags. Preparing/Enabling is not completion.

Additional devices require an existing personal passkey or another approved
enrollment. Do not register shared authenticators/accounts. Removing a passkey
does not promise immediate invalidation of every existing app/gate session;
account/session recovery remains an explicit operator procedure.

## Recovery And Verification

Before activation, retain/rehearse the existing local app/gate backups. New
passkeys live in the gate SQLite volume and require a new gate backup afterward.
The binding under the private runtime root must be re-established explicitly on
recovery if absent; never infer an owner mapping from browser or HTTP input.
This is not off-device recovery or public-release approval.

The gate configuration fingerprint inputs are unchanged: no editing of the
existing gate module, Nginx routes, volume/network checks or deny probes is needed.
The opt-in is read from a private installation-bound metadata file; no flag
silently enables hosted production or a default synthetic build.

Verify negative identity/origin/cookie/role/rate-limit cases, normal Auth/RLS,
logout clearing, real gate denial, and a human-created passkey sign-in. Virtual
or mocked proof is not human-device enrollment. Deployment and live results
must be recorded only after they actually occur.

Primary references: [Authelia passkeys](https://www.authelia.com/overview/authentication/security-key/),
[WebAuthn configuration](https://www.authelia.com/configuration/second-factor/webauthn/),
and the pinned vendor's [session state endpoint](https://github.com/authelia/authelia/blob/v4.39.28/internal/handlers/handler_state.go).

## Verification Receipt

Source `bd2180e` passed Quality and Database Safety on both push and pull-request
workflows. The full suite passed 1,239 tests across 121 files with one skipped;
the local focused device/gate suite passed 78 tests. Typecheck, lint, dependency
security checks, synthetic runtime build/probes and client budget passed in CI.
PowerShell AST parsing passed for the changed operator/runtime wrappers.

The existing encrypted gate archive was restored into an isolated rehearsal:
SQLite integrity, 26 tables, credential-key recovery and cleanup passed. This is
not a portable/off-device restore claim. Private enrollment staging succeeded;
both metadata and DPAPI enrollment files have explicit protected owner/System
ACLs. Failed encrypted staging files were removed without changing live keys.

The owned-only app update completed at 2026-11-05T21:59:28Z. Database, Auth,
storage and app checks passed, preserving `dark-v1` and the approved HTTPS origin.
All 37 installed migrations were retained; none were newly applied. A running
owned web image was explicitly retained as
`winesnap-owned:passkey-rollback-20261105-222945`; do not rely on untagged images
surviving. An actual anonymous HTTPS POST
to the new session path returned 302 to the gate with no-store caching.

Passkey activation completed at 2026-11-05T22:11:59Z. Core Auth/storage/app checks
and all seven private-ingress denial probes passed. A wire-level negative test
then caught built-in fetch dropping the required Host on the internal gate read.
Source `98cbf7a` switches that read to bounded Node HTTP, without redirects, and
passed Quality plus 38 focused local tests including the HTTP transport cases.
The corrected owned-only update completed at 2026-11-05T22:31:49Z, again without
new migrations or changes to existing data. Actual post-update tests passed:
anonymous HTTPS requests redirect to the gate (302), missing gate sessions are
rejected (403), and forged cookies plus identity headers are rejected (403).
All three responses were no-store.

Private setup authentication and normal provider identity elevation passed. The
setup cookie now retains the provider's Domain-cookie scope; a duplicate
host-only cookie previously caused elevation denial. The owned-only encrypted
operator window was renewed without a gate restart or password/key rotation.
Both Chrome and the bundled browser were tried for the visible enrollment page.
The anonymous portal renders with four buttons and no failed requests, but the
authenticated settings page has not reached usable controls in the visible
helper. Desktop presence/unlocked-state confirmation was requested from the
owner. No owner screenshot, browser state, OTP or token was exported.

Real human-device enrollment, new credential backup and fresh passkey/app-owner
sign-in are still pending. Do not record these as completed or claim that all
personal devices are paired. A prepared binding, activated gate or green source
build alone is not proof of password-free owner sign-in. The old production was
not changed.

## Registration Control Follow-Up, 2026-11-08

The November 7 viewer reached the settings page, but its generic first-button
readiness check did not establish that registration was available. The operator
window expired without a credential. A read-only vendor CLI check on November 8
confirmed that `robert` had no registered WebAuthn credential; neither enrollment
nor mobile sign-in was retrospectively recorded as successful.

The owner then reported that Add was missing. The pinned provider's
[configuration handler](https://github.com/authelia/authelia/blob/v4.39.28/internal/handlers/handler_configuration.go)
only exposes enrollment methods when an access-control rule enables two-factor
protection. Its
[authorizer](https://github.com/authelia/authelia/blob/v4.39.28/internal/authorization/authorizer.go)
checks for such a rule globally. A passkey-login flag alone is insufficient.

The owned device opt-in therefore prepends a stricter `user:robert` rule for
`^/admin([/?].*)?$` on the same leaf hostname. The existing admin view is real,
not a fake route used as a feature switch. The ordinary owner rule, default deny,
cookies, keys, TTLs, proxy/DNS boundaries and non-experimental passkey settings
are unchanged. Admin may require additional verification; normal WineSnap access
is not changed to two-factor/password login. The portal still uses the vendor's
own session-elevation and credential-registration controls.

The helper now checks the real provider capability and waits for the exact
`#webauthn-credential-add` control before handing off. It scrolls/focuses that
button and reports its visibility and bounded registration deadline, never
clicking it or creating/approving a credential. No owner screenshot, cookie,
OTP, browser state or key material is exported.

`check-owned-gate.mjs --device-access` passed 32 isolated vendor/proxy checks,
including real registration availability, admin step-up, normal app access,
anonymous/forged-identity denial, restart persistence and exact cleanup. No real
account or authenticator was used. The focused device/gate suites passed 96
tests and PowerShell parsing passed. Live installation and human mobile
registration remain separate evidence, not implied by these tests.

Live follow-up: source `a6c1eb7` passed Quality and Database Safety for push and
PR. The full CI suite passed 1,313 tests; a local concurrent run hit five existing
5-second time limits, and all five affected files passed (154 tests) when rerun
with one worker and unchanged limits. Local typecheck and focused lint passed.

Before the owned-only gate restart, retained archive
`gate-20261108-171231277.dpapi` passed isolated restoration at 20:34 UTC: 26
tables, one file, SQLite integrity, credential recovery and temporary cleanup.
The existing gate/proxy restarted at 20:35 UTC, with all seven denial probes
passing and no DNS, connector, published-port, app-image or password changes.

At 20:36 UTC the real enrollment helper confirmed `registrationAvailable=true`
from the provider and `registrationControlVisible=true` for the exact vendor
Add button. The button was scrolled into view and focused. The human registration
window ends at 21:06 UTC. This verifies the missing-button fix, not registration
or mobile sign-in; those still require the real human authenticator and a fresh
passwordless-login/account-handoff check. No credential has been fabricated.

## Owner's Saved-Password Choice, 2026-11-12

The November 11 setup window expired without a stored credential. The owner then
declined further passkey registration and approved a saved password on their own
mobile instead. Do not reopen Enroll on a generic request to continue. Keep the
existing protected gate-to-account handoff, which also accepts a normal verified
owner password login. The scoped `-GateOnly` password window and its verification
are documented in `owned-password-recovery-2026-11-05.md`. This does not claim
passkey enrollment, remove authentication or change existing session lifetimes.
