# Local Windows Hosting

Date: 2026-10-23. Local test installation, not a production migration.
Later update: user-logon startup and an email-protected temporary Internet
tunnel are installed. AI key provisioning remains a separate owner decision.

## Machine Check

- Windows 11 Home, build 26300; Intel Core Ultra X9 388H, 16 logical processors.
- 31.4 GB usable RAM, about 3.6 GB initially free; 1,357.8 GB free on C:.
- Docker Desktop's Linux engine works through WSL 2: Docker 29.9.2,
  Compose 5.6.0, 16 CPUs and 15.3 GB memory available to its VM.
- The Windows processor flag reports firmware virtualization as false, but the
  actual running WSL 2 Linux engine and successful container build/run are the
  relevant functional checks. No BIOS or Windows feature changes were made.
- Existing unrelated Docker applications and the older development server were
  left running. This installation does not reclaim their memory or ports.

## Installed Scope

Open **http://127.0.0.1:5210/** on this computer.

This is the actual standalone WineSnap Node/Docker app, built in normal
production build mode with deliberately selected **test** configuration. It is
not the Chef prototype, Vite development server, synthetic offline build or the
published production app.

The app connects only to the approved disposable hosted Supabase test project
`pzniyupmgwvlldvztzqh`. Database, Auth, Storage and Edge Functions are therefore
still remote test services, not a fully local Supabase stack. Production users
and their wines were not copied into this installation. A production account
is not automatically an account in this separate test backend.

The launcher reads the existing Windows-user-encrypted test credential file,
checks its project and private ACL, and uses only its public/publishable key.
It never converts the stored admin credential to plaintext. Docker receives no
service-role, provider or cron key. No plaintext key file is created, and the
Docker build context remains allowlisted. The Compose environment file is
explicitly empty to avoid loading a checkout-root `.env`.

The price scheduler is not provisioned. Admin-dependent Node operations are
not enabled by supplying an admin key. Privacy rollout flags stay off. The
previously verified test image proxy is on. No live AI request or provider
credential configuration has been completed. The test dashboard confirms that
neither `OPENAI_API_KEY` nor `GEMINI_API_KEY` is configured. The existing direct
provider code can be bundled with `scripts/prepare-test-ai-functions.mjs` for
six standalone dashboard files under ignored `dist/test-ai-functions`. This
performs no network deployment or inference. A dashboard deployment attempt
for `analyze-wine` was not confirmed successful; do not treat it as installed.

## Operation

From the repository root in PowerShell 7:

```powershell
./scripts/run-local-windows.ps1
./scripts/run-local-windows.ps1 -Action Status
./scripts/run-local-windows.ps1 -Action Verify
./scripts/run-local-windows.ps1 -Action Stop
./scripts/run-local-windows.ps1 -Action Start
./scripts/run-local-windows.ps1 -Action Restart
./scripts/run-local-windows.ps1 -Action Resume
```

Start builds/rebuilds the image, brings up only the `winesnap-local` Compose
project and waits for health. Stop/Status/Restart/Verify do not require reading
the key file. They verify the container's project and scope labels before
operating. Every command pins the local `desktop-linux` named-pipe engine;
inherited remote Docker/Compose configuration is not used.

The container runs as `node` with a read-only root filesystem, a small temporary
directory, dropped capabilities and no-new-privileges. It has a 768 MB memory
limit, 1.5 CPU limit, 128 process limit and bounded log rotation. No host folder,
Docker socket or database port is mounted/published. Its only published port
is `127.0.0.1:5210`; other devices cannot connect over Wi-Fi or the Internet.

The `unless-stopped` restart policy applies after the Docker engine is running.
Docker Desktop's global AutoStart setting was not changed. The separate
`WineSnap Local Test.lnk` in this user's Windows Startup folder launches
`start-local-windows-session.ps1` hidden after sign-in. It starts Docker Desktop
if needed, waits for the local Linux engine and resumes only the previously
installed WineSnap app and tunnel. Resume does not build or read credentials.
No administrator privilege, saved password, scheduled task or automatic Windows
login is required. No power setting, firewall rule or router port was changed.
The actual shortcut was launched after stopping both WineSnap containers; its
session report confirms completion and both containers resume. The observed
test did not reboot Windows or stop Docker/other applications. Before-sign-in
or logged-out server operation is not certified. Closing Codex does not stop
the containers; sleeping Windows or stopping Docker makes them unavailable.

