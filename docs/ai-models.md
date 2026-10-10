# WineSnap AI models

Model availability and API compatibility checked against official documentation on
2026-10-05. Defaults are maintained in
`supabase/functions/_shared/aiModels.ts`, shared by Edge Functions and the server
recommendation routes. No provider credentials are sent to the browser.

## Workload routing

| Workload                                                                   | Gateway model             | Request contract                                                         |
| -------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Label reading (`analyze-wine`)                                             | `openai/gpt-6.1-sol`      | Chat Completions, `reasoning_effort: "low"`, strict JSON-schema response |
| Ask WineSnap                                                               | `google/gemini-3.8-flash` | Chat Completions, text answer; stored model metadata uses the same ID    |
| Taste memory, recommendations, restaurant menus | `google/gemini-3.8-flash` | Chat Completions, existing forced tools                                  |

Retail matching is deterministic as of the 2026-10-10 release repair. It does not call an AI model or accept nearby vintages, assumed bottle sizes or low-confidence product selections. Concrete recommendation identities now come from a small source-linked catalog; the models select IDs and estimate style, not producer/name/vintage/price facts.

Gemini 3.8 Flash is the latest stable Flash generation and is listed by Lovable.
GPT-6.1 Sol supports image input and structured outputs on Chat Completions
without tools. It does not support reasoning effort `none`, so the reader uses
`low`. The former `extract_wine` tool only described the output: it did not execute
application code. Its schema is now supplied as a strict `response_format` JSON
schema. The client still receives `{ wine: { label_text, identity, taste } }`.

The reader rejects refusals, incomplete completions, invalid JSON and invalid root
blocks before applying the existing evidence validation. The request is capped at
8192 completion tokens (including reasoning) and 45 seconds. Temperature and tool
parameters are not sent. Gemini flows, ranking, authentication, quotas and credit
errors are unchanged. Models do not set retail prices.

**Gateway access is not verified.** Lovable's published model list currently does
not include GPT-6.1 Sol, and a project gateway key is not available locally. This
configuration follows OpenAI's supported request contract; it does not prove
that Lovable accepts the model ID and JSON-schema format for this project.
Verify both in the test project before deploying to production. A gateway error
must not trigger a silent downgrade or a switch to another provider/API key.

## Pricing

OpenAI Standard prices for GPT-6.1 Sol and GPT-6 Sol are both $2 input and $10 output
per million tokens for short-context requests. GPT-6.1 cached input is $0.10 versus
$0.20 for GPT-6 Sol. GPT-6 Astra is $10 input and $50 output. These are provider
rates, not a verified Lovable project invoice; total scan cost also depends on
image tokens, reasoning tokens and cache hits. Do not promise a fixed saving.

## Deployment and verification

1. Run typecheck, lint, Vitest and the production build.
2. Deploy the six changed Edge Functions to the isolated test project: `analyze-wine`, `ask-winesnap`,
   `extract-preference-signals`, `wine-suggestions`, `taste-suggestions`,
   `restaurant-match`. Publishing the frontend alone does not verify their deploy.
3. Publish the test server build to update `/api/public/hooks/match-systembolaget`.
4. Before production, confirm GPT-6.1 Sol and strict `response_format` support
   using the test project's existing server-side `LOVABLE_API_KEY`. Then smoke-test each
   workload in the test project before production rollout. Local mocked tests do
   not establish model access, latency, cost, or recognition quality in production.
5. Check the original Zehn Morgen Chardonnay & Weisser Burgunder 2023 label,
   unreadable labels and text-only input. Unsupported identity fields must stay
   unknown; known-label accuracy needs comparison against the previous model.
6. Check Ask's complete answers and stored model ID; recommendations and restaurant
   menus must retain their schemas and deterministic ranking. Verify catalog
   matching rejects an unrelated product and preserves server-verified prices.
7. Check gateway failures, exhausted credits, quotas and observed timeout behavior.
8. Deploy the verified functions and server build to production only after those
   checks pass. Publishing the app alone does not establish that the Edge
   Functions run the new model.

No database migration or client settings change is needed for this model upgrade.
If rolling back this GPT-6.1 change, restore the label reader and its shared model
default together to the GPT-6 Sol implementation in commit `8a43be6`, then redeploy
`analyze-wine`. An ID-only rollback does not restore the former forced-tool parser.

## Official sources

- [Lovable supported app models](https://docs.lovable.dev/features/ai)
- [Gemini 3.8 Flash capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [OpenAI latest models and migration compatibility](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-6.1 Sol capabilities and pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Model price comparison](https://developers.openai.com/api/docs/models/compare?model=gpt-6-sol)
- [Structured outputs without function calls](https://developers.openai.com/api/docs/guides/structured-outputs)
