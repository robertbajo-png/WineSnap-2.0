# DEV-04: AI Quality

Suite version: `winesnap-ai-quality-v1`. This extends the existing app, not a new
AI stack. Local hosting does not make provider inference local. Keep current
approved providers, model settings, credentials and quotas unchanged.

## Reused Foundations

| Area | Existing implementation | Remaining quality work |
| --- | --- | --- |
| Label identity | Shared client/server label evidence, source/confidence, vintage validation | Actual photo transcription accuracy and uncertain-field review |
| Chef | Owner/version-pinned recipe/session context, output contracts, explicit draft review | Semantic usefulness, constraint adherence and contextual answers |
| Food Memory | Source-linked signals, explicit correction, weak-evidence threshold, reset/deletion boundaries | Fixed contradictory/weak evidence checks and explanation quality |
| Sommelier | Separate wine context/history, no claim of write tools | Grounded response quality and truthful unknowns |
| Recommendations | Verified identity catalog and deterministic scoring | Candidate relevance, explanations, no invented current prices/availability |
| Usage | Shared bounded action observations, private response metadata, atomic reservations and AI quotas | Install the source changes and verify affected owned routes without repeating paid cases |

The installed UI/RLS checks use mocked AI. Neither they nor this
deterministic suite establish live answer quality or certify food/allergen safety.

## Fixed Deterministic Set

`scripts/lib/ai-quality-suite.ts` runs the actual production validators with only
synthetic constants. `src/lib/aiQuality.test.ts` also asserts zero fetch calls and
content-free report fields. Stable IDs must be retained when cases are improved.

| IDs | Gates |
| --- | --- |
| AQL-01..07 | Visible identity, substituted producer, inferred/weak values, fabricated quote, split year, authoritative user text and unknown taste |
| AQR-01..04 | Complete recipe shape, rejected unsupported unit, partial document, truncated completion |
| AQM-01..07 | Foreign/pending/weak signals excluded, contradictory feedback uncertain, explicit correction wins, empty memory remains empty, repeated source not double-counted |
| AQS-01..04 | Existing allergy/raw-chicken/medical refusal routing and ordinary culinary question |
| AQW-01..04 | Invented catalog identity rejected, catalog facts override generated identity, duplicates removed, weak evidence does not increase match confidence |

Seven handler-level quality cases in `src/lib/chef.server.test.ts` complement the
26 pure cases: AQC-01/02 verify pinned/scaled active-step data and reject a stale
session before a provider call. AQR-05..09 reject schema-valid serving/time/safety
violations and accept complete generation/adaptation as drafts, never saved
recipes. These use synthetic provider/database doubles, not real Auth/RLS or AI.
Earlier handler, memory and installed deletion/isolation tests are retained;
AQM-06 alone is not proof of database reset or erased-account enforcement.

Run the portable unit gates with Vitest, or the existing local TS helper runtime:

```powershell
node --import tsx scripts/check-ai-quality.ts --deterministic
```

The CLI refuses any other mode. Its JSON contains only suite/version, evidence
flags, case ID/area/pass and elapsed milliseconds. No prompt, response, identity,
photo, user ID, preference, key, provider error body or health value is emitted.
`semanticQualityVerified` and `medicalSafetyCertified` are explicitly false.

## Private Action Observations

The optional observer in `_shared/aiObservation.ts` projects only fixed known
model names, token counts, bounded duration, actual transport attempts and
controlled outcomes. Missing usage stays null, not zero. Default callers do not
clone/read any extra body. When enabled, a bounded response clone leaves the
original response object unread and unchanged; bad, large or slow usage data
cannot cause a retry or break the business operation. No provider error body,
prompt, response text, image, account ID, preference or health value is recorded.

Owned-only wine API and Chef responses expose projected metadata through the
private no-store `X-WineSnap-AI-Metrics` header. Provider HTTP status and final
route status are separate; HTTP 200 alone is not successful validation. Cached,
safety and quota responses do not claim a new provider call. There is no telemetry
collector, public metrics endpoint or metrics content saved in conversation data.
Concurrent requests do not share observer state. Existing models/quotas/retry
destinations and deadlines remain unchanged.

