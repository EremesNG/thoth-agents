# Change: antigravity-stall-hardening

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Incident: Pi children (`thoth-explorer`) on `antigravity/gemini-3-8-flash` intermittently fail with
`Subagent stalled for 240000ms without final response.` after the transcript shows
`success: agent settled` (reproduced twice: after 10 and after 72 turns, tail is `[agy tool: run_command]`
replays `wrap-120`/`wrap-121`).

Evidence from three read-only Explorer runs (paths relative to `pi-packages/`):

- `success: agent settled` is a pi-subagents rendering of the SDK `agent_settled` event, always with
  severity `success` and without inspecting the outcome (`pi-subagents/src/runner/snapshot-builder.ts:449-463`,
  `src/runner/event-processing.ts:137,158`). It does not prove completion.
- The parent completes only when `session.prompt()` resolves (`event-processing.ts:646-681`). The watchdog
  (`event-processing.ts:620-645`, default 240000 ms in `src/config.ts:33`) fires when no session event arrives
  for the budget, or when the oldest tracked tool has no update for the budget; it latches, aborts and throws
  the stall error after `prompt()` settles (`:677-698`), taking precedence over any available text.
- The SDK emits subscriber `agent_settled` and then awaits deferred settled actions
  (`@earendil-works/pi-coding-agent/dist/core/agent-session.js:671-689`); `prompt()`/`sendCustomMessage(triggerTurn)`
  during settlement queue another run (`:1482-1484,1767-1773`). Follow-up producers exist in pi-background-tasks
  (`src/shared-callback-batcher.ts:639-646,705-707`) and pi-subagents completion/question messages; no package
  registers settle handlers.
- `response sent to the orchestrator` is rendered whenever a nonblank stored result exists, regardless of failed
  status (`pi-subagents/src/render/completion-message.ts:87-105,158-170,200-206`).
- Antigravity bridge gaps:
  1. `void runTurnDriver(...)` has no rejection handler (`pi-antigravity-bridge/src/provider.ts:1516-1545`); awaits of
     `handle.next()`/`handle.outcome` and later persistence sit outside the startup `try/catch` (`:1378-1410`), so a
     rejection leaves the Pi stream unended.
  2. Settlement during a replay continuation clears `#active` (`src/driver.ts:645-654`), `roundTrips.failAll`
     (`extensions/index.ts:465-478`) deletes the outstanding `rt` marker without a tombstone (`provider.ts:767-773`), and
     continuation requires a currently outstanding marker (`provider.ts:1214-1215`). The next call is treated as a fresh
     prompt and the buffered final response/outcome of the settled turn is lost.
  3. Silent waits: fresh calls await `beforeStart`, the serialized `driver.run` queue (`driver.ts:236-248`), exclusive
     startup/termination/recycling (`driver.ts:262-267`) and shared lazy `startFlight` (`extensions/index.ts:222-235`)
     before `ensureStarted` (`provider.ts:1353-1382`), emitting no stream events. Bridge idle is 5 min
     (`src/config.ts:193`) > parent stall 4 min, and unrecognized stdout chunks refresh bridge idle (`driver.ts:487`)
     without producing Pi activity.
- Exact trigger of the two incidents is not established from source; no incident traces are available.
- Tests: no coverage for driver settlement → marker deletion → continuation, unhandled driver-task rejection, or
  settled followed by an never-resolving prompt. Related: `tests/stream-roundtrip.test.ts`, `tests/provider-late-result.test.ts`,
  `tests/provider-escalation.test.ts`, `pi-subagents/test/runner/thread-snapshots.test.ts`,
  `test/runner/structured-errors.test.ts`, `test/render/completion-message.test.ts`.

## Intent

An Antigravity-backed Pi turn always reaches a terminal stream event (stop, toolUse or explicit error) within a
bounded time and never silently loses the final response of an agy turn that settled during a replay; when a
pi-subagents child still stalls, the failure explains what was outstanding and the UI no longer presents an
never-resolving run as a success.

## Non-goals

