# Change: pi-subagent-task-attention-handoff

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

## Exploration

All paths are relative to `pi-packages/pi-subagents/`.

- Task-mode `subagent_run`/`subagent_continue` block the root tool call until the
  child is terminal (`src/manager.ts` `run()`/`continueTask()`/`wait()`), racing a
  foreground handoff promise in `src/tools/subagent-run.ts` and
  `src/tools/subagent-continue.ts`.
- The timeout warning fires without a mode gate (`src/manager.ts` deadline
  warning, ~1324–1369). Checkpoint steering uses `sendMessage`, which rejects
  foreground targets as `not_background`; the attention notification goes to the
  outbox (`src/extension/subagents-extension.ts`), held while the root run is
  active and flushed on `agent_settled`, then dropped as stale if the task is no
  longer running. In task mode the root cannot settle until the child is terminal,
  so attention is never usable and `subagent_extend` cannot be called in time.
- Existing handoff infrastructure (`src/tools/background-handoff-state.ts`):
  shortcut (Ctrl+H) and child-question handoff call `manager.sendToBackground()`
  (changes `mode` and `effective_mode`), resolve the blocking tool call with
  background launch text, task IDs and `terminate: true`; question handoff
  converts every matching same-parent-session call and waits for their
  returned-tool barriers. Converted tasks receive background terminal
  notifications with timeout partial context.
- Observed in a live test: a task-mode explorer timed out at 90000 ms with only a
  plain error text while the background run received attention, extension, two
  checkpoints and `total_timeout` partial context.

## Intent

When a task-mode child reaches its timeout warning lead, hand off every blocking
task-mode call of the same parent session to background through the existing
handoff mechanism, then send checkpoint steering and the attention notification,
so the root settles, receives `subagent-attention`, and can call
`subagent_extend` exactly as for background runs.

## Non-goals

- Changing task-mode failure text formatting for non-attention timeouts.
- Changing background-mode attention, extension limits, outbox semantics, or the
  shortcut/question handoff behavior.
- Converting tasks owned by other parent sessions.
- Host Pi changes.

## Acceptance

- AC-1: When a task-mode child's warning lead is reached, every blocking task-mode `subagent_run`/`subagent_continue` call of the same parent session returns early with the existing background-handoff result (task IDs, `terminate: true`), and those tasks become background (`mode` and `effective_mode`).
- AC-2: For the task that triggered attention, conversion happens before checkpoint steering and attention delivery: steering is accepted (no `not_background` rejection), exactly one attention notification is delivered after root settlement, and `subagent_extend` on the converted task extends its deadline within configured bounds.
- AC-4: An attention-triggered handoff does not wait for a sibling continuation's prior runner cleanup: an unpublished continuation's blocking tool call is released immediately as a latched background handoff (it publishes and runs in background once cleanup completes), so root settlement and attention delivery happen within the warning lead even when that cleanup outlasts the warned task's deadline; shortcut and child-question handoff keep their current cleanup-waiting semantics.
- AC-3: Background-mode attention behavior is unchanged; with warning disabled (`timeout_warning_ms` 0 or ≥ `timeout_ms`) no attention handoff occurs; a converted task that later hits total timeout produces the background terminal notification with `total_timeout` partial context.

## Clarifications

- Sibling handling: the user chose to convert all task-mode calls of the same parent session, matching the existing child-question handoff semantics.

## Decisions

- Reuse the existing question-triggered same-session handoff path rather than a new detach mechanism.
- Order for the triggering task: hand off, then checkpoint steering, then enqueue attention.
- No new configuration flag; the behavior follows `timeout_warning_ms`.
- Plan review round 1 (REJECT): a cleanup-waiting sibling continuation could hold the shared return barrier past the warning window. Resolution: a timeout-specific latched handoff mode releases unpublished continuations without awaiting prior cleanup; native cleanup ownership and existing question/shortcut semantics stay unchanged.
- Final verification round 1 (FAIL): a published same-session foreground sibling already `stopping` (cancelled, slow runner cleanup) was skipped by `sendToBackground` but kept its tool-return promise in the shared barrier, so attention went stale. Resolution: the timeout-specific handoff also releases such stopping calls immediately (latched background intent so their terminal result arrives as a background notification) without transferring runner cleanup ownership; add a cancellation/slow-cleanup regression proving tool release and attention delivery before the warned deadline.
- Verification seam: tests exercise the extension-wired path (warning → handoff → tool return → `agent_settled` → attention delivered), stale attempt/generation after asynchronous handoff, and best-effort steering failure, not only a manager spy.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Pi subagent timeout attention and extension** — The Pi subagent runtime MUST warn the owning root before a running child reaches its total execution deadline with progress context, MUST first hand off every blocking task-mode call of the same parent session to background when the warned child runs in task mode, MUST ask the child to checkpoint, MUST let the root extend the deadline only through `subagent_extend` within a configurable hard total ceiling and extension count, and MUST include available partial progress context in the terminal result of a total timeout.
  - GIVEN a running Pi child in task or background mode approaching its deadline; WHEN the warning lead is reached; THEN task-mode calls of that parent session return as background handoffs, the root receives one attention notification with progress context and may call `subagent_extend`, bounded by `max_total_timeout_ms` and `max_timeout_extensions`, otherwise the ceiling applies and the timeout result carries the latest checkpoint and preview .

