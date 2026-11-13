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

For a running Open viewer, `ownerSessionVerified=true` records successful initial
authentication, not indefinite access. `completed=false` is expected until the
user closes its browser; it is not a failed login. Check exits unsuccessfully if
a viewer is already open, rather than claiming another login test passed. The
interactive viewer and old sessions are not forcibly closed by a duplicate launch.

## DEV-02: Current Status And Private Focus

The version-2 opener adds a private `local-view-control.json` command beside its
protected status file. Both allow only the current Windows user and SYSTEM. A
command can only focus the existing owned loopback page. It must match the
current invocation's UUID, contain a fresh request UUID/timestamp and no extra
fields, and receives a matching acknowledgement. There is no network listener,
login command, arbitrary URL, credential or account-switch payload. Duplicate
Open restores a minimized viewer and brings it forward without a new grant or
second window. Explicit logout stays logged out while that viewer remains open.

The visible worker checks its existing normal owner session against the local
Auth server approximately every five seconds. Only booleans leave that page
evaluation. It never renews a grant or reads administrator credentials during
the heartbeat. Status is read-only, checks the viewer lock and rejects readiness
when the heartbeat is over thirty seconds old. `lastVerifiedAt` is historical;
`ready`/`authenticated` plus a fresh heartbeat describe the latest verified state.

| Phase | Meaning |
| --- | --- |
| `starting_backend`, `opening_local_owner` and other startup phases | Existing local runtime/browser checks are in progress |
| `ready` | Live viewer, fresh heartbeat and server-verified bound owner |
| `checking_session` | Window action acknowledged; no authentication claim while the session probe is pending |
| `signed_out` | Viewer exists but no valid bound-owner session; Open does not sign it back in |
| `backend_unavailable` | Viewer exists but the local server/session could not currently be verified |
| `closed`, `complete` | Open viewer closed, or isolated Check finished; no running-login claim |
| `interrupted`, `unresponsive` | Operator disappeared or its report expired; not ready |
| `legacy_viewer` | Earlier opener is still running; its one-time startup report is not current proof |
| `needs_attention` | Safe startup/operator failure; inspect Status and normal Docker Desktop availability |

Open first uses the established bounded Resume action for only the exact existing
owned core containers. It does not provision missing roots, start/restart Docker,
resume a tunnel or touch hosted services. The shared operation lock is not held
while invoking Resume, and the enabled owner binding is checked again afterward.
Normal operation-lock contention waits for up to 120 seconds using elapsed time;
it does not turn a busy backup into a destructive retry or an early six-second
failure. A second Open during v2 startup reports starting, not a legacy viewer.
Errors show a fixed, non-secret Windows message, never raw provider exceptions
or a password input. A duplicate legacy Open asks the owner to save and close
the old window; it never closes unsaved work automatically.

Each browser focus/probe has an eight-second host deadline as well as the probe's
in-page fetch timeout. A stalled renderer cannot block later heartbeats or queue
unlimited evaluations: only one pending action of each kind is retained. Transient
empty/partial status JSON is retried consistently, at most ten times, with file
permissions and scope still validated. Invalid scope is never treated as ready.
Window acknowledgement is published before the session probe, and the caller's
25-second wait covers an already pending probe plus focus/polling. Startup has
an explicit bounded deadline: at most eleven minutes across wrapper Resume/lock/
browser limits, and two minutes in the worker. Only known, unauthenticated startup
phases can use it; an expired/excessive deadline is not a fresh heartbeat or a
ready login. A held lock alone never grants authenticated status.

Manual synthetic checks (no real account, backend requests or provider calls):

```powershell
./scripts/check-owned-local-control.ps1
node ./scripts/check-owned-local-lifecycle.mjs --headed
```

Source verification: 28 focused unit tests passed; fourteen Windows checks passed,
including stale status, legacy/startup compatibility, bounded contention, exact
Resume scope, concurrent-read retry limits, stalled browser actions, early focus
acknowledgement, bounded startup classification and cleanup.
The isolated headed-browser acceptance passed seven lifecycle checks, including
real minimize/restore and a single focused page. Authentication/outage states in
that browser acceptance are explicitly simulated, not real-owner login evidence.
Full GitHub Quality and Database Safety passed for `da9ecb0` (both push and PR).
The subsequent source-review fixes passed focused local verification and full
GitHub Quality/Database Safety for final functional source `f877995` (both push
and PR). The existing owned supervisor was healthy and the loopback app returned
HTTP 200; these read-only probes are not current-owner login acceptance.

Earlier activation checkpoint (superseded below): the older owner viewer was still running. Its
read-only Status correctly reports `legacy_viewer` and does not attest current
authentication. Save/close that viewer before running the fresh actual-owner
Check and Open, followed by duplicate-Open/fresh-heartbeat verification. These
installation checks remain pending; no owner window has been forcibly closed.

Focused source tests passed. A broader local run hit existing five-second
subprocess timeouts under PC load and was stopped to avoid slowing the real
viewer; limits were not relaxed. Full CI verification remains separate evidence.

## V2 Installed Acceptance: November 13

The owner approved the local installation and reported closing the old window.
Two read-only inspections found no open/minimized window in the exact legacy
worker's same-session tree. Only that verified windowless worker was ended; its
original wrapper/job exited and released its lock. No lock file was deleted,
password reset, real window force-closed or unrelated browser stopped.

Fresh v2 headless Check passed against the actual existing bound owner. The
current encrypted backup and isolated restore passed before Update. The owned
frontend was rebuilt from clean `1f5bd5f`, preserving dark-v1/public-origin labels
and applying zero new migrations. No internet connector or recovery was started.
Installed fixture acceptance passed 61 checks and cleaned both exact test accounts;
its AI fault/chat replies were mocked, not live-provider or owner usage evidence.

Post-update Check again verified the actual owner and logged out only its probe.
Visible Open then showed the real account/home. Duplicate Open returned
`alreadyOpen=true`, `focused=true`, `phase=ready` without a second window/grant.
Subsequent Status returned v2 ready/authenticated/viewerRunning/operatorActive,
fresh heartbeat, `focusResult=focused` and advancing server-verification timestamps
from 19:41:31 to 19:42:03 UTC. External/AI blocked counters were zero and internet
remained paused. This is actual normal owner Auth evidence, not synthetic login.

The shortcut was checked: it uses the current wrapper/PowerShell and Open action,
with no credential arguments. The supervisor is healthy. `completed=false` is
normal while the visible Open viewer stays open; do not close it merely to make
that field true. V2 activation (DEV-02) is complete. Actual owner usage, physical
mobile access, paid AI quality and public release remain separate gates.