- Changing the SDK, pi-background-tasks callback delivery, or the deferred-settled-action semantics.
- Changing the default pi-subagents stall budget or total task timeout.
- Synthetic heartbeat content (fake text/thinking deltas) in model-visible messages.
- Retrying or resuming failed children automatically; model selection changes.
- Package version bumps.

## Acceptance

- AC-1: Every Antigravity provider stream ends: any rejection/throw in the turn driver task (startup, `handle.next()`, `handle.outcome`, activity consumption, persistence) emits one terminal `error` event with a descriptive message, ends the stream exactly once, and releases the driver queue/handle so the next call is not blocked.
- AC-2: When agy settles while a replay/tool round trip of that turn is outstanding — whether settlement happens before or after the provider creates the replay marker from an already-buffered `tool_done` — the original handle/turn identity and its settled outcome (final `outcome.response`, unread buffered activities, or error) are retained as a bounded tombstone; the following provider call carrying the matching tool result drains it as the continuation (emitting the remaining activities/final response and `done(stop)` or the error) instead of starting a fresh agy prompt. Tombstones are cleared on session shutdown and expire after a bounded time.
- AC-3: Bridge-internal waits never stay silent without limit: startup-type waits (beforeStart, exclusive startup/termination/recycling, lazy startup flight) have absolute deadlines; the serialized run-queue wait has a requester-side deadline whose expiry fails only the waiting request, never terminates or disturbs the healthy predecessor turn or park semantics, and is fenced so the expired request can never launch later; activity waits use progress-aware inactivity refreshed by every recognized agy frame (including `checkpoint`), not an absolute bound. Each expiry fails the stream with an explicit error naming the wait. Default bridge inactivity is below 240000 ms, unrecognized stdout does not refresh it, and configured caps that are disabled remain disabled (no new total-turn deadline).
- AC-4: The pi-subagents stall error includes diagnostics — ms since last session event, last event type, active tracked tools (name and ms since update), whether `agent_settled` was observed after the last `agent_start`, and outstanding orchestrator question count — in its structured error details and in a bounded, sanitized message that survives the stall formatter, appearing in both the thrown error `.message` and the persisted `task.error`.
- AC-5: `agent_settled` renders with neutral (non-success) severity and wording that does not imply completion, and the `response sent to the orchestrator` heading is shown only for completed tasks; non-completed tasks with stored text use a partial-response heading.

## Clarifications

- 2026-10-05 user chose to close the root cause before planning; root-cause exploration completed and the exact
  incident trigger remains unproven from source (no traces). Fixes are therefore defensive across all supported paths.
- 2026-10-05 user selected scope: bridge stream-termination guard, replay race, no silent waits, and pi-subagents
  diagnostics plus labels (AC-1..AC-5).
- 2026-10-05 plan review (EXPLICIT_REVIEW): fresh Oracle round 1 REJECT (replay ordering, wait ownership, stall formatter) repaired; fresh Oracle round 2 [OKAY]. Cautions: preserve parked turns when finalizing; capture diagnostics before abort cleanup; checkpoint-only progress yields no Pi activity and can still trip the parent watchdog.

## Decisions

- D1: Termination guard is a single idempotent finalize in `runTurnDriver` (outer catch + finally) rather than per-await
  try/catch, so new awaits are covered automatically.
- D2: Replay race retains the original handle (settlement clears `#active` before `onTurnEnd`, `driver.ts:644-671`, so
  unread activities are reachable only through the retained handle, `:98-110`; final text from `outcome.response`,
  `:591-602`). Tombstones are keyed by turn identity so they cover a marker deleted by `failAll` and a marker created
  after settlement (`provider.ts:1154-1168`). Matching continuation drains it. TTL default 10 minutes; unmatched
  tombstones never block fresh prompts.
- D3: Bounded waits fail explicitly instead of emitting synthetic model-visible heartbeats (Non-goal). Default deadline for
  startup-type waits and the requester-side queue wait: 120000 ms; activity waits are inactivity-based, not absolute.
  Default bridge inactivity lowered from 300000 ms to 180000 ms (below the 240000 ms parent default). All remain
  configurable and respect existing disable semantics (`config.ts:159-176`); the bridge cannot read the parent budget,
  so the documented requirement is parent stall > bridge inactivity.
