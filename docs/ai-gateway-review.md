# AI gateway review - 2026-09-09

Lovable's gateway is retained; no provider or model switch was made.
The repository uses `openai/gpt-5.6-terra` for analyze-wine and
`google/gemini-3.7-flash` for wine-suggestions, taste-suggestions and
restaurant-match. Both model families are listed in the current official
documentation: https://docs.lovable.dev/features/ai
Documentation support is not proof that these exact API identifiers work with
this project's credentials. No live model request was made during this review.

## Changes

- Shared gateway transport with a 45-second deadline covering headers and body.
- Network/provider errors return sanitized 502 responses; timeout returns 504.
- Existing 402 credit and 429 rate-limit handling preserved.
- No automatic retries of potentially billable generation requests.
- All four handlers verify the expected tool name and parse structured results
  against their existing schemas. Missing, malformed or truncated results no
  longer look like empty recommendations or invalid user input (400).
- Prompts, models, authentication and rate-limit logic remain unchanged.

Eight mocked tests pass covering valid responses, missing/wrong/malformed tools,
schema failure, truncation, 402/429, network/500 errors and deadlines during both
connection and body reading. Lint passes. On 2026-09-09 all four handlers passed
`deno check --no-config --no-lock` using Deno 2.9.6. CI now runs that same check.
This is Deno static validation, not a deployed Edge Function or live model test.

The Lovable project connector was inspected read-only. WineSnap 2.0 still reports
commit `e3fdd096`, not the hardening work branch. A workspace search for wine
returned the published WineSnap 2.0 and older wine-lens-snap projects; neither was
identified as the separate test deployment. No existing project was modified.

## Release Gates

1. Configure project-scoped Lovable gateway access in an isolated test deployment.
   No gateway key was present in the local environment; do not copy production
   secrets into committed files or browser code.
2. Verify each exact model ID with synthetic text and label-image requests.
3. Measure latency and verify that the 45-second deadline is appropriate; do not
   describe response times or cost as measured until that run exists.
4. Evaluate known wine labels, ambiguous text, unreadable labels and recommendations
   with a small labelled fixture set. Analyze-wine still prompts the model to infer
   plausible missing values; factual accuracy/uncertainty remains a separate risk.
5. Verify deployed CORS/Auth, rate limiting, insufficient-credit errors and UI
   behavior. Deno static checking is complete; frontend tsc alone excludes handlers.

No Edge Functions or production settings were deployed or changed by this work.
