# Staging Database Preparation

Date: 2026-10-20. Preparation only, on a feature branch. No hosted project created,
linked, resumed, migrated or deployed. No production data or credentials used.

## Reuse, Not a New Database Design

This step reuses the existing 33 Supabase migrations, all 11 SQL invariant files,
and the local platform-contract bootstrap without changing historical SQL. The
existing migration rehearsal remains unchanged; the privacy-recovery script only
adds the same local Windows I/O configuration used by the new checker.
No Chef schema or product functionality is introduced by this infrastructure step.

The new `Database Safety` workflow creates a fresh PostgreSQL 17 service for each
job. The runner binds its published port to loopback, uses synthetic credentials,
and discards the service after the job. It follows GitHub's documented
[PostgreSQL service-container pattern](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).
No Supabase management token, hosted service-role key or deployment secret is needed.

The checker requires CI acknowledgement and accepts **no database URL or target
argument**. It explicitly ignores inherited `DATABASE_URL`, `PG*`, `SUPABASE_*`
and linked project state. Before mutation it rejects a cluster with application
databases, Supabase application roles or application tables. It creates a random,
named synthetic database and drops only that database afterward. The disposable
cluster's mock roles are discarded with the service, not removed from shared
infrastructure by a cleanup command.

It applies migrations in filename order and runs the existing tests. A synthetic
wine is inserted before the September security changes; its unusual legacy share
ID and image path must survive the upgrade. The JSON artifact records PostgreSQL
version, scope, counts and SQL SHA-256 hashes, but contains no user records,
passwords, archive contents or raw SQL. SQL errors report only stage and code.

## Commands

In the dedicated CI service job only:

```sh
# CI=true is supplied by GitHub; no real secrets are used.
WINESNAP_DATABASE_CHECK=ephemeral-synthetic-only npm run test:database
```

The default command intentionally fails on an ordinary workstation. For a fully
owned local cluster, reuse the existing installed embedded runtime explicitly:

```sh
node scripts/check-staging-database.mjs --embedded ../WineSnap-2.0-hardening --driver ../WineSnap-release-install
```

The first dependency directory supplies `embedded-postgres`; the second supplies
the already declared `postgres` driver if it is absent from the shared local
installation. These directories are not production databases. No install is
performed through the repository's shared `node_modules` junction. This mode
always creates its own temporary loopback-only cluster, random password and port;
it does not accept existing database connection settings.

The Windows PG18 rehearsal uses synchronous I/O to prevent I/O workers surviving
the embedded runtime's forced process-tree shutdown. PG17 and non-Windows modes
retain their normal settings. This affects only disposable local tests, not
production performance. See PostgreSQL's
[I/O configuration](https://www.postgresql.org/docs/18/runtime-config-resource.html#RUNTIME-CONFIG-RESOURCE-IO).

## Fresh Local Evidence

- 390 Vitest tests in 63 files, TypeScript and full ESLint pass. The existing
  generated dependency backup is excluded from lint; shared local dependencies
  are not a clean-install proof, so GitHub's `npm ci` checks remain required.
- The new checker passes all 33 migrations and 11 invariant files on local PG18.4,
  preserves the legacy share/image fixture, and completes temporary-cluster cleanup.
- The existing `rehearse-migrations.mjs` also passes owner isolation, restaurant
  feedback, collector stock guards and concurrent allocation checks.
- The existing privacy recovery rehearsal reproduces an old snapshot, imports an
  independently preserved synthetic erasure receipt, blocks restored owner/public
  access, keeps peer data unchanged and completes repeat erasure. Its embedded
  PG18 Windows shutdown initially left an I/O worker behind; the two identified
  workers from this session were stopped. Both the new checker and the existing
  recovery script now contain the local mitigation, with its platform/version
  selection covered by a focused test. The corrected recovery run exits cleanly.

These are **PostgreSQL contract tests**, not real Auth logins, signed JWT checks,
physical file recovery or Storage HTTP tests. `bootstrap.local.sql` mocks platform
contracts and must never be applied to a hosted Supabase project. Database tests
complement, rather than replace, staged API tests; see
[Supabase's testing overview](https://supabase.com/docs/guides/local-development/testing/overview).

## Hosted Staging: Approval and Evidence Required

No verified owner-controlled management connection is available in this session.
The historical test project `pzniyupmgwvlldvztzqh` is not automatically assumed
active, accessible or suitable. Production is `mervdrbnwgreaifobasw` and must not
be used for fixtures. The repository's `supabase/config.toml` still names that
production project; do not link/push/reset from it as a staging shortcut.

Before provisioning or resuming a billable project, obtain the owner's explicit
choice and approval. Record the following in a protected operator workspace, not
in a public committed manifest containing secrets or export files:

| Gate                      | Evidence required before proceeding                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ownership and cost        | Owner's organization/project access, authorized region and plan, approved spending limit; no assumption that leaving Lovable transfers Cloud resources                       |
| Source export feasibility | Verified schema/grants/RLS, Auth user/hash export rights, Storage object listing and actual bytes; public API keys are not management evidence                               |
| Empty target              | A separately owned project with no real users; recorded target reference distinct from production and both native/Drizzle histories reconciled                               |
| Auth settings             | Test email/SMTP and recovery, OAuth redirects and site URL; test preservation of synthetic UUIDs/passwords before promising real-account continuity                          |
| Storage                   | Private `wine-labels`, bucket restrictions, policies, byte/hash verification; test owner/stranger/anonymous, share/unshare and signing denial through real HTTP              |
| Functions and secrets     | Staging-only server credentials, privacy RPC before updated Edge functions, no production scheduler secret; maintenance/deletion/verified UI flags remain off until accepted |
| Runtime                   | Independent frontend built with the staging public values; matching server target; TLS and restricted access, no indexing or analytics                                       |
| Acceptance and recovery   | Actual JWT/RLS and user workflows, export/erasure, old shares, timed-out AI/price calls, physical file recovery, rollback and one authoritative writer                       |

The existing hosted security/collector scripts are pinned to the historical test
project and create/delete synthetic fixtures. They were **not run here**. Adapt
them only after a new target is expressly approved, retain production-denial
guards, and record cleanup before claiming hosted acceptance.

For an eventual real migration, do not mistake a database dump for a complete
platform export: Storage bytes, Auth/configuration, Edge deployment and secrets
need their own verified plan. Supabase documents the boundaries in its
[backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Never replay the already-applied retail/wishlist migrations simply because the
native ledger lacks their versions; the existing inventory records the separate
Drizzle history. No ledger repairs are performed by this checker.

## Status and Next Decision

Automated SQL staging preparation is implemented. Source ownership/export access,
a real Supabase target, authenticated Storage/API acceptance, direct AI-provider
integration and approved production cutover remain open. The design prototype,
default build, historical migration files, live configuration and main branch
are unchanged.