- D4: Long legitimate agy work that emits recognized frames (including `checkpoint`, which yields no provider activity,
  `driver.ts:580`) keeps refreshing inactivity; unrecognized stdout noise no longer does.
- D6: A queued request that hits its deadline is fenced (cancel token checked before launch at `driver.ts:262-270`) and
  removed without terminating the predecessor or advancing serialization incorrectly.
- D5: pi-subagents diagnostics are added to the existing structured stall error (`category: stall_timeout`) without
  changing its category, phase or retryability.

## Durable deltas

- `ADDED pi-ecosystem` **Antigravity bridge terminal stream guarantee** — Every Antigravity bridge provider stream MUST end with exactly one terminal event (stop, toolUse or error), MUST fail with an explicit error instead of waiting silently beyond its configured startup, queue and inactivity bounds (disabled caps stay disabled), and MUST deliver the final outcome of an agy turn that settled while a replay round trip was outstanding to the matching continuation call.
  - GIVEN an Antigravity-backed Pi turn; WHEN the driver task throws, an internal wait exceeds its bound, or agy settles during a outstanding replay; THEN the stream ends once with an explicit error or the retained final response, and the next call is not blocked .
- `ADDED pi-ecosystem` **Subagent stall diagnostics** — A pi-subagents stall failure MUST report time since the last session event, the last event type, active tracked tools with their idle time, whether the agent settled after its last start, and outstanding orchestrator questions; the agent-settled status MUST NOT be presented as success and the orchestrator-response heading MUST be shown only for completed tasks.
  - GIVEN a child whose prompt does not resolve after it emitted agent_settled; WHEN the stall watchdog fires; THEN the structured error contains those diagnostics, the settled status is shown neutrally, and the result heading marks any text as partial .

## Plan

Two independent mutable surfaces, one writer each; the two workers can run in parallel.

1. **Bridge (`pi-packages/pi-antigravity-bridge/`)** — one Worker, sequential units AC-1 → AC-2 → AC-3 (shared files
   `src/provider.ts`, `src/driver.ts`, `extensions/index.ts`, `src/config.ts`).
   - AC-1: wrap the `runTurnDriver` body with outer catch/finally calling an idempotent `finalize(error)` that emits
     `error` (stopReason `error`, message) once, ends the stream and settles/releases the handle and queue tail.
   - AC-2: retain the settled handle and turn identity per D2; tombstone both markers deleted by settlement `failAll`
     and markers created after settlement for that turn; continuation detection (`provider.ts` ~1214) also accepts a
     tombstone match and drains it from the retained handle (remaining activities + final response + `done(stop)`, or
     `error`) without calling `driver.run`. Clear on session shutdown; TTL per D2.
   - AC-3: absolute deadlines for startup-type waits; requester-side fenced deadline for the run queue (D6);
     progress-aware inactivity for activity waits refreshed by every recognized frame including `checkpoint` (D4);
     on expiry fail via AC-1 finalize with the wait name. Lower default inactivity per D3 and keep disable semantics.
     Document bounds in the package README/config docs.
   - Tests (test-first, vitest in `pi-antigravity-bridge/tests/`): rejection in `handle.next()`/`outcome` ends stream with
     error and next call proceeds; settlement before and after replay-marker creation both drain the final response on
     continuation; tombstone expiry and shutdown clear; startup deadline yields error; queued request expiry fails only
     the requester, predecessor keeps running and the expired request never launches later; long work emitting only
     recognized `checkpoint` frames is not killed; unrecognized stdout does not refresh idle; disabled caps stay disabled.
2. **pi-subagents (`pi-packages/pi-subagents/`)** — one Worker, AC-4 and AC-5.
   - AC-4: track last event type/time and settled-after-start in `src/runner/event-processing.ts`; add diagnostics to the
     stall structured error details and make `src/error-metadata.ts` (stall formatter ~165-168, 266-270, used by
     `SubagentStructuredError` ~474-478 and `manager.ts:1519-1527`) preserve a bounded, sanitized diagnostic suffix.
     Test thrown `.message` and persisted `task.error`; category/phase/retryability unchanged (D5).
   - AC-5: `src/runner/snapshot-builder.ts` settled severity neutral, wording e.g. `agent settled (awaiting result)`;
     `src/render/completion-message.ts` heading gated on completed status, partial heading otherwise. Update affected
     snapshot/render tests.

