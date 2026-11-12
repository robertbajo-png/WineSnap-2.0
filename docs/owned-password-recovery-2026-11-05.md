# Owned Password Recovery

Prepared on 2026-11-05 after the owner explicitly requested new passwords for the
outer access gate and the local app account. This is a manual Windows-operator
tool, not an HTTP endpoint, scheduled task, hosted-test action or production reset.
No password has changed until the owner submits the masked window.

```powershell
./scripts/reset-owned-passwords.ps1 -Action Window -OwnerEmail '<local account email>'
./scripts/reset-owned-passwords.ps1 -Action Status
```

- The human chooses and confirms two different passwords in four masked fields.
  Gate: at least 16 characters, at most 256 UTF-8 bytes. App: at least 12 characters,
  at most 72 UTF-8 bytes. No password arguments, clipboard, plaintext files or chat.
- The dialog holds no operation lock while waiting for the human. On submission,
  the existing shared operation lock serializes the exact owned stack changes.
- The private worker validates original DPAPI backend/gate identities, exact
  labelled owned web/gateway/Auth containers, and the existing explicit confirmed
  email account. Missing, duplicate, deleted or QA-fixture accounts fail closed;
  no account is created and no roles/recipes/wine/image rows are changed.
- Existing normal GoTrue Admin updates only that account's password. Normal
  password login verifies the result, then global sign-out revokes that account's
  refresh sessions. Existing access JWTs still obey their normal lifetime.
- Gate rotation changes only the Argon2id hash and session secret. The session
  change invalidates existing gate cookies; storage-encryption/reset keys and
  identity stay intact. It requires the existing Node 24.7+ operator runtime.
- The new gate store is DPAPI CurrentUser-encrypted, round-trip checked and
  atomically replaced. The old encrypted file is retained under a unique
  `password-reset-*.previous.dpapi` name in the private owned runtime directory.
  It contains hashes/keys, not the original passwords; never print or upload it.
- Only the existing private-ingress Restart wrapper reloads the gate/proxy.
  No tunnel, DNS, firewall, production, database root key or gate volume changes.
- A private stdin probe checks real new-password gate login, protected app health
  and probe logout through the validated owned web container. Neither its cookie
  nor any credential is returned in public status. It does not save a browser
  session or log the owner into a desktop/mobile browser automatically.

Never run `reset-owned-passwords-worker.mjs` directly: Rotate returns a private
gate envelope, just like the pre-existing gate setup helper. Use only the
PowerShell wrapper. The safe progress report is `password-reset-status.json` under
the existing private runtime root; it contains booleans/phase only, no credentials.

This two-system operation is not transactional. A later failure can leave the
app password changed while the gate still awaits reload; report flags identify
partial completion. Do not claim success, regenerate root keys, delete a gate
volume or silently restore the previous store. If the gate store was updated but
restart failed, the existing `run-owned-ingress.ps1 -Action Restart` can reload it
without entering either password again. Older backups/rollback copies can restore
older password hashes; operator recovery must account for that explicitly.

Validation before real entry: masked-wrapper syntax, focused password/gate/ingress
unit regressions, and a local real-Argon2id synthetic test. CI's Node 22 skips only
the real Argon2 call, while the immutable rotation payload and API isolation tests
still run. Actual owner credential verification is deliberately performed only
after human submission, never with a guessed/generated real-owner password.

## Saved-Password Alternative, 2026-11-12

The owner declined further passkey enrollment and chose an ordinary saved
password instead. Use the existing owner-only gate and its installed account
handoff, not anonymous access or a new remembered-device credential:

```powershell
./scripts/reset-owned-passwords.ps1 -Action Window -GateOnly -OwnerEmail '<local owner email>'
./scripts/reset-owned-passwords.ps1 -Action Status
```

This opt-in window has only a new gate password and its confirmation, both
masked. The human enters and submits them. Before rotation, the private worker
verifies the existing enabled installation-bound handoff and the exact confirmed
owner. A disabled/foreign binding, ambiguous account, anonymous user or QA fixture
fails closed. The app password and its existing refresh sessions are not changed;
only the outer gate's password hash and session secret rotate. The ordinary
two-password recovery remains available without `-GateOnly`.

After the existing encrypted gate replacement and scoped restart, the private
probe checks normal password-factor login, opens a normal authenticated app
session for the exact bound owner and verifies it against GoTrue's user endpoint.
It signs out only that probe's app session and its own gate session. Neither
passwords, session bodies, tokens nor cookies appear in the status report.
`ownerSessionVerified` is backend handoff proof, not a mobile/browser acceptance.
`appLoginVerified` remains false in gate-only mode: no app password was tested.

The mobile user opens
`https://winesnap.boleoai.se/?device_login=1`, signs in as `robert` with the chosen
password and saves it in their own password manager. The query contains only
explicit sign-in intent, never credentials. It clears this browser's earlier
explicit-sign-out suppression. Saving/autofill must be approved on the device;
the Windows operator does not access password managers or synchronize a password
to a phone. The server retains a password hash, not a reusable plaintext copy.

Default deny, one owner, login throttling, TLS, cookie protections, existing
session lifetimes and the admin step-up stay unchanged. No passkey registration,
public bypass, DNS/tunnel change, app rebuild or old-production action is needed.
Previously staged private passkey setup no longer matches the rotated gate;
do not resume it or overwrite the owner's new password. Verification and actual
mobile saving remain pending until the human completes the respective steps.

### Windows ACL Follow-Up

The first gate-only submission verified the existing owner but stopped before
replacing the live gate store. A newly encrypted pending file retained inherited
owner/System permissions: copying a clean `Get-Acl` descriptor through .NET did
not persist the protection flag. No password was activated and the app account
was unchanged. Pending ciphertext must not be treated as a successful login.

The writer now constructs an explicit protected owner/System `FileSecurity`,
like the existing device-enrollment writer, and verifies it before replacement.
Safe status includes a storage step and exception type, never an exception
message or credential. Retrying requires human entry: the retained encrypted
gate contains only a hash and cannot verify the chosen plaintext password.

`scripts/check-owned-password-storage.ps1` tests the exact writer/validator
functions in a random temporary directory with synthetic CurrentUser-encrypted
bytes. On November 12 it reproduced the ineffective legacy ACL copy and verified
protected pending/replacement/rollback files, decrypt roundtrips and exact cleanup.
It opens no real store or account and takes no arguments. The failed real pending
file was subsequently protected without changing its ciphertext or the live gate.
The next human submission and actual new-password login remain separate checks.
