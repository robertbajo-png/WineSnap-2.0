# Local Windows Hosting

Date: 2026-10-23. Local test installation, not a production migration.
Later update: user-logon startup and an email-protected temporary Internet
tunnel are installed. Later the same day, the owner approved an existing OpenAI
key and real text/image scanning was accepted in the local app. Gemini chat and
both recommendation flows now also pass real local acceptance with the owner's
replacement key. Production remains unchanged.

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
checks its project and private ACL, and uses only its public/publishable key for
the build and normal runtime environment. After startup, the separately scoped
AI configurator reads the approved encrypted OpenAI and test backend credentials
and pipes them into a private RAM-only container file. They are never build
arguments, Docker environment variables, command-line values or host plaintext
files. The Docker build context remains allowlisted. The Compose environment
file is explicitly empty to avoid loading a checkout-root `.env`.

The price scheduler is not provisioned. Admin-dependent Node operations are
not enabled by supplying an admin key. Privacy rollout flags stay off. The
previously verified test image proxy is on. OpenAI scanning now runs on the local
Node server; it does not require a hosted `analyze-wine` function or provider key
in Supabase. No OpenAI/Gemini secret was uploaded to the test dashboard. The direct
provider code can be bundled with `scripts/prepare-test-ai-functions.mjs` for
six standalone dashboard files under ignored `dist/test-ai-functions`. This
performs no network deployment or inference. A dashboard deployment attempt
for `analyze-wine` was not confirmed successful; do not treat it as installed.

The owner chose to reuse an existing OpenAI key and explicitly approved hidden
local entry with Windows-user-encrypted persistence at
`%LOCALAPPDATA%\WineSnapHosting\ai-keys.clixml`. The interactive helper
`scripts/store-local-openai-key.ps1` accepts no secret argument, uses a hidden
SecureString prompt and exports a DPAPI-protected PSCredential with test-only
project metadata. The directory and file have owner/SYSTEM-only ACLs; redirected
paths are refused. No plaintext env file, global environment setting, key
creation, upload or provider call is performed. Entry must happen in the private
local window, never in chat. Reopening is possible with the same script.
Use `-Window` for the masked local Windows dialog; this does not require a
console input handle. It offers Save and Cancel, shows the approved encrypted
destination and clears the input control when it closes.
The dialog is launched in an STA PowerShell process without a console, rather
than hiding the dialog with a process-level Hidden window flag. Existing file
descriptors are updated through the .NET ACL API without audit/SACL changes;
repeat hardening does not require administrator/security privileges.

`./scripts/store-local-openai-key.ps1 -Check` reports only whether the private
test key store exists and decrypts into the expected credential type. It never
prints the key or checks API validity. `-SelfTest` verifies encrypted storage
and ACLs using a clearly synthetic key in a separate temporary file, then
removes that file without reading/replacing the real key store. The storage
self-test and three focused regression tests pass. Starting the private prompt
does not mean that a key has been entered or that AI is active.

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
project and waits for health. Stop/Status/Verify do not read encrypted credentials.
Start/Restart/Resume restore the approved AI settings when its encrypted store
exists. They verify the container's project and scope labels before
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
installed WineSnap app and tunnel. Resume does not build; the launcher restores
the approved AI credentials from this Windows user's encrypted stores.
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

Those earlier camera tests use synthetic Chromium media, not a physical mobile
camera. AI requests are deliberately blocked in those browser suites; their
results alone are not live AI or production acceptance. The separate later live
OpenAI checks are recorded below. No Windows reboot or remote-phone access was tested.
Ignored evidence: `dist/local-windows-ui-report.json`,
`dist/local-windows-image-mobile-report.json` and `dist/image-browser-*.png`.

## Not Changed

- No production database/Storage/Auth writes, migration replay or restore.
- No production domain, hosting, Lovable publication, subscription or DNS change.
- No paid resource, production tunnel, real-user data import or main-branch merge.
- No changes to unrelated Docker containers or their restart settings.

