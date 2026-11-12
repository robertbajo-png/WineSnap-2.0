# Local Development Access

The owner reported another mobile password failure after the backend password
probe passed and explicitly switched development back to this Windows PC. Do not
restart password recovery, passkey registration, mobile onboarding or the tunnel
on a generic request to continue. Old production and abandoned hosted test remain
out of scope.

## Opening The Real App

Use the current user's `WineSnap lokalt` desktop shortcut, or PowerShell 7:

```powershell
./scripts/open-owned-local.ps1 -Action Open -OwnerEmail '<existing local owner email>'
./scripts/open-owned-local.ps1 -Action Status
```

The operator opens the real app at `http://127.0.0.1:5212` in a separate visible
browser. Use that window; opening the plain URL in another browser does not copy
its authenticated session. Closing the viewer releases its operator lock. The
shortcut can open another normal owner session without asking for a password.
No password, grant URL, browser state or JWT is saved in the shortcut or reports.

This is not the example-account PilotDemo. It does not create/delete accounts,
change passwords/roles, seed a cellar, replace AI responses or publish a login
bypass. The actual app and its already configured server AI remain available.
Client requests outside the two exact loopback app/API origins are blocked in
this viewer; external links/media are not part of its local development scope.

## Security Boundary

Only the already authorized Windows user can decrypt the existing private
`backend.dpapi`. The wrapper validates protected file permissions, the installed
owner binding and disabled tunnel recovery before passing private input through
stdin. The worker verifies the exact labelled app/Auth/gateway and the stopped,
installation-matching connector. No hosted backend or missing-root provisioning
is accepted.

Normal GoTrue admin operations verify the single existing confirmed bound owner
and active privacy status, then issue an existing-account recovery grant. Unlike
magic-link generation, recovery cannot silently create an account if it disappears.
The provider's confirmation is mapped to the existing loopback verify endpoint;
only a single recovery token and exact loopback redirect are accepted. The normal
browser SDK consumes it and clears the callback. A real `/auth/v1/user` check and
visible home screen are required before reporting readiness. Auth, real user JWTs,
RLS and normal session lifetimes are unchanged.

No public/local anonymous-owner HTTP endpoint, shared owner token, fake
authenticator or client admin credential is introduced. Private operator keys
never enter the browser. No owner screenshots, HARs, traces or storage-state
exports are produced. An unlocked Windows session remains a trusted device;
this tool does not protect against another person using that same unlocked login.
Closing the viewer destroys its browser context, not every server session or
another browser's login. Those retain normal provider expiry and explicit logout.

## Local-Only Operation

`run-owned-tunnel.ps1 -Action Stop` completed on November 12. It stopped only the
owned connector and disabled its supervisor recovery. No DNS record, apex domain,
old published site, gate password or OS security setting was changed. The private
gate remains intact but is not needed for loopback development.

The installed app already selects the loopback backend when opened on loopback,
even with its retained public-origin build label. No app rebuild, origin reset,
migration replay or volume replacement was needed. The existing Windows runtime,
dark pilot UI, account, wines, recipes and images are retained. Do not describe
this as a public release or verified mobile access.

## Verification

```powershell
./scripts/open-owned-local.ps1 -Action Check -OwnerEmail '<existing local owner email>'
```

Check uses a separate headless browser, blocks AI/provider requests and verifies
the actual owner login plus visible app. It logs out only its own probe session.
Run it while the interactive viewer is closed; duplicate launches are refused
without replacing the active viewer's report.

The actual November 12 check passed: owner identity and normal app session were
verified, the home rendered, no external/AI requests were needed, and scoped probe
logout passed. The visible real-account viewer subsequently reported readiness
at 21:33:59 UTC, with exact owner identity verified, the home visible and zero
blocked external/AI requests. The desktop shortcut was installed without any
credential or grant URL in it.

For a running Open viewer, `ready=true`, `ownerSessionVerified=true` and phase
`ready` record successful startup. `completed=false` is expected until the user
closes its browser; it is not a failed login. Status is the last operator check,
not a promise about every later user navigation or explicit logout. Check exits
unsuccessfully if a viewer is already open, rather than claiming another login
test passed. The interactive viewer and old sessions are not forcibly closed by
a duplicate launch.

Focused source tests passed. A broader local run hit existing five-second
subprocess timeouts under PC load and was stopped to avoid slowing the real
viewer; limits were not relaxed. Full CI verification remains separate evidence.
