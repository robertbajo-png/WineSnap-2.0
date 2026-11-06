# Core States And Explicit Recovery

Stage 4 of the guided pilot plan. Scope is the repository and the separately
owned Windows app only. The old production, hosted test, provider defaults and
private internet gate are unchanged.

## Implemented

- Shared accessible loading, offline, pending and error notices with explicit
  recovery actions. Read errors are not presented as empty collections.
- Scan analysis keeps a failed image for manual retry; reconnecting does not
  repeat a paid request. The camera layout is unchanged.
- Wine saving retains one owner-bound ID and successful upload. A missing save
  response triggers a read reconciliation, not another insertion. An uncertain
  outcome locks editing/discard until an explicit save check resolves it. No
  possibly referenced image is deleted after a transport error.
- Scan review and selected input are held in memory, not promised as durable
  offline drafts. Closing/reloading the page can discard unsaved review data.
- Chef keeps failed prompts and requires review or discard of a generated draft
  before another generation. History retrieval has a separate error state and
  cannot erase a successful response or repeat the AI request.
- Recipe editors retain drafts on save failure and reuse their version ID on
  explicit retry. Cook Mode distinguishes local state, pending synchronization,
  verified synchronization and errors, preserving existing conflict choices.
- Food Memory hides unavailable/stale records while offline or after a failed
  read. Mutation controls return only after a successful fresh read; reconnecting
  never repeats a mutation or AI extraction.
- Kitchen, Chef-memory and meal writes use a captured, verified account token
  and the approved owned-origin API mapping, not mutable global auth state.

## Verification In Progress

Focused tests cover save reconciliation, account-bound clients and writes,
structured provider failures, and accessible scan/notice rendering. The first
local Vitest run passed seven files (35 assertions) but one worker failed to
start; that is not a complete pass. Full CI and owned browser acceptance remain
required before marking the stage complete.

The disposable pilot browser suite now includes synthetic failures for memory
reads, Chef quota/history, recipe save, image analysis and lost wine-save replies.
It uses actual fixture-owned database writes but mocked AI replies, never paid
provider calls. Its screenshots and reports contain synthetic fixture data only.

Installation, rollback, recovery and acceptance receipts will be recorded here
after they are actually verified. Passing these checks does not approve public
release, physical-device camera/timers or deferred off-device recovery.