This completes a local app-server installation and real OpenAI scan acceptance,
not the outstanding production cutover, independently owned production backend,
Gemini acceptance or
off-device disaster-recovery backup. See `lovable-exit-2026-10-23.md` and
`lovable-migration-checkpoint-2026-10-23.md` for those separate gates.

## Live OpenAI Scan Acceptance

`VITE_LOCAL_AI_ENABLED=true` selects a same-origin `/api/ai/analyze-wine` route
only in the local Windows build. Both build and server refuse other backend
projects; the default and synthetic builds keep it off. The browser sends only
the ordinary signed-in user's JWT, never a provider or admin key. No hosted or
Lovable gateway fallback exists.

The Node route and Edge function share the same label-reader implementation
and auth/quota guard. Each accepted inference checks the user with Supabase Auth,
rejects an unavailable/erasing account and consumes the existing atomic database
quota (20 scans per 300 seconds). Input has byte/type/field limits, arbitrary
image URLs and provider overrides are refused. Responses are `no-store` with no
cross-origin permission. The OpenAI destination and `gpt-6.1-sol` model are fixed,
output is strict-schema JSON, timeout is 45 seconds, `store:false`, with no retry
or provider/model fallback.

The approved key remains DPAPI-encrypted on Windows. A child process receives it
through stdin and installs `/tmp/winesnap-ai/credentials.json` inside the
container's existing tmpfs (directory 0700, file 0600, checked owner). The test
backend admin key is used only by this AI adapter, not placed in the Node process
environment; other admin-dependent routes remain unconfigured. Docker/root and
the Windows owner necessarily control the running host; RAM-only storage is not
protection against an already compromised host.

```powershell
./scripts/configure-local-windows-ai.ps1 -Action Check
# Live, billable API acceptance using disposable test users; cleans them afterward:
./scripts/configure-local-windows-ai.ps1 -Action Test
```

Real acceptance passed: anonymous and invalid JWT requests return 401; the
existing OpenAI key can access the pinned model; actual mobile text scanning and
the approved original `54456874_400.webp` image both return 200 through the local
app. The image reads Zehn Morgen, Chardonnay/Weisser Burgunder and vintage 2023.
The raw label year is `20 23`, which the app correctly normalizes to 2023; the
first test's overly strict raw-string assertion was corrected, not the reader.
There are no hosted AI requests, saved wines, unexpected browser errors or
cleanup failures. Mobile and desktop result screenshots were visually checked.
Restart plus automatic credential restoration and a safe configuration check
also passed. This is not a physical-phone camera test or an Internet/PIN test.

Ignored evidence: `dist/local-windows-ai-report.json`,
`dist/local-ai-text-mobile.png`, `dist/local-ai-image-mobile.png`,
`dist/local-ai-image-desktop.png`. The full unit suite, lint, typecheck, Docker
build, synthetic portable Node runtime and client budget pass.

RAM credentials disappear on container restart. The supported Start/Restart/
Resume commands (including the user-logon shortcut) restore them without input.
A Docker-only automatic restart during an already-running Windows session fails
closed until that launcher is rerun. No reboot was performed.

OpenAI scanning is ready in this local test installation. Chat and recommendation
transport is now installed as described below. Restaurant matching and preference
extraction retain their hosted Gemini contracts and are not enabled by this change.
This is not full AI-feature acceptance or a production release.

## Local Gemini Chat and Recommendations

The same explicit test-only switch now routes `ask-winesnap`, `taste-suggestions`
and `wine-suggestions` to fixed same-origin Node endpoints. Default/production
builds keep their existing Edge transport. No hosted function was deployed and
no provider key was uploaded to Supabase or Lovable. The existing Edge functions
and Node routes share each handler rather than duplicate its prompts, queries,
conversation persistence, verified identity catalog or deterministic ranking.