## Plan

In the manager's deadline-warning path, detect a foreground (task-mode) task and
invoke the same-parent-session handoff used for child questions (via the
handoff state / a manager-level hook the extension wires), awaiting conversion
before checkpoint steering and attention enqueue. Keep background behavior on the
existing path. Test-first in `test/timeout-attention.test.ts` and the tool tests
(`test/tools/subagent-run.test.ts`, `test/tools/subagent-continue.test.ts`) using
existing fake timers/handoff fixtures, including the cleanup-waiting continuation fixture held beyond the warned task's deadline (AC-4) and an extension-wired outbox test. Update the subagents-configuration skill
note on attention and the canonical spec delta at archive.

## Tasks

- [x] AC-1: Attention-triggered same-session handoff of task-mode calls
  - Outcome: warning lead on a task-mode child returns all same-session blocking task-mode run/continue calls as background handoffs
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts, src/tools/background-handoff-state.ts, src/tools/subagent-run.ts, src/tools/subagent-continue.ts, src/extension/subagents-extension.ts; skills tdd, simplify
  - Inputs: Exploration section evidence
  - Dependencies: none
  - Output: implementation plus failing-then-passing tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md
  - Interface boundaries: existing shortcut/question handoff results and barriers; outbox semantics; subagent_extend contract
  - Focused check and PASS evidence: focused vitest for timeout-attention, subagent-run, subagent-continue, notification-outbox, manager pass; package typecheck and repo check:ci pass
  - Return milestone: tests and checks green with diff summary
  - Stop / reassessment: handoff cannot be triggered from manager without changing shared handoff contracts beyond this scope
- [x] AC-2: Ordered steering and attention delivery after conversion
  - Outcome: triggering task is converted before steering and attention; extend works on it
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/manager.ts, test/timeout-attention.test.ts
  - Inputs: AC-1 implementation
  - Dependencies: AC-1 unit
  - Output: tests proving steering accepted, one attention delivered after settle, extend applied
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**
  - Interface boundaries: notification outbox staleness checks
  - Focused check and PASS evidence: new timeout-attention tests pass
  - Return milestone: same as AC-1 (single worker assignment)
  - Stop / reassessment: attention dropped as stale after conversion for reasons outside this change
