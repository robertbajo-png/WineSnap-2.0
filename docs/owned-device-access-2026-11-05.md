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
  hostname. Existing Secure/HttpOnly/SameSite cookies, 30-minute inactivity and
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
