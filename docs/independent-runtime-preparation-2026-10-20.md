# Independent Runtime Preparation

Date: 2026-10-20. Feature-branch candidate only; no production cutover.

## What This Step Changes

The existing WineSnap application now has an alternative, explicit Vite/TanStack
Start configuration that builds a Node server without importing Lovable's build
wrapper. It reuses existing dependencies and application routes. It does not
replace the default build, rename the product, merge the Chef design prototype
into the app, create infrastructure or move any user data.

The deployment adapter is the already locked Nitro version, currently a beta.
Treat the candidate as a staging foundation, not as evidence of release readiness.
The standard integration and Node server entry follow the
[TanStack hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
and [Nitro configuration reference](https://nitro.build/config).

## Commands and Boundaries

Use Node 22 or newer and `npm ci` in a clean checkout, not through the existing
local shared `node_modules` junction. No dependency versions were changed here.

```sh
# No real credentials needed. Does not contact a database or model provider.
npm run build:independent:check
npm run test:independent
```

The check mode explicitly replaces public Supabase values with `example.invalid`
and a synthetic key, ignores inherited public settings, and leaves privacy
controls/operations-verification flags off. This artifact cannot log in or scan
using real AI. It must never be deployed as the real application.

To prepare an operator-controlled staging build later:

1. Copy `config/independent/.env.example` to `.env.local` **in that same directory**.
2. Set only the public URL and publishable/legacy anon key for the intended owned
   staging project. Do not use the existing production project as an implicit default.
3. Run `npm run build:independent`. Missing required public configuration fails.
4. Supply server-only credentials separately through the hosting runtime, never
   through browser variables or committed files.
5. Start with `npm run start:independent`. Bind to loopback for local use with
   `NITRO_HOST=127.0.0.1` and a chosen `NITRO_PORT`; the platform must provide TLS
   and access controls before any public exposure.

`npm run dev:independent` uses the same deliberate staging configuration and binds
to `127.0.0.1:5202` with a strict port. It does not silently load the repository's
root `.env`. Vite cache/build intermediates are separate, and final output is
`dist/independent-runtime/{public,server}`. Deploy the **whole** output directory,
not only `server/index.mjs`; Nitro includes traced runtime dependencies.

The check and staging builds share that candidate output directory. Always
rebuild the intended mode before use. Existing `npm run build`, `.output`, the
Chef prototype on port 5200 and `dist/chef-prototype` remain separate.

Only an explicit allowlist of public variables is injected into client code.
Obvious secret-key formats and service-role JWTs are rejected in the public key
slot. This is a configuration guard, not a comprehensive secret scanner or proof
that an arbitrary supplied key is valid. All `VITE_*` values are public by design;
see [Vite's environment documentation](https://vite.dev/guide/env-and-mode).

## Automated Acceptance

The added environment tests cover synthetic-mode isolation, missing settings,
public allowlisting, unsafe key/URL rejection, legacy anon/local development
support, and separation from the original/prototype configurations.

The runtime smoke test refuses a normal configured artifact and starts the
synthetic Node artifact in a fresh temporary directory outside the repository.
It inherits only basic operating-system environment settings and uses synthetic
server-key canaries. It checks:

- Six SSR pages return HTML: home, login, privacy, scan, cellar and Ask.
- Unknown routes return 404; referenced local JS/CSS, icons, manifest, service
  worker and offline page are served.
- Three price APIs reject requests without authentication before any data work.
- Cron returns 503 when unconfigured and 401 for a missing secret when configured.
- The private canary is absent from browser output and exercised HTTP responses;
  inherited hosted Supabase URLs are not present in the synthetic client build.

The test preloads a guard that rejects server-side `fetch` and fails if attempted.
It is not an OS-wide network sandbox. No browser login, authenticated data access,
AI invocation, scheduled-price job, user-data write or deployment is tested here.
It stops its child servers and removes only its own temporary artifact copies.

GitHub Quality retains the original application and Chef builds, and adds the
independent synthetic build and artifact smoke checks. Build-time canary values
also exercise environment isolation in CI; no real credentials are needed.

Local verification on 2026-10-20: 385 tests in 62 files, TypeScript, ESLint,
original build, Chef prototype build, independent synthetic build and both Node
artifact smoke runs pass. An independent build with no public configuration is
also confirmed to fail before building. These local dependencies are shared with
another checkout and are not lock-exact (including a different installed Lovable
wrapper); a fresh GitHub `npm ci` run is the reproducibility gate. Existing
large-chunk/dependency build warnings remain; they are not fixed by this work.

## Still Required Before Independence or Release

1. Verify ownership and export access for database, Auth users and Storage;
   rehearse backup restoration in an isolated environment. Do not blindly replay
   migration histories or mutate production.
2. Choose/provision owner-controlled staging hosting, secrets, database, Auth
   redirect/email settings, Storage policies and scheduled jobs. Confirm support,
   retention and deletion operations rather than enabling unverified flags.
3. Replace the remaining Lovable AI gateway behind a provider adapter, with owned
   credentials, response-contract tests, timeout/rate-limit behavior and approved
   handling of user images/data. The six existing AI functions still use Lovable.
4. Verify real JWT/RLS, private/shared images, authenticated price updates,
   scanning, model calls and email/account recovery in that staging environment.
5. Perform browser hydration, responsive/accessibility, camera and installed-PWA
   acceptance on the intended host/devices. This HTTP check is not E2E coverage.
6. Approve the new name, provider/data arrangements, release rollback and explicit
   production cutover. Remove the old build wrapper/default hosting integration
   only after the candidate is accepted.

This step establishes an independently buildable/runnable application artifact.
It does **not** establish infrastructure ownership, replace hosted Edge Functions,
finish the AI Chef product, or make the whole product Lovable-independent.
