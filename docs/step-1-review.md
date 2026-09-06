# Step 1: Change inventory and scope review

Date: 2026-09-05. Authorized scope: step 1 only.

## Baseline

- Worktree: `WineSnap-2.0-hardening`, branch `codex/winesnap-hardening`.
- HEAD and the locally stored `origin/main` point to `a484f38` (0 commits apart).
- No remote fetch was performed. This comparison does not establish the current GitHub HEAD.
- The initial tracked diff covered 84 files; untracked additions were inventoried separately.
- The original `WineSnap-2.0` checkout was read only during this review.
- Its status listed 12 modified paths; 11 had content differences reported by `git diff`.
- Combined SHA-256 of those 11 paths and their bytes before/after cleanup was identical:
  `1a9641e9fa6772d29308cd764307cf13c2a91c2c7f37c0ab24d6bc6a5ba6d532`.
- There is no byte-level snapshot from before the earlier hardening work. This checksum proves preservation during this cleanup, not historical equivalence.

## Scope Decisions

| Change group | Decision |
| --- | --- |
| Public views, RLS, private labels, rate limits, admin RPC | Retain; executable database verification belongs to step 2. |
| AI validation, confirmation before saving, API authentication | Retain; endpoint verification belongs to step 3. |
| Social queries, image component, auth provider, Query provider | Retain; integration coverage belongs to steps 4 and 5. |
| Responsive layouts, aroma keyboard handling, translations | Retain; visual and accessibility verification belongs to step 5. |
| 24 PNG removals and 24 matching WebP additions | Intentional asset replacement. |
| Service worker, manifest and 192px icon | Retain; offline/cache verification belongs to step 7. |
| Bun lock change and npm lock removal | Intentional choice of one package manager; frozen installation remains to verify. |
| Tracked `.env` removal and `.env.example` addition | Intentional configuration cleanup; ignored local configuration retained. |
| Generated route tree | Retain the cron route registration and generated Start type registration. |
| CI and scheduled workflow files | Local definitions only; not pushed, activated, or verified in GitHub. |

Formatting both baseline and changed source with the same Prettier settings identified 16 formatting-only files. The accidental six blank-line additions in `.lovable/plan.md` were removed, and `.lovable/` was added to `.prettierignore`.

The other 15 formatting-only code files are retained as intentional lint cleanup: EmptyState, LabelCropper, Logo, RadarChart, WorldMap, four Supabase client/auth files, drinkingWindow, about, login, onboarding, and styles.css. Removing those changes would reintroduce violations of the existing formatter rule. Formatting within functionally changed files also remains; it must not be mistaken for equivalent amounts of behavioral change.

## Findings For Later Authorized Steps

1. Step 2: `20260830122000_data_constraints.sql` lowercases usernames under an existing unique constraint. Case-only duplicates can abort migration. Invalid names are also cleared; legacy data handling needs review before application.
2. Step 2: `20260830120000_harden_public_data.sql` rewrites existing share IDs without a compatibility mapping. Previously distributed URLs containing changed characters can stop resolving.
3. Step 2: Public image access trusts a `wine_photos.storage_path` association. Verify and constrain ownership of both the wine and storage object; the original photo policy only checks the row's `user_id`.
4. Steps 3 and 4: Cron processes at most 500 rows without pagination or ordering, returns `ok: true` even with failed rows, and reopens alerts whenever the target remains reached. The workflow checks HTTP failure only.
5. Step 5: Admin's unauthenticated state leaves `allowed` null and renders loading indefinitely. Its local authorization/statistics state is not reset when the user changes.
6. Steps 4 and 7: Signed-image cache is keyed only by path and survives account changes. Recommendation state can survive a direct account switch when the new account has no valid cached data.
7. Step 7: Service worker caches navigation responses without checking success/cache policy and deletes every other named cache on the origin during activation. Narrow its cache ownership and review private-content behavior.

These findings are documented, not fixed in step 1. They show why previous green type/lint results do not establish production readiness.

## Verification In This Step

- `git diff --check`: passed.
- `git diff --exit-code -- .lovable/plan.md`: passed.
- Original checkout content checksum: unchanged during cleanup.
- No server, migration, deployment, workflow, build, or application test was started.
- No commit, push, or pull request was created. Steps 2 through 9 remain paused.
