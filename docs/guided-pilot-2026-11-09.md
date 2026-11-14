# Guided Local Pilot

Status: pilot preparation and automated demo rehearsal complete;
**zero human pilot sessions recorded**. Guided human sessions remain pending.
Scope: the existing owned dark app on this PC. This is stage 6 of
[the delivery plan](pilot-development-plan-2026-11-05.md), not a public release,
mobile-access approval or a new application prototype.

## Reuse And Boundaries

Reuse `run-owned-windows.ps1 -Action PilotDemo`: the installed app, ordinary
synthetic-account Auth/RLS, recipe versions, Cook Mode, private wine/image save,
pairing and memory controls. Every invocation creates a separate tagged example
account, refuses to overwrite a live fixture manifest, and removes only its own
account and referenced images when closed or after 15 minutes.

The controlled browser supplies clearly marked **local examples**, not live AI.
Chef and sommelier answers are examples; their provider-backed history and
answer quality are not assessed by this session. The scan result deliberately
says `DEMO ZEHN MORGEN` and preserves unknown country/type/taste fields. It is a
synthetic review exercise, not evidence of label-recognition accuracy.

Only the previously approved `54456874_400.webp` may be used for this exercise.
The operator checks its pinned SHA-256 before preparing an account. Analysis checks
the exact image bytes. Exposed multipart bytes are independently checked too.
Chromium can omit the file payload from its CDP request observer: only after a
verified example-image analysis, and only for a single empty WebP descriptor,
the demo reconstructs that upload from the pinned local original. It does not
forward an uninspected image or user-supplied file metadata. This is a demo-only
transport, not a change to the application's upload code or new evidence about
production image capture. The normal account token and backend RLS still apply.
Uploads must use the synthetic account's own flat WebP path; other images,
accounts, buckets and mutations are refused. Upload preflight is not upload authorization;
the actual POST still needs the normal account token and backend permissions.
No image or prompt reaches an external provider. Do not use personal photos,
real credentials, the owner's cellar, allergies or health information.

The browser blocks every unknown/provider AI route and external request, including
new tabs. A demo error must not be worked around by connecting a real account or
turning off the guard. Public access, private passkeys and production are unchanged.
The original image remains a local fixture, not a newly redistributed Git asset.

## Owner Runbook

1. Use three to five adults, one at a time, with the owner present. Explain that
   records and AI replies are examples and that no recording/analytics is added.
   Let the person decline; do not record names, email addresses or demographics.
2. Check the local app and run the manual `PilotDemoAccept` rehearsal before a
   pilot session. A green rehearsal does not count as a participant or feedback.
3. Start `PilotDemo` for one participant. It opens the actual app already signed
   into a new synthetic account. Keep the owner's normal browser/profile separate.
4. Provide only the approved image, located at
   `%USERPROFILE%\OneDrive\Desktop\Winesnap\54456874_400.webp`.
   The participant can select it in the ordinary image file chooser. This does
   not test a physical phone camera or justify using a different photograph.
5. Read the five task cards below without pointing out buttons. Let the person
   think aloud. If help is necessary, record that help rather than calling the
   task independently completed. Stop for an access/data-loss issue.
6. Close the controlled browser before the next person. Confirm the wrapper's
   cleanup result before starting another session. `PilotDemoCleanup` is the
   recovery action after interruption; never delete accounts by name or prefix.
7. Record only actual observations locally outside Git. This tracked document
   remains the blank method/template, not a participant database. Commit fixes
   and anonymized technical summaries, not individual raw notes or screenshots.

```powershell
./scripts/run-owned-windows.ps1 -Action PilotDemoAccept
./scripts/run-owned-windows.ps1 -Action PilotDemo
```

`PilotDemoAccept` runs headlessly through the same browser request policy and
real owned fixture writes, then closes and cleans up. It never becomes a human
pilot or a paid AI run. It uses the same independent demo manifest as the viewer,
so it cannot replace an active session; operator actions remain serialized.

## Participant Task Cards

### 1. Flaska Till Källare

Lägg till den givna exempelflaskan i vinkällaren. Granska uppgifterna innan du
sparar. Öppna det sparade vinet igen och kontrollera bilden.

