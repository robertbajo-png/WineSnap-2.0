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
| Usage | Chef result model/tokens/duration, atomic reservations and AI quotas | Consistent content-free action/error visibility across other AI routes |

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

## Remaining Live Cohort

Prepare one bounded, opt-in owned-fixture run, not automatic CI or a model change.
Reuse the private Windows wrapper, tagged disposable accounts and existing keys;
do not call private workers directly. Limit the first cohort to eight scenarios:

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

Next: implement bounded provider observations and the guarded live-cohort wrapper,
then run and review it separately. Do not mark DEV-04 complete from the offline set.
