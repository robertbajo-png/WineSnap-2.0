# DEV-11: Safety and data protection review

Reviewed 2026-11-28 against source `ce0799e` and the
[canonical plan](development-plan.md#dev-11-optional-meal-goals-and-measured-ketones).
**Design approved for source and synthetic tests only.** This is an engineering review
and impact-assessment screening, not a signed DPIA, legal opinion, medical
validation, or authorization to collect real measurements.

## Existing WineSnap Boundary

| Area | Observed in source | DEV-11 decision |
| --- | --- | --- |
| Recipe nutrition and Keto | [NutritionPanel](../src/features/nutrition/NutritionPanel.tsx) starts in Standard and keeps the adult comparison mode and limit in temporary view state. [Calculation contract](recipe-nutrition-2026-10-25.md) preserves incomplete totals and separates label conventions. | Reuse the calculation and display provenance. Do not turn Keto mode, a draft limit or recipe adaptation into consent, stored settings or measured data. |
| Meal history and households | [Meals API](../src/features/meals/api.ts) reads saved cook sessions and wine links. Its family and diner paths have their own sharing scope. | Reuse the Kitchen placement and owner checks, not household membership, diner identifiers, completed cooking as proof of intake, or taste-memory permissions. |
| Photo meals | [Meal photo contract](../src/features/meal-photos/domain.ts) distinguishes image ranges, entered grams and unknown quantities. [DEV-10 local update](owned-meal-photo-local-update.md) records the private image path. | A confirmed photo item or manually entered food weight is still not a ketone reading. Do not add measurements to the image payload, photo table or bucket. |
| Authentication, export and erasure | [Account write scope](../src/lib/accountWriteScope.ts) helps with stale client actions but is not authorization. [Privacy export](../supabase/functions/privacy-export/handler.ts) enumerates allowed tables, and the [erasure worker](../supabase/functions/_shared/privacyErasure.ts) deletes the account after its file cleanup. | Reuse verified account checks and rights flows with explicitly scoped DEV-11 data. Existing owner, export and whole-account rules do not cover feature withdrawal or individual measurement erasure. |
| Local storage and recovery | [Kitchen offline storage](../src/features/kitchen/storage.ts) and the [service worker](../public/sw.js) preserve ordinary offline use. [Owned backup](../scripts/run-owned-windows.ps1) encrypts application archives with Windows DPAPI and rotates at most seven copies, dropping files older than seven days when a backup succeeds. [Portable backup](portable-backup-2026-11-01.md) can wrap that application archive for off-device use. | Do not add health data to offline storage. Review old-archive restoration, expiry with a failed scheduler, and portable exclusion before enabling real measurements. Archive encryption does not prove live disk encryption. |

The source inventory found no stored personal carbohydrate goal or ketone
measurement contract. The installed DEV-10 evidence is a baseline for local
delivery, not evidence of DEV-11 ownership, retention or recovery.

## Proposed Product Contract

Purpose: a personal recipe comparison and a private journal for an adult
using their own local account. No household, child, coaching, clinician or
public view. Each of the two features can be used without the other.

- **Meal goal:** one editable, explicitly self-set available-carbohydrate
  goal in grams per meal or per day, without a suggested amount. Compare
  a per-meal goal only to an explicitly selected and complete recipe
  estimate, clearly labelled as an estimate. A daily comparison requires
  a complete, explicitly confirmed total for the same metric and period.
  Existing recipe, cook and photo rows do not establish that total: show
  the goal without a progress verdict when consumption is unverified. No
  automatic adaptation, deficit, score, streak or restriction.
- **Measurement journal:** manually enter a reading already obtained by
  the account owner. Store owner and entry IDs, method, unit or categorical
  scale, observed reading and measured time. Show the selected time and
  resolve ambiguous local times explicitly. Store a canonical instant and
  enforce the retention window by measured time, not edit time.
- **Methods:** blood beta-hydroxybutyrate in `mmol/L`, breath acetone
  measured in `ppm`, and urine acetoacetate as the exact category of a
  reviewed, identified strip scale. A numeric blood or breath reading
  must be finite with validated precision and the exact supported unit.
  Do not map proprietary scores or an out-of-range display to a number.
  Do not convert urine categories to a concentration or assign a numeric
  zero to a negative strip. Preserve original supported distinctions and
  reject unsupported combinations without guessing.
- **Display:** show method, unit, time and manual provenance with each
  reading. History is ordered by time within the same method and unit
  (and same scale for urine); no mixed series, inferred values, severity
  labels, clinical ranges, "confirmed ketosis" or treatment suggestions.
  No optional free-text notes, device identifiers, photos, symptom
  fields, medication data, syncing or automated device import.

The proposed formats reflect [FDA's blood meter decision summary](https://www.accessdata.fda.gov/cdrh_docs/reviews/K182593.pdf),
[Suntrup et al.'s original breath study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7520093/),
and the [FDA urine strip decision summary](https://www.accessdata.fda.gov/cdrh_docs/reviews/k170587.pdf).
The [manufacturer's strip legend](https://shop.ascensiadiabetes.com/pages/ketostix-insert)
is evidence for that specific scale only. These are input-format references,
not device endorsements, conversion rules or clinical thresholds. The product
is a journal, not for diagnosis, treatment or monitoring a medical condition.
Intended use, actual behavior and claims all matter. Reassess qualification
before any device connection, interpretation, clinical alert or medical claim
under the [MDR, recital 19 and Article 2](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng/pdf)
and [MDCG software guidance, revision 1](https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en).

## Consent and Data Lifecycle

Design on the basis that identifiable ketone readings are health data.
Protect the saved target and its setting too, since context may reveal
health information. Where GDPR applies, the proposed basis for each
optional purpose is consent under Article 6(1)(a), with explicit consent
under Article 9(2)(a) where required. This is not a determination of the
operator's basis. A private Windows host does not decide whether the
household exception applies or who is controller or processor. Resolve
those roles and contacts before real activation; the existing
[processing assessment](privacy-processing-assessment-2026-10-25.md) did
not verify the legal entity or approve this purpose. See the
[GDPR, Articles 2, 4, 5, 6, 7, 9 and 13; recitals 18 and 35](https://eur-lex.europa.eu/legal-content/EN-SV/TXT/?uri=CELEX%3A32016R0679),
[IMY on sensitive data](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/kansliga-personuppgifter/nar-far-ni-behandla-kansliga-personuppgifter/)
and [EDPB consent guidelines](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf).

- Release disabled; for an eligible account, present two separate off-by-default
  controls with clear scope, retention, access and rights before opt-in. No
  prechecked box, bundled terms, previous Keto selection or change to ordinary
  features on refusal. Keep only proof needed for the selected purpose and
  version. Withdrawal must be as easy as opt-in, without a support request.
- **Proposal:** retain only the current meal goal until it is replaced, deleted,
  switched off or the account is erased. Retain readings for 90 days from
  measurement, or less when deleted or switched off. Block expired reads and
  exports from the deadline and cover purge retries and restart. No historical
  target versions or renewed reading retention by editing.
- A successful off action revokes reads/writes and removes that feature's
  stored content, including pending work. Clear open views immediately and
  refuse stale requests using a server-side account and consent check at
  commit. Keep the other feature unchanged. A later opt-in starts empty.
  Support correction, individual reading deletion and whole-account erasure.
  Do not report a failed or offline deletion as complete.
- Provide an explicit, machine-readable owner export with the original
  method, unit, scale, reading, time and separate goal. Recheck owner,
  account and consent when returning results. Use a protected local path
  and no share link; tell the owner a file they save is a separate copy.
  Do not omit DEV-11 data from the local rights process. See
  [GDPR Articles 15 to 17 and 20](https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04/eng/pdf).
- Self-hosting is not, by itself, an access or encryption control. Only
  the verified local account, narrowly scoped local processes and necessary
  Windows/Docker infrastructure may handle the records. Do not promise
  protection against a compromised OS or administrator. Verify encryption
  of the live database disk and temporary/WAL data, and rule out OS/cloud
  sync of the relevant paths before real activation.

### Backup and Withdrawal

Propose only protected, same-installation archives for DEV-11 content,
with an enforced maximum of seven days. Expire stale copies even after a
missed backup before making recovery available. The existing backup rotation
alone is not proof of that bound. Block portable creation/export containing
DEV-11 data until verified exclusion exists; do not silently label a partial
backup complete. User-requested data export is a separate action.

Restore with DEV-11 locked, in isolation first. Keep the minimum revocation
and deletion evidence outside the restorable archive so an older copy
cannot replace the newer decisions. Record only protected, opaque identifiers
and scope/timing needed to suppress restored data, never measurement or goal
content. This is still protected metadata. Propose keeping a deletion receipt
only while a permitted archive may contain the data, with at most one
verification day after archive expiry (at most eight days from deletion).
Settle its basis before activation; do not extend the window silently.
Reapply withdrawal, per-entry deletion, account erasure and
expiry before either feature or its export opens. If independent evidence
is missing or stale, keep DEV-11 locked: do not serve resurrected records
or infer consent from a snapshot. Ordinary WineSnap recovery remains
separate. Build a synthetic proof that a retained record can be restored,
while one erased after the snapshot cannot, including interruption/restart.

### Existing Routes and Portable Copy Paths

Both the [gated proxy](../config/owned-windows/gated-internet.conf) and
[alternate proxy](../config/owned-windows/internet.conf) forward app paths
and backend REST paths. The [ordinary privacy export](../src/routes/api/privacy/privacy-export.ts)
is an app path. A paused tunnel is an operating constraint, not proof
that these routes would reject the new data if it were reopened.

- Use distinct local-only entry points for DEV-11 reads, writes and the
  owner export. Block those entry points in both ingress configurations;
  verify the local server boundary independently. Do not trust a client
  flag, Host header or the fact that a request passed the outer login gate.
  Deny direct access to DEV-11 tables and functions through backend REST
  with any browser token, including the owner's. The local handler still
  verifies owner, active account and current consent.
- Keep the ordinary export available for its existing data. The local
  rights interface must clearly offer the dedicated DEV-11 export; do not
  add these records to a shared allowlist also used by proxied exports.
  Rehearse denial with authenticated synthetic owners at both simulated
  ingress modes and their direct REST paths, leaving the real tunnel paused.

The [portable wrapper](../scripts/run-owned-portable.ps1) reads a verified
app archive for Create. Its Export action can copy an existing encrypted
file as is, without decrypting it. An off switch or filename is therefore
not proof of what an older artifact contains.

- Before enabling real data, verify exclusion from the actual portable
  payload, including the database dump, not just its inventory. Create must
  verify the contents and bind trusted exclusion evidence to the resulting
  archive bytes before making the file available. Before either copy path
  runs, compare that evidence against the exact source file. Stop safely
  without a match; preserve verified pre-DEV-11 archives.
- Rehearse and RecoverFiles must also verify permitted scope before
  materializing recovered files. Test refusal of a portable artifact with
  DEV-11 content as well as restoration of an eligible local archive from
  before a withdrawal. Do not let previously approved app recovery reopen
  this new data class or bypass the separate withdrawal evidence.

## Risks and Required Evidence

| Risk | Proposed reduction | Evidence before real activation |
| --- | --- | --- |
| A comparison is mistaken for clinical advice or a missing serving for zero intake. | Neutral self-set goal, input provenance, no recommendation/alert; method-specific journal with no estimates. | Invalid units, missing data, timestamps/DST, all three methods, and no mixed history or claims; check mobile wording and layout. |
| A stale tab or another account sees or writes data. | Backend default-off and owner authorization, separate feature scope, active account and current consent checks, restrictive grants/RLS, epoch-based invalidation. Request body does not establish owner. | Synthetic owner, peer, household member, anonymous and erasing-account tests; revoke during in-flight save/export, logout, back navigation and account switch. |
| Records escape via caches, sharing, logs or AI. | Local-only routes and export; deny at ingress as well as server, not a browser flag or forwarded-header check. No health text/values in URLs, offline caches, SSR, telemetry or provider context. | Loopback works only when enabled; simulated proxy/direct-RPC attempts denied; inspect network traffic, cache and logs with synthetic data. Test unrelated cellar, recipe, household and chat flows unchanged. |
| Host or backup loss exposes values, or restore undoes erasure. | Disk and archive controls, isolated recovery, independent revocation evidence and exclusion from portable copies. | Verify host protection and retention jobs, loss-of-journal fail-closed behavior, exact backup/restore scope, erasure and rollback with no newer data overwritten. |
| Feature is used for minors, third parties or healthcare. | First use limited to the verified adult owner's account; no age/health dossier, family link, device connection, clinical interpretation or public release. | Review the actual audience/access path and notice. Reassess before expanding to other users or uses. |

Identifiable health data and potentially harmful misuse justify a scoped
impact assessment as a release gate even for a small local pilot. Assess
the actual scale, recipients, audience, safeguards and residual risk under
[GDPR Articles 25, 32, 35 and 36](https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04/eng/pdf)
and [IMY's DPIA screening criteria](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/nar-ska-en-konsekvensbedomning-genomforas/).
Consent alone does not remove the need for an impact assessment where
required. If high residual risk cannot be reduced, do not activate; obtain
qualified advice on any prior consultation obligation.

## Owner Decision

The owner approved the two separate controls, manual methods, 90-day live
history, deletion on withdrawal and local-only seven-day backup design for
a disabled build and synthetic verification only. See the
[implementation notes](owned-private-journal.md) for subsequent evidence.
Before real use, complete the scoped impact review, settle controller
responsibility, withdrawal evidence and retention, verify technical and host
controls, and publish the specific notice in the local app. Local installation
needs its own approved backup, restore and rollback window; the individual
account still has to explicitly opt in. Do not activate or collect actual
values through chat, development fixtures or an approval of this document.

This checkpoint reviewed the repository and primary sources only. No app
code, schema, stored data, runtime, connector, old production or abandoned
Supabase test was changed. DEV-09 remains out of scope.