Observe: discovery of scan/image choice, understanding of review versus save,
recognition of example/unknown data, save confirmation and the correct image.

### 2. Receptidé Till Kokbok

Ta fram ett exempelrecept med blomkål och vita bönor. Granska förslaget, spara
det i kokboken och öppna det igen.

Observe: Chef versus sommelier, draft versus saved recipe, review/editability,
save confirmation and rediscovery. Do not grade the mocked suggestion's AI quality.

### 3. Fortsätta Matlagningen

Hitta den pågående matlagningen. Starta en timer, välj ett vin till maten och
gå tillbaka. Uppdatera sidan och kontrollera att matlagningen finns kvar.

Observe: timer visibility, context/servings preservation, return navigation and
reload recovery. This is not real cooking or background mobile-timer certification.

### 4. Mat Och Vin Åt Båda Hållen

Välj ett vin ur exempelkällaren till en rätt. Utgå sedan från vinet och hitta
tillbaka till ett recept. Ställ också en fråga till sommelieren.

Observe: food/wine navigation, explanations and unknowns rather than percentages,
and whether the example answer is understood as an example. No new history is
persisted by the local AI mock; history quality is outside this rehearsal.

### 5. Rätta Och Glömma

Lägg till ”gillar citron” i matminnet. Ändra det till ”undviker citron”, glöm
uppgiften och logga sedan ut.

Observe: difference between correction and deletion, confirmation, visible outcome
and absence of the private cooking state after sign-out. Use only this invented
preference, not a participant's health or personal dietary profile.

## Blank Observation Sheet

All cells start **not observed**. An automation may not fill these from browser
assertions or infer satisfaction from a lack of reported errors.

| Anonymous slot | Scan         | Recipe       | Cook         | Pairing      | Memory       | Human session |
| -------------- | ------------ | ------------ | ------------ | ------------ | ------------ | ------------- |
| P1             | Not observed | Not observed | Not observed | Not observed | Not observed | Not started   |
| P2             | Not observed | Not observed | Not observed | Not observed | Not observed | Not started   |
| P3             | Not observed | Not observed | Not observed | Not observed | Not observed | Not started   |
| P4             | Not observed | Not observed | Not observed | Not observed | Not observed | Not started   |
| P5             | Not observed | Not observed | Not observed | Not observed | Not observed | Not started   |

For each actual task, distinguish independent completion, completion with help,
blocked, voluntarily abandoned and not attempted. Note the obstacle category
(navigation, readability, wording, control visibility, state feedback or access)
and the smallest reproducible technical fact. Do not collect personal context.

Prioritize access/data loss first, blocking workflows second, cosmetics third.
Reproduce the issue with a synthetic fixture before a scoped fix; rerun the
affected browser/unit checks. Do not merge/release or reopen deferred off-device
recovery because the pilot is prepared.

## Preparation Receipt

The first automated demo runs exposed a limitation of the Chromium request
observer: multipart headers described one WebP file, but its observed payload
was zero bytes. The guard refused that upload; those runs were failures, not
passes. Exact fixture cleanup completed. No provider request was retried.

The bounded reconstruction path described above was then tested explicitly.
Fixture cleanup also inventories only the verified synthetic owner's flat image
folder (at most 100 objects), covering uploads left before a wine row exists.
It refuses folders, traversal and oversized inventories, and confirms the folder
is empty before removing the exact Auth fixture. A foreign database image path
is still rejected before any Storage operation.

At 06:56 UTC on November 9, `PilotDemoAccept` passed all five journeys against
the installed owned app: image review/save with SHA-256 equality of all 39,438
original bytes, recipe review/save/reload, timer/reload/wine return, attributed
sommelier example and memory correction/forgetting/logout cache erasure.
Account/image cleanup passed; provider and human-session counts were zero.

No frontend image, migration, gate, tunnel, password or production change is
needed for this operator preparation. The installed candidate remains `2d98270`.
The pending personal-mobile authentication check remains separate.

All 1,328 unit tests across 131 isolated files passed locally with two workers;
the changed JavaScript lint and PowerShell parsing passed. Automated operator
reports do not count human participants; actual human observations remain the
separate, still-blank process above.
