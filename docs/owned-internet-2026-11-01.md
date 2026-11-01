# Owned Windows Internet Deployment

Date: 2026-11-01. Scope: the separate owner-controlled Windows installation only.
The original published site, production Supabase, abandoned hosted test, apex DNS,
router, firewall and shared Docker engine were not changed.

## Installed State

- Public hostname: `https://winesnap.boleoai.se`.
- Tunnel: `winesnap-owned-windows`, ID `3c24ecc7-ab97-48dc-95ff-7d72c84918d0`.
- A separately confirmed Cloudflare action created exactly the published route
  and its `winesnap.boleoai.se` CNAME. The service is exclusively
  `http://winesnap-owned-internet:8080`.
- The owner chose the new gate password themselves in the masked Windows form.
  Only its Argon2id hash and gate keys are stored in CurrentUser DPAPI. No password
  was supplied through chat, entered by the agent or saved in a plaintext file.
- Authelia, the gated proxy and the connector have no published host ports.
  Existing app/API/mail ports remain loopback-only.
- The owned app/auth public-origin update is installed. Both original loopback
  origins and the original JWT issuer remain valid. All 37 existing migrations
  remained applied; zero new migrations were executed.
- This is an owner-private installation, not commercial/multi-user release approval.
  Windows and Docker must stay running, with the owning Windows user signed in.

## Isolation And Credentials

The gate has a dedicated internal network. The proxy bridges the owned app/API
egress, the private gate network and the internal ingress network. The connector
has only its exclusive outward network plus the internal ingress network; it
does not join the database, app/API egress or mail networks. Existing peer identity,
labels, mounts, capabilities, images, commands and absence of host ports are checked.
Docker's explicit default IPv4/IPv6 options are recognized without permitting
custom bridges or unexpected peers.

The connector image copies the cloudflared binary and vendor CA bundle from the
previously approved digest-pinned official Cloudflare image into a digest-pinned
official Node image. Its Dockerfile-specific build allowlist includes only the
entrypoint and three credential-free shared modules. It never sends the runtime
stores, source environment or provider keys to that image build.

