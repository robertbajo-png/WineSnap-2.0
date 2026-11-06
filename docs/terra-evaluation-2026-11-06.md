# GPT-6.1 Terra evaluation

Date: 2026-11-06. This is a manual candidate evaluation, not a model migration
or release approval. The installed models, running app, real accounts, old
production, DNS and authentication configuration were not changed.

## Method

The actual WineSnap handler factories ran in a private Node process against the
owned Windows backend. Their AI dependency used `gpt-6.1-terra` through the
Responses API, with the original prompts, authentication, quotas, validators,
JSON schemas and function contracts. Existing defaults remain GPT-6.1 Sol for
label reading and Gemini 3.8 Flash for the other workloads.

Only administrator-tagged synthetic fixture accounts were used. Wine, recipe,
feedback and preference context was synthetic. The original Zehn Morgen WebP
was the bottle image previously approved by the owner; menu/blank images were
generated locally. No real account session or private cellar was sent to AI.

## Results

The full run made 16 successful provider requests: one availability/generation
canary and 15 feature scenarios. Fourteen feature scenarios passed; the original
bottle identity check failed. All 20 backend/guard/cache/persistence checks passed,
and exact fixture cleanup completed with zero failures.

| Workload                              | Check                                                         | Result |
| ------------------------------------- | ------------------------------------------------------------- | ------ |
| Label from text                       | Name and vintage 2023                                         | Pass   |
| Original bottle image                 | Transcription, producer and vintage                           | Fail   |
| Blank image                           | No invented producer or vintage                               | Pass   |
| Wine chat                             | Swedish, saved history, peer isolation; English follow-up     | Pass   |
| Personal and similar-wine suggestions | Forced function calls, verified catalog identities            | Pass   |
| Restaurant list                       | Text and image; two wines and numeric menu price              | Pass   |
| Wine preference extraction            | Explicit tasting-note evidence                                | Pass   |
| Chef chat                             | Confirmed memory, cached retry, peer isolation                | Pass   |
| Recipe generation/adaptation          | Valid drafts, servings, no implicit save/overwrite            | Pass   |
| Food Memory                           | Evidence excerpts, pending rather than auto-confirmed signals | Pass   |
| Cook Mode                             | Active session context and short assistance                   | Pass   |
| Safety guard                          | Deterministic response without a provider call                | Pass   |

Three further original-image repetitions each transcribed the name and split
year, returned vintage 2023, but failed the producer-match requirement. The
quality failure is retained; no prompt, validator or expectation was relaxed.
This prevents recommending Terra for all workloads on this evidence.
A fourth diagnostic repetition confirmed that the validated producer field is
`null`, while the transcribed name and vintage 2023 are present. This is a
missing validated identity, not evidence of a substituted producer. The current
report does not distinguish a model omission from rejection by label validation.

Provider latency in the full run was about 1-9.2 seconds; handler latency about
2.6-10.6 seconds for uncached AI actions. Full-run usage: 14,320 input tokens
(2,708 cached), 4,172 output tokens, approximately USD 0.03261. The three image
repetitions plus their canary cost approximately USD 0.00832. These are estimates,
not invoices, using the published standard token rates; images count within the
reported input usage.
The final single-image diagnostic and canary cost approximately USD 0.00345;
all three invocations together made 22 provider requests, approximately USD 0.04438.

## Repeat Safely

Run only on the existing owned Windows installation, from PowerShell 7:

```powershell
./scripts/test-owned-terra.ps1
./scripts/test-owned-terra.ps1 -ImageOnly
```

`-ImageAttempts 1` optionally bounds an image-only diagnostic to one repetition.
Never invoke `check-owned-terra.ts` directly. The wrapper decrypts existing
CurrentUser-protected backend/provider stores, clears inherited environment,
pipes credentials privately and binds the worker tree to its lifetime. Each
invocation is limited to 20 provider requests, 8,192 output tokens per request,
45 seconds per provider request, no redirects, no retries and no model fallback.
Provider storage is disabled with `store: false`.

Credential-free reports are generated under `dist/ai-terra-evaluation` and
`dist/ai-terra-image-evaluation`. A nonzero exit is expected when a quality check
fails, even when cleanup and all HTTP requests succeeded. Reports contain
statuses, token counts, timings and bounded observations, not credentials,
provider error bodies, private account IDs or browser authentication state.

## Limits And Recommendation

This is a small functional smoke evaluation, not a blind quality comparison or
physical-camera/browser acceptance. It does not establish that Terra is better,
faster or cheaper than the current split, which was not benchmarked alongside it.
The candidate transport is test-only; no application setting enables it. Keep
the installed model split until the image identity issue is understood and a
larger representative label set passes. Chat, recommendations and Chef are
reasonable candidates for a separate controlled migration.

Official references: [Terra model](https://developers.openai.com/api/docs/models/gpt-6.1-terra),
[Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses).
