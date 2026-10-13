# Change: subagent-timeout-attention

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

Pi subagent runtime (`pi-packages/pi-subagents/`) enforces a single total
execution ceiling: `src/config.ts:33` `DEFAULT_TIMEOUT_MS = 20 min`, overridable
only through `timeout_ms` in global/project `subagents.json` (no per-agent
field). `src/manager.ts:1946–1984` arms `setTimeout(config.timeout_ms)` that
marks `failed / total_timeout / retryable:false`, transitions to `stopping` and
calls `controller.abort()` → `session.abort()` (`src/runner/sdk-runner.ts:604–617`).
`subagent_result` returns `task.result ?? task.error ?? task.output_preview`
(`src/tools/subagent-result.ts:26–35`), so a timeout hides the partial preview
behind the error; `subagent-completion` (`src/render/completion-message.ts:93–160`)
carries only status/result/error metadata. Transcript, progress updates (last
five, `src/manager.ts:936–955`) and the nested session path are persisted.
Existing primitives: `subagent_send_message` (live steering, `manager.ts:1194`),
`subagent_continue` (resume persisted session after timeout, opt-in via
`enable_continue`, `manager.ts:1437–1544`), `ask_orchestrator`/`subagent_reply`,
and follow-up notification delivery held while the parent is busy
(`src/extension/subagents-extension.ts:90–125`). No pre-timeout warning or live
deadline extension exists. A separate inactivity `stall_timeout_ms` (4 min) is
out of scope. OpenCode/Codex/Claude delegate to native harness tools with no
repository-owned execution timer. Timeout tests: `test/manager.test.ts:575,
608, 1750, 1870, 3536–3610`; config tests `test/config.test.ts:684–691`.

## Intent

When a Pi subagent approaches its execution ceiling, the orchestrator is
warned with progress context and can grant more time within a configurable hard
ceiling; the child is asked to checkpoint its progress; and if the ceiling is
still reached, the orchestrator receives the useful partial context instead of
only a timeout error, so it does not have to rediscover completed work.

## Non-goals

- Changing `stall_timeout_ms`, question/reply timeouts, or OpenCode/Codex/Claude
  native delegation timeouts.
- Unbounded execution: a hard total ceiling always remains.
- Automatic extension without an orchestrator decision.
- Per-agent timeout frontmatter.
- Resuming an interrupted tool call at its exact execution point.

## Acceptance

