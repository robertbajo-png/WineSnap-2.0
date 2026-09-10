# AI gateway review - 2026-09-09

## Isolated probe report - reviewed 2026-09-10

A new private unpublished project was created:
https://lovable.dev/projects/0a48ce33-ffd4-49b5-93b4-0836977d1a66
Lovable reports completed probe commit `934fb699ffae5124212971cf4e1d0da3c27da2b2`.
Its final report records Terra HTTP 400 initially (378 ms), requiring
`reasoning_effort: "none"` with forced tools on chat/completions. After changing
that parameter, Terra returned HTTP 200 (1547 ms) and Gemini HTTP 200 (1563 ms),
with the expected tool and marker. The earlier Gemini run also returned 200
(1257 ms). These are Lovable-reported measurements, not independently repeated
local measurements. More than the requested one call per model was made.

The WineSnap analyze-wine request now includes the same compatibility parameter,
with a source regression check. This does not measure wine accuracy, image input,
or deployed WineSnap behavior. The probe used a synthetic marker only and different
gateway headers from WineSnap. Do not treat the entire integration as certified.

Cleanup was requested to remove the temporary executable probe and retain a static
report, but the connector rejected it with missing `projects:write` scope. Cleanup
is NOT complete. The generated initial server function had no explicit caller
authentication; Lovable's claim of authentication was not independently verified.
Do not publish or run the test project further. Restore authorized write access
or manually remove its callable gateway function before considering cleanup done.
No production settings or data were changed.

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
