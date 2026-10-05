# WineSnap AI models

Model availability and API compatibility checked against official documentation on
2026-10-05. Defaults are maintained in
`supabase/functions/_shared/aiModels.ts`, shared by Edge Functions and the server
catalog-matching route. No provider credentials are sent to the browser.

## Workload routing

| Workload                                                                   | Gateway model             | Request contract                                                         |
| -------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Label reading (`analyze-wine`)                                             | `openai/gpt-6-sol`        | Chat Completions, `reasoning_effort: "none"`, forced `extract_wine` tool |
| Ask WineSnap                                                               | `google/gemini-3.8-flash` | Chat Completions, text answer; stored model metadata uses the same ID    |
| Taste memory, recommendations, restaurant menus, wishlist catalog matching | `google/gemini-3.8-flash` | Chat Completions, existing forced tools                                  |

Gemini 3.8 Flash is the latest stable Flash generation and is listed by Lovable.
GPT-6 Sol is the newest compatible balanced OpenAI option **for the existing
gateway and forced-tool contract**, not OpenAI's globally latest balanced model.

OpenAI's latest balanced model is GPT-6.1 Sol; its flagship is GPT-6 Astra. Both
require Responses for tool calling and do not support reasoning effort `none`.
Lovable currently lists GPT-6 Sol, Astra and Luna, but does not list GPT-6.1 Sol.
The current forced-tool request is unsupported by those models on OpenAI's Chat
Completions endpoint. Whether Lovable translates it to Responses is not verified.
That upgrade needs verified gateway support or a Responses integration (including
request/response adaptation and label regression tests); do not swap IDs alone.
Do not silently change providers, introduce an OpenAI API key, or add an
unvalidated fallback.

Existing prompts, schemas, evidence validation, ranking, authentication, quotas,
timeouts and credit-error handling are preserved. Models do not set retail prices.

## Deployment and verification

1. Run typecheck, lint, Vitest and the production build.
2. Deploy all six changed Edge Functions: `analyze-wine`, `ask-winesnap`,
   `extract-preference-signals`, `wine-suggestions`, `taste-suggestions`,
   `restaurant-match`. Publishing the frontend alone does not verify their deploy.
3. Publish the server build to update `/api/public/hooks/match-systembolaget`.
4. With the project's existing server-side `LOVABLE_API_KEY`, smoke-test each
   workload in the test project before production rollout. Local mocked tests do
   not establish model access, latency, cost, or recognition quality in production.
5. Check the original Zehn Morgen Chardonnay & Weisser Burgunder 2023 label,
   unreadable labels and text-only input. Unsupported identity fields must stay
   unknown; known-label accuracy needs comparison against the previous model.
6. Check Ask's complete answers and stored model ID; recommendations and restaurant
   menus must retain their schemas and deterministic ranking. Verify catalog
   matching rejects an unrelated product and preserves server-verified prices.
7. Check gateway failures, exhausted credits, quotas and observed timeout behavior.

No database migration or client settings change is needed for this model upgrade.
For rollback, restore the shared defaults to `openai/gpt-5.6-terra` and
`google/gemini-3.7-flash`, then redeploy the same Edge Functions and server build.

## Official sources

- [Lovable supported app models](https://docs.lovable.dev/features/ai)
- [Gemini 3.8 Flash capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [OpenAI latest models and migration compatibility](https://developers.openai.com/api/docs/guides/latest-model)
