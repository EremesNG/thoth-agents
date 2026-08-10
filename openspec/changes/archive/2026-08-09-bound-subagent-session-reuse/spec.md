# Feature Specification: Bound Subagent Session Reuse

**Change ID**: `bound-subagent-session-reuse`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Prevent adaptive roots from treating completed specialist sessions as a reusable role pool when a new work unit requires fresh context or independent judgment. Reusing an old session across SDD phases can carry irrelevant history, trigger immediate compaction, and weaken review independence.<br>
**Impact**: The canonical orchestration prompt will default to fresh subagent instances at work boundaries, permit continuation only for the same bounded assignment, and translate that distinction into native Codex, OpenCode, and Claude Code lifecycle operations. No runtime API or role roster changes are introduced.<br>
**Affected capabilities**: `multi-harness-agent-pack`

## User stories

### US1 - Receive fresh specialists at work boundaries (Priority: P1)

As a user relying on delegated work, I can expect the root to create a fresh specialist when the objective, SDD phase, mutable surface, or required independent judgment changes so that stale history and prior conclusions do not bias the new assignment.

**Independent test**: Render each supported root prompt and verify that it defines fresh delegation as the default at a work boundary and forbids treating completed agents as a reusable role pool.

**Covers**: FR-001, FR-003, SC-001

**Acceptance scenarios**:

1. **Given** a specialist completed one bounded assignment, **When** the root delegates a different objective, SDD phase, mutable surface, or independent judgment, **Then** the root creates a fresh native subagent instance.
2. **Given** Oracle performed an optional plan review, **When** final implementation verification begins, **Then** the root delegates that verification to a fresh Oracle instance.
3. **Given** Oracle returned findings that need clarification, **When** the root asks only about those same findings without requesting a new approval or PASS judgment, **Then** the root may continue that exact Oracle assignment.

### US2 - Continue only the same bounded assignment (Priority: P1)

As an orchestrator, I can continue a running or completed specialist only when the follow-up remains part of the exact same bounded assignment so that useful local context is retained without silently crossing work boundaries.

**Independent test**: Render the shared root policy and verify that continuation is limited to in-flight steering, result clarification, or completion of the same objective and that status collection is not described as cross-task reuse.

**Covers**: FR-002, FR-004, SC-002

**Acceptance scenarios**:

1. **Given** a specialist is still executing a bounded assignment, **When** the root supplies a correction or missing context for that same assignment, **Then** the root may continue the existing session.
2. **Given** a specialist completed a bounded assignment, **When** the root requests clarification or completion of that unchanged assignment and no independent judgment is required, **Then** the root may resume it deliberately.
3. **Given** the root is waiting for a running task, **When** it uses the harness status or wait surface, **Then** that operation is treated as collection of the existing assignment rather than permission to reuse the session for later work.

### US3 - Apply native lifecycle operations consistently (Priority: P1)

As a maintainer, I can render equivalent fresh-versus-continue guidance for Codex, OpenCode, and Claude Code so that each harness preserves the same lifecycle contract through its native tools.

**Independent test**: Assert the dialect lifecycle contract and generated root prompts contain the correct native fresh and continuation operations for all three harnesses without leaking another harness's terminology.

**Covers**: FR-005, SC-003

**Acceptance scenarios**:

1. **Given** Codex requires fresh delegation, **When** its root prompt is rendered, **Then** it names `collaboration.spawn_agent` with `fork_turns="none"`; continuation names `collaboration.followup_task`.
2. **Given** OpenCode requires fresh delegation, **When** its root prompt is rendered, **Then** it names `task` without `task_id`; continuation allows the prior `task_id` only for the same assignment.
3. **Given** Claude Code requires fresh delegation, **When** its root prompt is rendered, **Then** it names a normal `Agent` invocation; continuation names `SendMessage` to the prior agent ID and independent work forbids forked context inheritance.

## Edge cases

- A nonterminal wait or status timeout does not end the assignment and must not cause duplicate delegation.
- A completed agent with the desired role name is still stale when the requested objective or phase changed.
- Same-writer continuity may justify resuming an unchanged implementation assignment, but not transferring that writer to a different mutable surface.
- Clarifying an Oracle finding may resume the same session, but any new approval, plan review, verification round, or PASS judgment requires a fresh Oracle instance.
- If a harness cannot enforce the lifecycle distinction, the generated prompt must report instruction-level guidance rather than claim equivalent runtime enforcement.

## Functional requirements

- **FR-001 — Fresh delegation at work boundaries**: `[ADDED multi-harness-agent-pack]` The canonical orchestration policy MUST make a fresh subagent instance the default whenever the objective, SDD phase, mutable surface, or independent-judgment boundary changes.
- **FR-002 — Bounded continuation exception**: `[ADDED multi-harness-agent-pack]` The canonical orchestration policy MUST permit resuming or steering an existing subagent only for the exact same bounded assignment and MUST NOT treat completed role instances as a reusable pool.
- **FR-003 — Fresh independent judgment**: `[ADDED multi-harness-agent-pack]` Every Oracle plan review, verification round, and PASS-producing judgment MUST use a fresh Oracle instance; an existing Oracle session MAY be resumed only to clarify its current findings without issuing a new approval judgment.
- **FR-004 — Status is not reuse**: `[ADDED multi-harness-agent-pack]` Native wait and status operations MUST remain scoped to collecting a nonterminal assignment and MUST NOT authorize reusing that session for a later work unit.
- **FR-005 — Native lifecycle translation**: `[ADDED multi-harness-agent-pack]` Each supported harness MUST render its native fresh and continuation mechanisms: Codex `spawn_agent` with `fork_turns="none"` versus `followup_task`, OpenCode `task` without `task_id` versus the prior `task_id`, and Claude Code normal `Agent` versus `SendMessage`, while avoiding inherited/forked context for independent work.

## Success criteria

- **SC-001** `[buildable]`: Canonical contract and prompt-rendering tests fail if a root prompt omits fresh-at-boundary guidance, permits cross-phase pooling, or allows the same Oracle instance to perform plan review and final verification.
- **SC-002** `[buildable]`: All shared lifecycle tests pass while distinguishing same-assignment continuation from wait/status collection and covering both running-task steering and completed-task clarification.
- **SC-003** `[buildable]`: All three harness adapter or dialect test suites assert their native fresh and continuation operations and reject cross-harness terminology leakage.

## Assumptions

- Current native lifecycle semantics remain as documented and exposed by the installed harness tools: fresh delegation is distinct from explicit continuation.
- Prompt guidance is the portable enforcement surface; runtime hard enforcement is outside this change unless an existing harness primitive already provides it.
- The existing one-writer-per-mutable-surface rule remains authoritative.

## Dependencies

- Existing canonical prompt rendering in `src/agents/prompt-sections.ts` and dialect translation in `src/agents/prompt-dialects.ts`.
- Existing OpenCode, Codex, and Claude Code adapter and installation tests.

## Out of scope

- Changing native Codex, OpenCode, or Claude Code runtime implementations.
- Adding token-window telemetry or attempting to predict compaction thresholds.
- Changing the seven-role roster, model selection, permissions, or SDD phase ownership.
- Persisting or replaying subagent transcripts through thoth-mem.
