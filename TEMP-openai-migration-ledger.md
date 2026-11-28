# WineSnap Local OpenAI Migration

**Decision:** The owner approved the assessed migration and previously chose to
reuse WineSnap's existing protected OpenAI credential. The OpenAI profile
defaults to GPT-6 Luna when no model is specified. The owner subsequently
selected a GPT-6.2 model for the private Windows installation; OpenAI documents
GPT-6.2 Sol and GPT-6 Luna, so the installed profile explicitly uses 6.2 Sol.

**Scope:** Direct OpenAI on the owned Windows server only. Keep the existing
database, Auth, context selection, response contract and UI. Keep Gemini as an
explicit operator choice, never an automatic retry or fallback. Keep the old
hosted app, Edge defaults, tunnel, device settings and DEV-09 audio unchanged.

**Privacy:** Send only the context each existing handler authorizes. Turn
Responses storage off; this is not a claim of Zero Data Retention or regional
processing. Organization-wide credit coverage and retention settings were not
verified. Do not change data sharing or billing.

## Approved Stages

| Stage | Workload | Integration | State |
| --- | --- | --- | --- |
| Baseline | Bottle label recognition | Existing GPT-6.1 Sol Chat Completions | Unchanged; routing tested |
| 1 | Ask WineSnap and its scoped history | Luna or 6.2 Sol, Responses API | Simulated responses through handler; completed answers saved to the scoped owner only |
| 2 | Chef chat, recipe generation, adaptation and food feedback extraction | Luna or 6.2 Sol, Responses API | All four actions tested through Chef; drafts and evidence checks retained |
| 3 | Taste and wine suggestions, restaurant text and images, wine preference extraction | Luna or 6.2 Sol, Responses API | Actual handlers tested with simulated responses; verified catalog/ranking and valid signals retained |
| Delivery | Windows provider choice, isolated tests and setup documentation | OpenAI with explicit 6.2 Sol | Running locally; restore, scope, health and synthetic provider checks passed |

## Integration Decisions

| Guidance | Decision |
| --- | --- |
| Model, tier and output limits | Both OpenAI choices support text, images, structured outputs and functions. Keep the default service tier, low reasoning and bounded per-call limits and timeouts. No live quality or price claim. |
| Instructions and state | Preserve every system instruction and the existing locally stored history. No provider-managed conversation, previous-response chaining, compaction, assistant phases or cross-turn reasoning items. |
| Complete responses, streaming and WebSocket | Preserve bounded HTTP calls and complete responses. No introduced streams, background jobs, persistent connections or replay. Treat incomplete and refused responses as failures. |
| Retention, residency and caching | `store: false`. Do not extend cache retention, invent cache keys, add cache breakpoints or run cache diagnostics on private prompts. Project-specific controls are a separate activation check. |
| Tools and schemas | Existing function declarations only describe output. Preserve them and schema validations without executing tools, enabling parallel calls, adding native tools or forwarding provider-specific parameters indiscriminately. |
| Reasoning and usage | No summaries, preambles or previously encrypted reasoning to replay for these independent completions. Keep access/error handling and translate input/output, cache and reasoning usage metadata without exposing content. |
| Compatibility | Existing direct Gemini Chat Completions is retained as a manual alternative. Do not touch the original label path, provider keys, hosted routes or the app's contracts. |

## Verification And Handoff

Eleven focused files / 312 tests and the full Windows Vitest run
(189 files / 2,216 tests) passed. Evidence covers transport, existing provider
routing, complete handlers, web-only profile selection and simulated rollback.
The first typecheck caught a table-test fixture receiving individual output
items instead of an array. The fixture was corrected and the three affected
suites passed again (124 tests); application code was unchanged. PowerShell
syntax passed. Tests do not establish real model access,
quality, latency, token spend or credit eligibility on the owner's project.

On November 25, the approved [owned-only update](docs/ai-models.md#owned-windows-profile)
installed `1e2211ebc69e` from clean reviewed source `3f16a15`; Quality and
Database Safety had passed. The exact fresh encrypted backup passed an isolated
restore with 78 tables, Auth and one stored image; temporary resources were
removed. The update retained the exact previous image under
`winesnap-owned:text-ai-rollback-1f76671b878e`, kept 40 migrations and other
services unchanged, left the connector paused, and passed app, database, Auth
and Storage checks. A loopback visit and the app health endpoint returned 200.

Live provider evidence is limited to two bounded requests, with no app or
owner data: a plain-text preflight and a strict JSON output check from the
installed web container. Both returned a completed result under GPT-6.2 Sol,
without retries, fallback or changes to billing or data settings. Per-feature
acceptance and credit eligibility remain separate. Bottle scans and hosted
environments were not tested or changed in this rollout.

References: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[GPT-6.2 Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol),
[Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses),
[API data controls](https://developers.openai.com/api/docs/guides/your-data).