### Protected Internet Access

`run-local-windows-internet.ps1` creates/resumes only `winesnap-local-tunnel`,
using an explicitly pinned official Cloudflare image on the existing WineSnap
Docker network. It publishes no host ports or volumes, has bounded memory/CPU
and logs, and restricts access to one exact owner email using `--allowed-mail`.
The address is a temporary HTTPS `trycloudflare.com` hostname, not a new
production domain. The owner receives an email PIN before reaching WineSnap's
own sign-in screen. The full owner-PIN flow was not completed by the agent.

The current address is saved in
`%LOCALAPPDATA%\WineSnapHosting\internet-status.json` and is printed by:

```powershell
./scripts/run-local-windows-internet.ps1 -Action Status
./scripts/run-local-windows-internet.ps1 -Action Stop
./scripts/run-local-windows-internet.ps1 -Action Resume
./scripts/install-local-windows-startup.ps1 -Remove
```

No owner email is embedded in this repository. An unauthenticated HTTPS request
is verified to return a redirect to `login.trycloudflare.com/authorize`, not the
app's health response. If the gate cannot be verified during Start/Resume, the
tunnel stops rather than leaving an unverified public route running. The
initial redirect allowlist was corrected to match that observed official host;
there is no anonymous fallback. A browser also shows Cloudflare Access's email
login form. Internet access after the owner PIN, remote-phone camera behavior
and hosted password-recovery redirects remain acceptance checks.

Quick Tunnels change hostname after restart, have no uptime guarantee and are
for development/test only. A stable public release needs a separately approved
owned hostname and managed tunnel. Production DNS is untouched. See
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Browser Verification

The existing synthetic image test harness can target this installed app
without rebuilding it, starting another app process or stopping this container:

```powershell
./scripts/run-hosted-image-proxy-check.ps1 -Browser -LocalWindows
```

This first verifies the running container. The established test harness uses
the encrypted test credentials to create disposable test accounts and images
only in the approved test backend. Its existing browser check scripts use
that session; the operator's Finish action cleans the fixtures, not the local
Docker app. Never publish the temporary operator page or credentials.

Verified on this installed container:

- Clean Linux image build, healthy startup, Stop/Start and Restart all pass.
  It remains running after the test harness cleans up. Idle memory observed
  at about 26-32 MiB, with the 768 MB limit enforced.
- Six SSR routes and the worker, manifest, offline page and icon return 200.
  Three unauthenticated API mutations return 401; the unconfigured scheduler
  returns 503. Health returns 200 with `no-store`.
- All 34 anonymous/authenticated mobile and desktop accessibility/overflow
  checks pass. All 25 image, share/revoke, camera and PWA checks pass, with no
  unexpected browser errors or direct private Storage reads. Two synthetic
  test accounts and their uploaded files are cleaned, with zero cleanup errors.
  The first image run was interrupted by a closed browser; the complete rerun
  passes. Mobile and desktop screenshots were visually inspected.
- All 526 unit tests in 75 files, TypeScript and ESLint pass. The separate
  synthetic Node build, portable runtime smoke and client budget also pass.

Camera tests use synthetic Chromium media, not a physical mobile camera. AI
requests are deliberately blocked in the browser suites; this is not live AI
or production acceptance. No Windows reboot or remote-phone access was tested.
Ignored evidence: `dist/local-windows-ui-report.json`,
`dist/local-windows-image-mobile-report.json` and `dist/image-browser-*.png`.

## Not Changed

- No production database/Storage/Auth writes, migration replay or restore.
- No production domain, hosting, Lovable publication, subscription or DNS change.
- No paid resource, production tunnel, real-user data import or main-branch merge.
- No changes to unrelated Docker containers or their restart settings.

This completes a local app-server installation, not the outstanding production
cutover, independently owned production backend, real AI acceptance or
off-device disaster-recovery backup. See `lovable-exit-2026-10-23.md` and
`lovable-migration-checkpoint-2026-10-23.md` for those separate gates.