Verification seams: per-package typecheck and offline tests (the Windows CI job runs these), plus root
`pnpm run check:ci` and `pnpm run typecheck`; docs under `docs/agent/` updated only if they describe the changed
defaults. Final independent Oracle verification against this record and the diff.

## Tasks

- [x] AC-1: Bridge provider stream always terminates on driver-task failure
  - Outcome: rejections anywhere in the turn driver task end the stream once with an explicit error and release the queue
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts (runTurnDriver ~1353-1545, finalize ~1488-1629), src/driver.ts (handle/queue ~98-118, 236-267, 644-655); skills: C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration section of this record
  - Dependencies: none
  - Output: code + vitest tests in pi-packages/pi-antigravity-bridge/tests/
  - Owner: thoth-worker (bridge)
  - Writes: pi-packages/pi-antigravity-bridge/src/**, pi-packages/pi-antigravity-bridge/tests/**
  - Interface boundaries: Pi provider stream event contract; driver public API used by extensions/index.ts
  - Focused check and PASS evidence: new failing-then-passing tests for rejection in handle.next()/outcome; bridge package typecheck and tests pass
  - Return milestone: after AC-1 tests pass, continue to AC-2 in the same assignment
  - Stop / reassessment: if the stream contract lacks an error terminal event or the fix requires SDK changes
- [x] AC-2: Bridge retains settled outcome across outstanding replay continuation
  - Outcome: agy settling during a outstanding replay no longer loses the final response; continuation drains a bounded tombstone
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts (~767-773, 1152-1171, 1214-1280), extensions/index.ts (~465-478, 574-590), src/driver.ts (~582-605, 645-654)
  - Inputs: Exploration section; accepted AC-1 finalize
  - Dependencies: AC-1 (same files, same writer)
  - Output: code + tests (settlement before and after replay-marker creation both drain on continuation, expiry, shutdown clear)
  - Owner: thoth-worker (bridge)
  - Writes: pi-packages/pi-antigravity-bridge/src/**, extensions/**, tests/**
  - Interface boundaries: replay tool `antigravity({tool,key})` display contract unchanged
  - Focused check and PASS evidence: new tests pass; existing stream-roundtrip, provider-late-result, provider-escalation tests pass
  - Return milestone: after AC-2 tests pass, continue to AC-3
  - Stop / reassessment: if buffered final content is not recoverable from the settled handle without driver API changes beyond the bridge
- [x] AC-3: Bridge internal waits are bounded and inactivity default is below the parent stall
  - Outcome: startup deadlines, fenced requester-side queue deadline, progress-aware activity inactivity; default inactivity 180000 ms; only recognized frames refresh idle; disabled caps stay disabled
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/provider.ts (~1353-1410), src/driver.ts (~108-118, 236-267, 487), extensions/index.ts (~222-235), src/config.ts (~193), package README
  - Inputs: Decisions D3, D4, D6; accepted AC-1 finalize
  - Dependencies: AC-1, AC-2 (same files, same writer)
  - Output: code, config default, docs, tests
  - Owner: thoth-worker (bridge)
  - Writes: pi-packages/pi-antigravity-bridge/**
  - Interface boundaries: bridge config schema (new optional bound key, documented)
  - Focused check and PASS evidence: tests for startup deadline error, queued-request expiry (requester fails, predecessor unaffected, no late launch), long checkpoint-only work not killed, idle not refreshed by unrecognized stdout, disabled caps; bridge typecheck + tests pass
  - Return milestone: final return of the bridge assignment with AC-1..AC-3 evidence
  - Stop / reassessment: if a wait cannot be bounded without risking killing legitimate agy work that emits recognized frames
- [x] AC-4: pi-subagents stall error carries outstanding-state diagnostics
  - Outcome: structured stall error details and message include the AC-4 fields
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/event-processing.ts (~404-461, 610-698), src/error-metadata.ts (~165-168, 266-270, 474-478), src/manager.ts (~1519-1527, failure path ~2061-2063), test/runner/structured-errors.test.ts, test/runner/thread-snapshots.test.ts; skills: tdd, simplify (paths above)
  - Inputs: Exploration section
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker (subagents)
  - Writes: pi-packages/pi-subagents/src/runner/**, pi-packages/pi-subagents/src/error-metadata.ts, pi-packages/pi-subagents/test/**
  - Interface boundaries: structured error category/phase/retryable unchanged (D5); manager failure handling reads the formatter output
  - Focused check and PASS evidence: test simulating settled-then-never-resolving prompt asserts diagnostics in thrown `.message`, structured details and persisted `task.error`; pi-subagents typecheck + tests pass
  - Return milestone: after AC-4 tests pass, continue to AC-5
  - Stop / reassessment: if diagnostics require SDK-internal state
- [x] AC-5: Settled status and response heading no longer imply success
  - Outcome: neutral settled rendering; completed-only response heading, partial heading otherwise
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/snapshot-builder.ts (~449-463), src/runner/event-processing.ts (~137,158), src/render/completion-message.ts (~87-105,158-170,200-206), test/render/completion-message.test.ts
  - Inputs: Exploration section
  - Dependencies: AC-4 (same writer)
  - Output: code + updated tests
  - Owner: thoth-worker (subagents)
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**
  - Interface boundaries: completion message delivery options unchanged
  - Focused check and PASS evidence: render/snapshot tests pass; pi-subagents typecheck + tests pass
  - Return milestone: final return of the subagents assignment with AC-4..AC-5 evidence
  - Stop / reassessment: if other consumers depend on the `success` severity of settled status

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 6b8089295fdccbb3448cc4def44a6073ad3593bd71b03c125c9ecc78c1bb252d

- AC-1: PASS | independent startup/runtime fault injection on both engines (39 probes incl. rounds 1-4 reproductions) + tests/startup-ownership, lifecycle-sink, exit-cleanup-sink, provider-hardening | one terminal error and one stream end; ownership released; successors complete; rejected native/UI/ACP sinks contained
- AC-2: PASS | replay regression tests (provider-hardening) and source review | settlement before/after marker creation retains buffered activities/outcome; error, TTL expiry and shutdown clear tombstones
- AC-3: PASS | deadline, queue, inactivity and disabled-cap tests (driver-lifecycle, driver, extension-lifecycle, config) | named expiries, fenced requesters, predecessor/park preserved, checkpoint progress, 180000 ms default, README 3m
- AC-4: PASS | structured-errors, error-metadata, orchestrator-inactivity, manager tests | sanitized pre-abort diagnostics in thrown .message, details and persisted/reopened task.error; category/phase/retryable unchanged
- AC-5: PASS | thread-snapshots and completion-message tests | settled status info/neutral; non-completed text uses partial-response heading
- Checks: both package typechecks, root typecheck, root check:ci (warnings only), git diff --check PASS; bridge suite 722 passed/9 skipped and pi-subagents 1066 passed/1 skipped at --maxWorkers 2; high-concurrency runs showed timing failures in unchanged tests (acp-driver.test.ts:431 400 ms sleep, diff-render, sessions, background-tasks-real-sdk) that pass isolated
- Risk: checkpoint-only agy progress emits no Pi activity and can still trip the parent watchdog (documented)
- Plan review provenance: EXPLICIT_REVIEW (round 1 REJECT repaired, round 2 OKAY)
- Reviewer detail: fresh read-only thoth-oracle round 5 (subtask_thoth-oracle_1791183349402_801da81e); implementation authorized by explicit user choice 2026-10-05; record prefix re-confirmed by a fresh Oracle after task checkboxes and authorization line were finalized
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:c98e54c855994178079ad6b4c0a37f4f886e2cb8e147bc7955dbb4426020a06c

## Closeout

**Archive**: READY