- AC-1: Configuration accepts `timeout_warning_ms` (default 180000), `max_total_timeout_ms` (default 3600000) and `max_timeout_extensions` (default 3) through the existing global/project cascade with the same numeric normalization; invalid values fall back to defaults, a warning lead that is not smaller than `timeout_ms` disables the warning, and `max_total_timeout_ms` below `timeout_ms` is raised to `timeout_ms`.
- AC-2: For a running task, at `deadline - timeout_warning_ms` the parent receives one `subagent-attention` follow-up notification (same delivery/hold rules as completion) naming task id, remaining time, extensions used/remaining, latest progress updates and a bounded output-preview tail, and instructing that `subagent_extend` grants time and silence lets the ceiling apply; it is not emitted for tasks already terminal or stopping.
- AC-3: At the warning, the runtime queues one steering message to the child asking it to report a concise checkpoint (done, pending, touched files) through its progress channel and continue; delivery failure does not affect the task.
- AC-4: A root tool `subagent_extend({ task_id, extra_ms? })` (default extra = `timeout_ms`) moves the deadline of an owned running task, clamps it so total runtime never exceeds `max_total_timeout_ms`, rejects terminal/stopping/unknown/foreign tasks and exhausted extension counts with explicit errors, re-arms the warning for the new deadline, and records the extension in task state/history.
- AC-5: On total timeout, the completion notification and `subagent_result` include a partial-context section (latest checkpoint/progress updates, bounded output-preview tail, extensions used, nested session availability and whether `subagent_continue` is available) in addition to the timeout error; the disposition stays `failed / total_timeout`.
- AC-6: README and `skills/subagents-configuration/SKILL.md` document the new settings, attention notification, `subagent_extend` and partial timeout result; the Pi root runtime guidance tells the root to extend only on evidence of useful progress and otherwise let the ceiling apply, within existing prompt size caps.
- AC-7: Focused vitest coverage for AC-1..AC-5 passes along with existing timeout tests; `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- User selected scope: all three parts (warning + extension, child checkpoint, partial result on timeout).
- User selected bound: configurable total ceiling (default 60 min) plus a maximum extension count.

## Decisions

- Defaults: warning lead 3 min, hard ceiling 60 min, 3 extensions, default extension size = `timeout_ms`.
- Extension is root-driven only; no automatic extension.
- Checkpoint reuses existing child progress/steering primitives; no new child tool.
- `subagent_extend` is always registered for the Pi root (not gated like `enable_continue`).
- Timeout disposition remains `failed / total_timeout / retryable:false` for compatibility with existing callers and tests.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Pi subagent timeout attention and extension** — The Pi subagent runtime MUST warn the owning root before a running child reaches its total execution deadline with progress context, MUST ask the child to checkpoint, MUST let the root extend the deadline only through `subagent_extend` within a configurable hard total ceiling and extension count, and MUST include available partial progress context in the terminal result of a total timeout.
  - GIVEN a running Pi child approaching its deadline; WHEN the warning lead is reached; THEN the root receives one attention notification with progress context and may call `subagent_extend`, bounded by `max_total_timeout_ms` and `max_timeout_extensions`, otherwise the ceiling applies and the timeout result carries the latest checkpoint and preview .

## Plan

Single mutable runtime surface `pi-packages/pi-subagents/` owned by one worker
(U1), parallel root-prompt surface in repository `src/` (U3), docs after
runtime contract settles (U2).

- Config (`src/config.ts`, types): add three normalized fields beside
  `timeout_ms`; reuse the existing coercion helpers.
- Manager (`src/manager.ts`): replace the single total timer with a per-task
  deadline record (`started_at`, `deadline_at`, `extensions_used`) holding a
  warning timer and a ceiling timer; both cleared on terminalization/stop. The
  ceiling path keeps the current abort/stopping/settlement semantics. Add
  `extendDeadline(taskId, extraMs, ownerSession)` with clamping and validation,
  persisting extension metadata through existing task-state/history writes.
- Attention: new renderer beside `render/completion-message.ts` and
  `render/question-message.ts` producing `subagent-attention`, delivered through
  the existing extension outbox/follow-up path with the same session ownership
  and busy-parent hold rules.
- Checkpoint: at warning, enqueue via the existing `sendMessage` path a fixed
  checkpoint instruction; ignore enqueue failure.
- Tool: `src/tools/subagent-extend.ts` registered with the other root tools;
  excluded from children like other `subagent_*` tools.
- Partial result: shared formatter used by `subagent-result.ts` and the
  completion renderer when `error_category === 'total_timeout'`, bounded tail
  sizes, mentions `subagent_continue` availability from `enable_continue`.
- Root guidance (U3): one concise sentence in the Pi `<pi-runtime>` section
  source (`src/agents/prompt-dialects.ts` or wherever the Pi runtime block is
  generated) plus updated snapshot/size tests; keep shared harness text
  unchanged.

Risks: timer leaks or double-fire on extension/continue (cover with fake-timer
tests); notification arriving after task settled (guard on status); prompt size
caps (check existing prompt length tests). Focused seams: `test/manager.test.ts`,
`test/config.test.ts`, tool and render tests, extension outbox tests, root
prompt tests.

## Tasks

- [x] AC-1: Pi runtime timeout config, attention, checkpoint, extension and partial result implemented with tests (runtime unit U1)
  - Outcome: AC-1..AC-5 behavior in `pi-packages/pi-subagents` with passing focused tests
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/config.ts`, `src/manager.ts`, `src/runner/sdk-runner.ts`, `src/tools/subagent-result.ts`, `src/tools/result-details.ts`, `src/render/completion-message.ts`, `src/render/question-message.ts`, `src/extension/subagents-extension.ts`, `test/manager.test.ts`, `test/config.test.ts`; skills `tdd`, `vitest`
  - Inputs: this record's Exploration, Acceptance, Decisions and Plan
  - Dependencies: none
  - Output: code + tests diff and focused test results
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: existing task-state/history schema, notification outbox, tool registration and child tool exclusion; existing timeout tests stay green
  - Focused check and PASS evidence: pi-subagents vitest suite for touched files passes; package typecheck passes
  - Return milestone: implementation complete with test output
  - Stop / reassessment: notification path cannot carry a new message type, or task-state schema change breaks history compatibility