The Windows wrapper verifies the exact approved account/tunnel in the encrypted
connector store, then supplies the token by private stdin into the container's
user-owned tmpfs. It is not in Docker arguments, environment or persistent mounts.
The entrypoint verifies ownership/mode and tunnel identity before running
cloudflared with `--token-file`. TLS validation remains enabled. The private
metrics readiness port is not published. See the official
[run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)
and [container image source](https://github.com/cloudflare/cloudflared/blob/master/Dockerfile).

The gate remains one-factor password authentication, not MFA. Its login is separate
from WineSnap's own session, JWT and RLS. Outer logout does not erase WineSnap's
existing private offline data; use the app's own logout on shared devices too.
The API/admin/mail/maintenance exclusions and deny-by-default gate remain intact.

## Supervisor And Recovery

The current-user limited task now runs supervisor version
`2026-11-01-private-ingress-v3`. Recovery remains protected by the private operation
lock and kill-on-close process jobs. A successful explicit ingress/tunnel install
sets that component's private control flag. The watcher only resumes components
whose flag is enabled; missing resources are not automatically provisioned.

After each Docker restart, user files/config and the tunnel token must be privately
re-injected into empty tmpfs before the waiting processes serve/connect. Missing
or invalid gate state fails closed. There is no ungated fallback route.

A real recovery test stopped only the verified owned connector at
`14:16:56Z`. Public HTTPS returned Cloudflare 530 and no private app. Without a
manual resume, the watcher restarted it at `14:17:27Z`; readiness passed at
`14:17:29Z`. This is process/container recovery, not an actual Windows reboot or
power-loss/off-device test. The shared engine and unrelated containers stayed up.

Read-only status:

```powershell
./scripts/get-owned-windows-status.ps1
./scripts/run-owned-ingress.ps1 -Action Verify
./scripts/run-owned-tunnel.ps1 -Action Verify
node scripts/check-owned-public.mjs --check-approved-owned-host
```

## Backups

The existing application backup still includes PostgreSQL/Auth hashes and actual
image bytes. Before the origin update, the encrypted application archive
`owned-20261101-135056144.dpapi` was created and encryption round-tripped.

The gate has a separate daily backup under the private `internet-backups` directory.
Only the verified private proxy/gate are quiesced, then fixed SQLite filenames are
read through a networkless, unprivileged helper. The wrapper also includes encrypted
copies of the gate and scoped tunnel stores, then encrypts the entire archive with
CurrentUser DPAPI and verifies its round-trip. Retention is at most seven archives
and seven days. No plaintext SQL, password hash or connector token is written to
the workspace/status report.

```powershell
./scripts/run-owned-ingress.ps1 -Action Backup
./scripts/run-owned-ingress.ps1 -Action Rehearse
```

The real isolated rehearsal of `gate-20261101-134237641.dpapi` passed SQLite integrity,
matching counts for all 26 tables, exact file hashes and decryption/identity checks
for the backed-up gate and tunnel credentials. It used a separate networkless tmpfs
and did not restore over the live volume. This remains same-PC/current-user recovery,
not portable or off-device disaster recovery. Keep application and gate archives
as separate required recovery inputs.

## Tests And Limitations

Verified so far:

- The installed gate's seven denial probes, restart and stop/re-enable rollback.
- The encrypted gate backup and isolated database/credential recovery above.
- Healthy Windows supervisor, jobs, private ingress and connected public tunnel.
- 25 real public HTTPS checks, including app/API/image denial, forged cookie/identity,
  an unauthenticated scan request, admin/mail/maintenance denial, foreign Origin
  denial and gate static resources. Responses have `no-store`; no tested response
  reports a CDN HIT. These calls do not carry an owner session or call an AI provider.
- The local disposable acceptance passed 24 scenarios: signup/confirmation,
  recovery, wine and image writes, RLS and revocation, a real Playwright login,
  image rendering, persistence across owned-service restart, export and erasure.
  Its test accounts/images were cleaned up; it makes no provider calls.
- The final manual `ScanAccept` passed 25 scenarios with one live provider scenario
  in that invocation, using the previously approved original Zehn Morgen WebP.
  The installed OpenAI path identified Zehn Morgen, both Chardonnay and Weisser
  Burgunder, and the 2023 vintage. The original image was saved/read only in a
  disposable fixture's cellar and removed afterward, not in the owner's cellar.
- Source regression run: 1,083 tests in 112 files passed. TypeScript, ESLint,
  synthetic build, both standalone runtime smoke scenarios and client budget
  passed at that checkpoint; final post-change CI is a separate result.

The public-origin acceptance initially found that GoTrue's absolute mailer path
replaced the `/backend` API base path. The settings now explicitly use
`/backend/auth/v1/verify` for confirmation, recovery and email-change links. The
disposable local acceptance helper validates exactly that public prefix and routes
only its own synthetic confirmations to the fixed loopback API; it does not bypass
the public gate or follow arbitrary inbox links. SMTP remains local Mailpit only,
not external email delivery.

Authenticated browser acceptance is **not yet signed off**. The owner completed
the outer gate login in the in-app browser, but protected stylesheet requests in
that browser received HTML, and the kitchen view remained on its loading state.
The same asset exists and responds as CSS on the server and on direct authenticated
navigation. No cookie policy, authentication or static-file protection was weakened
to conceal this. An independent Chrome login is prepared for comparison, with its
owner-entered password pending at this checkpoint. Physical mobile/camera, Safari
and outside-home-network acceptance are distinct from desktop viewport emulation.

Five live scan attempts were made during diagnosis and final acceptance. The
first attempts exposed a fixture-contract mismatch and an unread split vintage.
The prompt now explicitly permits joining a visibly paired printed century/year,
with both parts quoted as evidence, while keeping isolated or unrelated numbers
unknown. No identity validation was loosened. The final run verified 2023 through
the same parser used by the app. `ScanAccept` is manual only, never a watcher job.
Its browser-external-request counter remains separate from live provider scenarios.
The ignored scan artifact contains only the approved reference label's transcript
and wine identity, never credentials, user history or provider keys.

The successful live scan and local browser saves are not a completed public-owner
browser/device acceptance. The private URL is live, but every release gate is
not thereby complete. The temporary, value-free stylesheet diagnostic was removed;
the original proxy configuration and authentication remain unchanged.

## Safe Stop And Rollback

Stop the connector first to make the new public service unavailable, then optionally
stop the private gate. Each stop disables only that component's recovery flag.
It does not change DNS, the apex or the original production site:

```powershell
./scripts/run-owned-tunnel.ps1 -Action Stop
./scripts/run-owned-ingress.ps1 -Action Stop
```

Explicit re-enable requires verified existing local services and gate backup/restore:

```powershell
./scripts/run-owned-ingress.ps1 -Action Install
./scripts/run-owned-tunnel.ps1 -Action Install
```

For an operator-approved full owned-hostname rollback, stop the connector first,
then use `run-owned-windows.ps1 -Action Update -LocalOnly`. Never delete the real
data volumes, remove original credentials, restart Docker globally or silently
replace this gate with the old Access-only/ungated proxy configuration.