Sommelier taste context now explicitly projects existing taste fields instead
of forwarding the full database row and internal account/timestamp metadata.
Privacy tests retain the relevant taste evidence and forbid arbitrary expansion.

## Bounded Live Cohort

The first cohort is a manual owned-fixture run, not automatic CI or a model
change. `scripts/test-owned-ai-quality.ps1` reuses protected existing Windows
stores and sends credentials only through private stdin to its parent-bound
worker. Never call the private worker directly. Its fixed eight scenarios are:

1. Readable synthetic label with known identity and split vintage.
2. Blank/unreadable synthetic label: do not invent an identity.
3. Generate a two-serving, twenty-minute culinary draft.
4. Adapt the selected version while respecting a confirmed culinary dislike.
5. Ask about the exact active step and scaled servings.
6. Sommelier with missing vintage/price: explicitly retain unknowns.
7. Recommend only supplied catalog identities, with source-backed facts.
8. Conflicting feedback: do not silently invent a permanent preference.

Each scenario gets one attempt and the existing handler token/deadline budget;
no automatic model fallback, paid rerun or deployment. Check authorization and
erasure/reset status before provider access. No real owner's data or original
photo is required. Reports retain action, selected/returned model, status,
duration, known token counts and controlled error class only. Missing usage is
unknown, never zero. Do not retain raw model output or prompts in logs/artifacts.
Perform qualitative review in the running process without exporting content;
an automated pass cannot replace that review. Prove exact fixture cleanup.

Review factual grounding, adherence to supplied constraints, contextual relevance,
truthful uncertainty and readable Swedish separately. Any unsupported identity,
private-context leak, invented price/stock or safety guarantee fails its case.
Allergen/health/food-safety refusals remain boundary tests, not clinical advice.
Broader phrasing and adversarial coverage remain necessary; the existing regex
tripwires are intentionally not a universal safety or DLP guarantee.

The worker validates exact owned container labels and uses current source handler
factories with normal synthetic Auth/RLS, not the owner's browser session. The
report has a durable one-attempt barrier before every possibly billable send;
attempted cases are never silently repeated, including failed or unknown results.
Dedicated private fixture manifests contain IDs/tags, not credentials, and permit
exact cleanup after interruption. Reports reject arbitrary extra fields and use
fixed preflight stages instead of raw database errors. Preparation checks verify
void writes through their actual normal-RLS effect, not invented return data.

## November 16 Results

All eight fixed cases passed from source `606f712` at 17:06:59 UTC, with one
native provider attempt each and exact fixture cleanup/absence verified. The two
label cases selected/returned `gpt-6.1-sol`; the other six selected/returned
`gemini-3.8-flash`. All provider and final route statuses were 200, with known
token counts. The blank image retained unknown identity; active-step/scaled
answer left state unchanged; conflicting feedback left confirmed preferences
unchanged. No real owner content or original photo was used. No credentials,
models, configuration, owner account or production data changed.

An earlier zero-provider run failed at 16:55:43 UTC because the harness expected
non-null data for successful empty writes. Cleanup passed. That failed run is not
model-quality evidence. The corrected source passed full Quality/Database Safety
CI: 176 files, 1,980 tests, one existing platform skip; main/worker typecheck,
lint (two existing warnings), security, synthetic build/runtime and client budget.

The local ignored report `dist/ai-quality-live/report.json` stores metadata only.
Do not rerun it to test UI changes or generate a misleading new timestamp: its
replay guard retains attempted results instead of issuing fresh paid calls.
These automated tripwires are not free-form semantic review, original-photo
accuracy, installed-browser verification, human acceptance or medical/allergen
safety certification. Their flags remain explicitly false.

## November 17 Installation

The owned Windows installation was updated from clean `f9bb532` after confirmed
viewer closure and verified encrypted backup/isolated restore. No new migration,
model, provider or public change. All six installed wine AI routes and Chef
denied anonymous POSTs with 401, no-store and no AI metrics header. Eleven
installed Features checks passed, including normal fixture Auth/RLS, memory and
the provider-free Chef safety path. Exact fixture cleanup passed; zero runs of
the paid cases. See the canonical development plan for the installation receipt.

This completes the scoped technical DEV-04 checks. Three actual owner usage
passes and qualitative review remain separate in DEV-05; no broad semantic or
medical conclusion follows from these automated checks.