- [x] AC-2: Attention notification at warning lead implemented and tested within U1
  - Outcome: one `subagent-attention` follow-up per deadline with progress context, held like completions
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/manager.ts`, `src/render/`, `src/extension/subagents-extension.ts`, `test/extension/notification-outbox.test.ts`
  - Inputs: Plan attention design
  - Dependencies: none (delivered by U1)
  - Output: renderer, scheduling and tests
  - Owner: thoth-worker (U1)
  - Writes: within U1 writes
  - Interface boundaries: notification outbox and session ownership
  - Focused check and PASS evidence: attention tests pass, including no emission for terminal/stopping tasks
  - Return milestone: with U1
  - Stop / reassessment: outbox cannot carry a new custom message type
- [x] AC-3: Child checkpoint steering at warning implemented and tested within U1
  - Outcome: one checkpoint steering message enqueued at warning; enqueue failure ignored
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/manager.ts` (`sendMessage`)
  - Inputs: Plan checkpoint design
  - Dependencies: none (delivered by U1)
  - Output: code and tests
  - Owner: thoth-worker (U1)
  - Writes: within U1 writes
  - Interface boundaries: existing steering queue
  - Focused check and PASS evidence: test asserts single enqueue and failure tolerance
  - Return milestone: with U1
  - Stop / reassessment: steering unavailable for running tasks
- [x] AC-4: `subagent_extend` tool and deadline extension implemented and tested within U1
  - Outcome: bounded, validated, recorded deadline extension that re-arms the warning
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/manager.ts`, `src/tools/`, tool registration and child exclusion code
  - Inputs: Plan tool design, Decisions
  - Dependencies: none (delivered by U1)
  - Output: tool, manager API and tests
  - Owner: thoth-worker (U1)
  - Writes: within U1 writes
  - Interface boundaries: root tool registration; `subagent_*` exclusion from children; task history schema
  - Focused check and PASS evidence: fake-timer tests for clamp, count limit, rejection cases, re-armed warning, no timer leak
  - Return milestone: with U1
  - Stop / reassessment: history schema change breaks compatibility
- [x] AC-5: Partial-context timeout result implemented and tested within U1
  - Outcome: completion notification and `subagent_result` carry partial context on `total_timeout`
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/tools/subagent-result.ts`, `src/tools/result-details.ts`, `src/render/completion-message.ts`
  - Inputs: Plan partial-result design
  - Dependencies: none (delivered by U1)
  - Output: shared formatter and tests
  - Owner: thoth-worker (U1)
  - Writes: within U1 writes
  - Interface boundaries: existing disposition `failed / total_timeout / retryable:false` unchanged
  - Focused check and PASS evidence: tests assert section content and bounded sizes
  - Return milestone: with U1
  - Stop / reassessment: none expected
- [x] AC-6: Pi root guidance sentence for timeout attention
  - Outcome: Pi root runtime guidance mentions `subagent_extend` evidence-based use
  - Known entrypoints and skill paths: `src/harness/adapters/pi.ts` (Pi runtime block, lines ~39–67), `src/agents/prompt-rendering.test.ts`
  - Inputs: Decisions
  - Dependencies: none
  - Output: prompt diff + passing prompt tests
  - Owner: thoth-worker
  - Writes: Pi root runtime prompt source and its tests/snapshots under `src/`
  - Interface boundaries: shared harness root text unchanged; prompt size caps
  - Focused check and PASS evidence: prompt tests pass, size caps respected
  - Return milestone: diff + test output
  - Stop / reassessment: Pi runtime block not separable from shared text