- [x] AC-4: Timeout handoff does not wait for sibling continuation cleanup
  - Outcome: attention-triggered handoff releases unpublished continuation calls immediately; they publish and run in background after cleanup
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools/background-handoff-state.ts, src/tools/subagent-continue.ts, src/manager.ts, test/tools/subagent-continue.test.ts
  - Inputs: AC-1 implementation; plan review round 1 finding
  - Dependencies: AC-1 unit
  - Output: latched timeout handoff mode plus fake-timer test with cleanup held beyond the warned deadline, and extension-wired settle/attention test
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/**, pi-packages/pi-subagents/test/**
  - Interface boundaries: question/shortcut handoff barriers unchanged; runner cleanup ownership unchanged
  - Focused check and PASS evidence: new continuation and outbox tests pass; existing question-handoff cleanup fixture still passes
  - Return milestone: same as AC-1
  - Stop / reassessment: releasing an unpublished continuation requires changing cleanup ownership
- [x] AC-3: Regression coverage for background and disabled warning
  - Outcome: background attention unchanged, no handoff when warning disabled, converted total timeout carries partial context
  - Known entrypoints and skill paths: pi-packages/pi-subagents/test/timeout-attention.test.ts
  - Inputs: AC-1 and AC-2 implementation
  - Dependencies: AC-1, AC-2 units
  - Output: regression tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/test/**
  - Interface boundaries: none
  - Focused check and PASS evidence: existing and new timeout-attention tests pass
  - Return milestone: same as AC-1
  - Stop / reassessment: existing tests conflict with intended behavior

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Round 1 REJECT (sibling continuation cleanup barrier) repaired via AC-4; round 2 fresh Oracle OKAY, envelope validated.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 2810a09a9359c6c8543196d7cd0ffdd93d7e7eb7c2124a461dd299b3b527feca

Round 1 FAIL (published stopping sibling held the handoff barrier) converged; round 2 fresh Oracle PASS, envelope validated with --record-sha256.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-4 are satisfied. The stopping-sibling barrier defect is fixed without changing runner cleanup ownership or shortcut/question eligibility.",
  "evidence": [
    {
      "id": "record",
      "kind": "contract",
      "locator": ".thoth/changes/pi-subagent-task-attention-handoff/pi-subagent-task-attention-handoff.md",
      "claim": "Independent exact-byte prefix hash matches the supplied digest; validate.mjs --through verify passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "lifecycle",
      "kind": "source-review",
      "locator": "pi-packages/pi-subagents/src/{manager.ts,extension/subagents-extension.ts,tools/background-handoff-state.ts,tools/subagent-continue.ts}",
      "claim": "Attention awaits same-session handoff before best-effort steering and attention enqueue. Only attention adds stopping eligibility. Unpublished continuation mode is latched independently of listener teardown; runner settlement ownership remains unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "tests",
      "kind": "execution",
      "locator": "pi-packages/pi-subagents: requested five-file vitest run",
      "claim": "All 162 tests pass, covering running and unpublished siblings, slow stopping cleanup, exactly-once delayed background completion, foreign isolation, converted extension and timeout partial context, stale guards, steering failures, and disabled/background warnings.",
      "basis": "observed",
      "uncertainty": "Extension integration uses controlled runners and timers."
    },
    {
      "id": "state-matrix",
      "kind": "execution",
      "locator": "Read-only in-memory lifecycle assertions via node --import tsx",
      "claim": "All seven statuses were checked under default and attention handoffs. Queued, running, stopping and unpublished same-session entries release; foreign entries remain blocked. Question handoff does not release stopping entries. Returned entries leave zero task-update/question listeners, and later calls inherit no pending latch.",
      "basis": "observed",
      "uncertainty": "Supplementary assertions exercise the real handoff implementation with in-memory task entries."
    },
    {
      "id": "checks",
      "kind": "execution",
      "locator": "Package/root typechecks; root check:ci; git diff --check",
      "claim": "Every requested check exits 0. check:ci reports 749 warnings and 7 informational diagnostics, with no blocking errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "freshness",
      "kind": "integrity",
      "locator": "SHA-256 comparisons before checks and at review completion",
      "claim": "Reviewed implementation, test and documentation inputs, canonical spec baseline, and record prefix remain unchanged. Working-tree status matches the initial review.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record contract and digest",
      "method": "Exact-byte hashing and bundled verify validator",
      "outcome": "pass",
      "evidenceIds": ["record", "freshness"],
      "reason": "Digest matches; structural and canonical-baseline validation passes."
    },
    {
      "check": "AC-1: complete same-session release and isolation",
      "method": "Source tracing, focused tests and exhaustive status assertions",
      "outcome": "pass",
      "evidenceIds": ["lifecycle", "tests", "state-matrix"],
      "reason": "All non-terminal statuses are covered; handoffs return terminate:true and preserve foreign-session isolation."
    },
    {
      "check": "AC-2: ordering, attention and extension",
      "method": "Extension-wired tests and deadline-path review",
      "outcome": "pass",
      "evidenceIds": ["lifecycle", "tests"],
      "reason": "Conversion precedes steering and attention; delivery is settlement-gated and nonduplicating; converted-task extension succeeds within existing bounds."
    },
    {
      "check": "AC-4: cleanup-independent release and lifecycle preservation",
      "method": "Slow-cleanup regressions, source review and teardown assertions",
      "outcome": "pass",
      "evidenceIds": ["lifecycle", "tests", "state-matrix"],
      "reason": "Unpublished and stopping siblings release before cleanup completes. Background intent persists, stopping completion is notified exactly once, and shortcut/question semantics and cleanup ownership remain intact."
    },
    {
      "check": "AC-3 and stale/transport regressions",
      "method": "Focused Vitest execution",
      "outcome": "pass",
      "evidenceIds": ["tests"],
      "reason": "Background and disabled-warning behavior, converted timeout partial context, stale guards and steering-failure tolerance pass."
    },
    {
      "check": "Requested static checks and final freshness",
      "method": "Both typechecks, check:ci, diff whitespace check and hash comparisons",
      "outcome": "pass",
      "evidenceIds": ["checks", "freshness"],
      "reason": "All checks succeed against unchanged reviewed inputs."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record the accepted PASS evidence, then run closeout validation before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagent-task-attention-handoff/pi-subagent-task-attention-handoff.md",
    "reviewedRecordSha256": "2810a09a9359c6c8543196d7cd0ffdd93d7e7eb7c2124a461dd299b3b527feca"
  }
}
```

- AC-1: PASS | five-file vitest (162 passed) + state-matrix assertions | all same-session non-terminal task-mode calls release with terminate:true; foreign isolated
- AC-2: PASS | extension-wired outbox tests | convert→steer→attention, attention after settle, subagent_extend on converted task
- AC-3: PASS | timeout-attention regressions | background unchanged, disabled warning no handoff, converted total_timeout partial context
- AC-4: PASS | slow-cleanup continuation and stopping-sibling tests | release before cleanup, cleanup ownership unchanged, exactly-once background completion
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:55d33cb12d72fc56e7c93e181d43b6cf4f07706eb0168248ff4a4ec9b4841212

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