The shared auth/privacy/atomic-quota guard remains before provider calls. Quotas
remain 20 chat, 10 personal-recommendation and 15 similar-wine requests per user
per 300 seconds. Only the verified user ID controls database access. Foreign
conversations and private reference wines are rejected. Node input schemas are
strict, with UUID validation, a 2000-character chat limit, a 32 KB request-byte
limit and no caller-selected user, provider, model or destination. Responses
are non-cacheable without cross-origin permission. No automatic fallback to
OpenAI or Lovable is introduced.

Gemini remains pinned to `gemini-3.8-flash` at Google's fixed OpenAI-compatible
endpoint, with low reasoning, bounded output and a 25-second provider timeout.
The deprecated chat temperature override was removed; recommendation function
calling contracts remain intact. See Google's
[compatibility reference](https://ai.google.dev/gemini-api/docs/openai) and
[3.8 migration guidance](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8).

The owner approved hidden Gemini entry into the same Windows-encrypted store.
`store-local-openai-key.ps1 -Provider Gemini -Window` preserves the OpenAI slot;
the default remains OpenAI for existing callers. Both provider storage self-tests
pass without touching real credentials. Provisioning carries the optional Gemini
slot through stdin into the existing private tmpfs file, never build arguments,
process environment, command-line values or host plaintext files. `Check` reports
presence only, explicitly not API validity.

```powershell
./scripts/store-local-openai-key.ps1 -Provider Gemini -Window
./scripts/configure-local-windows-ai.ps1
./scripts/configure-local-windows-ai.ps1 -Action TestGemini
```

Current evidence: 585 unit tests, TypeScript, ESLint, the actual local Docker
build, synthetic portable Node runtime and client budget pass. All three actual
local Gemini endpoints reject anonymous and invalid JWT requests with 401 and
`no-store`. The initial key was rejected by Google (HTTP 400 / invalid API key);
WineSnap returned a safe 502 without saving a failed exchange. The owner replaced
that key through the approved private dialog. No key or raw Google error text
was printed.
The OpenAI suite was rerun against the combined local transport: actual text and
the original bottle image both pass, with zero browser errors or cleanup failures.

Positive real acceptance now passes against the installed local container:
chat, continuation, personal suggestions and similar-wine suggestions all return
200 from `gemini-3.8-flash`. The chat's stored model is verified. Another user
cannot read the conversation through RLS, continue it through the local API or
request suggestions from its private reference wine. Verified recommendation
identities and source links render without horizontal overflow on mobile and
desktop. No unexpected browser errors, hosted AI calls or unintended saved wines
occur; all synthetic users, conversation history and the fixture wine are cleaned
with zero cleanup failures. The initial complete run has ten passing scenarios;
the extended post-restart run has eleven, including reopening saved history on
mobile and desktop.

One intervening run observed a Google HTTP 503 for similar wines. The server
returned a safe 502, with no hidden retry, invented candidates or provider/model
fallback. The following full live run passes all eleven scenarios, with every
model request returning 200 on its first attempt. The test runner may click the
existing user-facing retry button once after a generic upstream-service failure;
that branch was not needed in the final green run. Separate handler regressions
now cover upstream HTTP 503 for all five Gemini functions. Provider availability
is not guaranteed by local acceptance.

Restart and automatic restoration of both encrypted provider keys also pass.
`Check` deliberately remains a presence check (`apiValidityChecked:false`); the
separate successful live report is evidence of actual API access. Physical-phone
camera behavior, Internet/Cloudflare PIN acceptance, restaurant matching and
preference extraction remain outside this chat/recommendation acceptance.

Safe ignored evidence is `dist/local-windows-gemini-report.json`; screenshots are
`dist/local-gemini-chat-mobile.png`, `dist/local-gemini-recommendations-mobile.png`
and `dist/local-gemini-recommendations-desktop.png`. These were visually checked.
The suite additionally reopens saved conversation history on mobile and desktop
and writes `dist/local-gemini-history-mobile.png` and
`dist/local-gemini-chat-desktop.png`. No production data, deployment or DNS was
changed. This completes the approved local Gemini connection, not a production
cutover or activation of the two remaining hosted Gemini features.