- [x] AC-6: README and subagents-configuration skill documentation
  - Outcome: docs describe settings, attention, extend tool and partial timeout result
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md`, `pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md`
  - Inputs: accepted AC-1 runtime unit
  - Dependencies: AC-1 runtime unit
  - Output: docs diff
  - Owner: thoth-worker
  - Writes: those two files
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes; docs match implemented names/defaults
  - Return milestone: docs diff
  - Stop / reassessment: implemented contract differs from record
- [x] AC-7: Local closeout checks
  - Outcome: focused tests, `pnpm run check:ci`, `pnpm run typecheck` pass
  - Known entrypoints and skill paths: repository root
  - Inputs: all accepted units
  - Dependencies: all units above
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: commands exit 0
  - Return milestone: before final Oracle
  - Stop / reassessment: unrelated environment failures reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
Nonblocking cautions: checkpoint is best-effort (task-mode/ask_orchestrator unavailable); history must round-trip progress_updates and extension fields additively; held attention must be revalidated at delivery.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: afa0f7a5ce2c70508c31cf09185977c725f8d7ed6d77f1a113b34cc410d1b0bd

Prior rounds: R1 FAIL (continuation snapshot), R2 FAIL (shared builders fallback), R3 FAIL (inventories and subagent_extend render contract); all converged before this fresh round-4 PASS.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1..AC-7, Decisions, durable delta and Plan are satisfied. R3 blockers are resolved; R1/R2 fixes remain intact.",
  "evidence": [
    {
      "id": "record",
      "kind": "binding",
      "locator": ".thoth/changes/subagent-timeout-attention/subagent-timeout-attention.md",
      "claim": "Independently recomputed prefix SHA-256 matches afa0f7a5ce2c70508c31cf09185977c725f8d7ed6d77f1a113b34cc410d1b0bd. Canonical spec digest matches the declared source; bundled verify validator reports valid.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "runtime",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/{config,manager,history}.ts; test/{config,history,timeout-attention}.test.ts",
      "claim": "Configuration normalization, bounded extensions, ownership rejection, timer cleanup/rearming, continuation reset, long timer handling and additive history migration are implemented and covered by passing tests.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "attention",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/render/attention-message.ts; src/extension/subagents-extension.ts; test/extension/notification-outbox.test.ts",
      "claim": "Attention uses followUp delivery and busy-parent holding, refreshes context at delivery, and rejects stale status, attempt, deadline generation or session. Checkpoint transport failures do not affect execution.",
      "basis": "observed",
      "uncertainty": "Checkpoint steering is best-effort and unavailable for task-mode steering or disabled progress channels."
    },
    {
      "id": "partial",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/render/timeout-context.ts; src/continuation-availability.ts; src/tools/result-details.ts; test/tools/timeout-continuation-surfaces.test.ts",
      "claim": "Timeout context bounds previews to 2000 characters and the latest five progress messages to 1000 characters each. Result, completion and shared tool-detail builders use explicit current project configuration plus live registration for continuation availability, not persisted launch snapshots.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "rendering",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-subagents/src/{tools,render/tools}/subagent-extend.ts; test/compatibility.test.ts; test/render/{tools,render-kit,success-borders}.test.ts",
      "claim": "Inventories include attention and subagent_extend. Extend provides renderShell:self, empty renderCall and single-frame renderResult, with passing grant/error, collapsed/expanded, width-safety and KIT tests. Root registration is unconditional and model-only; existing child filters exclude subagent_*.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "docs",
      "kind": "source-review",
      "locator": "pi-packages/pi-subagents/README.md; skills/subagents-configuration/SKILL.md; src/harness/adapters/pi.ts",
      "claim": "Documentation matches defaults, bounds, best-effort checkpoints and partial results. Evidence-gated extension guidance is Pi-specific. Generated Pi root length is 15551 characters against the existing 15600 cap.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "suite",
      "kind": "execution",
      "locator": "pi-packages/pi-subagents: pnpm test",
      "claim": "Exit 0: 85 files passed; 1590 tests passed, 1 skipped, 0 failed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "static",
      "kind": "execution",
      "locator": "package pnpm run typecheck; root pnpm run typecheck; root pnpm run check:ci",
      "claim": "All required commands exited 0. check:ci reported no errors, 748 warnings and 7 informational diagnostics; no fixes applied.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "root-tests",
      "kind": "execution",
      "locator": "pnpm exec vitest run src/harness/adapters/pi.test.ts src/agents/prompt-rendering.test.ts",
      "claim": "147 tests passed, including new timeout guidance and existing prompt caps. The sole failure is the previously identified unrelated assertion at pi.test.ts:109.",
      "basis": "observed",
      "uncertainty": "Pre-existing-at-HEAD classification relies on prior-round evidence supplied in the assignment and the unchanged assertion/shared guidance."
    },
    {
      "id": "freshness",
      "kind": "execution",
      "locator": "git diff HEAD plus seven untracked package source/test files",
      "claim": "All 41 reviewed changed files retained aggregate SHA-256 7aac154797aa67ad1162fd87abc2e799f612c7b3c78b83830f61362e64ccb603 across validation. Record and spec digests also remained unchanged; git diff --check passed.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding, durable baseline and verify gate",
      "method": "Exact-byte SHA-256 recomputation, canonical spec comparison and bundled validator",
      "outcome": "pass",
      "evidenceIds": ["record", "freshness"],
      "reason": "Expected record binding and reviewed source match."
    },
    {
      "check": "AC-1..AC-4 and lifecycle/history compatibility",
      "method": "Full source review and passing configuration, deadline, outbox, history and child-filter tests",
      "outcome": "pass",
      "evidenceIds": ["runtime", "attention", "rendering", "suite"],
      "reason": "Bounds, ownership, checkpoint tolerance and stale-attention safeguards satisfy the contract."
    },
    {
      "check": "AC-5 and R1/R2 regression fixes",
      "method": "Review shared builders and execute current-config/live-registration matrix through foreground, status, result, cancel, list and completion surfaces",
      "outcome": "pass",
      "evidenceIds": ["partial", "suite"],
      "reason": "Bounded partial context is retained without stale continuation claims; failed/total_timeout disposition remains unchanged."
    },
    {
      "check": "R3 inventories and public rendering contract",
      "method": "Review registration/renderers and execute full package rendering/compatibility coverage",
      "outcome": "pass",
      "evidenceIds": ["rendering", "suite"],
      "reason": "Both missing inventories and the extend rendering contract are resolved."
    },
    {
      "check": "AC-6 documentation and Pi prompt cap",
      "method": "Compare documentation with implementation; run prompt tests and measure generated root",
      "outcome": "pass",
      "evidenceIds": ["docs", "root-tests"],
      "reason": "Guidance is accurate, Pi-specific and below the unchanged cap."
    },
    {
      "check": "AC-7 required full suite and static checks",
      "method": "Run all four requested commands",
      "outcome": "pass",
      "evidenceIds": ["suite", "static", "freshness"],
      "reason": "Required checks pass on unchanged reviewed inputs."
    },
    {
      "check": "Additional root adapter/prompt suite",
      "method": "Run both root test files without filtering",
      "outcome": "fail",
      "evidenceIds": ["root-tests"],
      "reason": "Only the acknowledged pre-existing pi.test.ts:109 failure remains; no change-related failures."
    }
  ],
  "risks": [
    {
      "description": "The unrelated pre-existing root adapter assertion still fails and should be corrected separately.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["root-tests"]
    },
    {
      "description": "Checkpoint enqueue does not guarantee consumption or receipt; this limitation is documented and preserves timeout behavior.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["attention", "docs"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record acceptance evidence, run closeout and archive through the bundled contract.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/subagent-timeout-attention/subagent-timeout-attention.md",
    "reviewedRecordSha256": "afa0f7a5ce2c70508c31cf09185977c725f8d7ed6d77f1a113b34cc410d1b0bd"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | pi-subagents pnpm test (config.test.ts) | 1590 passed, 0 failed
- AC-2: PASS | notification-outbox and timeout-attention tests | stale attention revalidated at delivery
- AC-3: PASS | timeout-attention tests | single checkpoint enqueue, failure tolerated
- AC-4: PASS | timeout-attention, render/tools and compatibility tests | clamp, count, ownership, render contract
- AC-5: PASS | timeout-continuation-surfaces, subagent-result and completion-message tests | bounded partial context, current availability
- AC-6: PASS | Oracle doc review and src/harness/adapters/pi.test.ts | Pi root 15551 within 15600 cap
- AC-7: PASS | pnpm test (pi-subagents), typecheck (root and package), check:ci | all exit 0; pi.test.ts:109 pre-existing unrelated
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:8c142d6124e3fa8710d8b84d402fbc49c692871cfc5aa4cbdee5206b03b51dba

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
