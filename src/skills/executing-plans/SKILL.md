---
name: executing-plans
description: Execute SDD task lists with real-time progress tracking, sub-agent dispatch, and verification checkpoints.
metadata:
  author: thoth-agents
  version: '1.0'
---

# Executing Plans Skill

Use this skill to execute an existing SDD task list end to end while keeping
task progress durable, ordered, and verifiable.

## Shared Conventions

- [../_shared/openspec-convention.md](../_shared/openspec-convention.md)
- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## Progress Tracking Invariants

The orchestrator owns task progress tracking.

- The orchestrator marks `- [ ]` to `- [~]` before dispatching execution work.
- The orchestrator marks `- [~]` to `- [x]` only after successful results are
  received and verified.
- The orchestrator marks `- [-]` with a clear reason when a task is skipped or
  fails after escalation.
- Sub-agents execute assigned work and return structured results. They do not
  own checkbox updates.
- Same-agent execution batches are allowed when consecutive ready tasks share
  dependencies, scope, and verification context.
- For a same-agent batch, keep checkbox state per task: mark each batched task
  `- [~]` before dispatch, and later mark each task `- [x]` or `- [-]` only
  from task-specific evidence in the returned result.
- Never proceed without updating the current task state first.
- Re-read the canonical tasks artifact after each edit to confirm persistence.
- Persistence mode determines target stores: `openspec` → file only,
  `thoth-mem` → memory only, `hybrid` → both. Never skip a store that the
  active mode requires.
- The artifact governance validator is outside this skill's responsibility.
  If present, it is a report-only checkpoint after `sdd-tasks` and before a
  future `sdd-apply` entrypoint; it does not change checkbox state or task
  ownership.
- `openspec/` files are coordination artifacts, not source code. The
  orchestrator may read and edit them directly for progress tracking and state
  management only when the active mode includes openspec artifacts.
- Keep visible task state on the active progress tracking surface while
  preserving the canonical task artifact. Use the visible progress surface
  when available, plus the same canonical `tasks.md` and/or thoth-mem artifacts.
- Task state updates are NOT optional and NOT deferred — they happen in
  real-time as execution proceeds.
- Every state transition (pending→in-progress, in-progress→completed,
  in-progress→skipped) MUST be persisted BEFORE moving on.
- Real-time tracking is a hard invariant, not a best practice. Deferred updates
  are a protocol violation, and batch dispatches must still record each task's
  state transition before and after the delegated work.

## When to Use

- Executing an SDD task list
- Resuming work from a previous session
- Multi-task implementation with an existing change already defined

## Workflow

### Phase 1: Load

1. Determine the artifact store mode from config before reading or writing any
   SDD artifacts.
2. Load task artifacts using mode-aware retrieval:
   - `openspec`/`hybrid`: scan `openspec/changes/` for active changes and read
     `tasks.md`.
   - `thoth-mem`: recover tasks via the recall funnel
     (`mem_recall(mode="compact")` -> `mem_recall(mode="context")` ->
     `mem_get(...)`) using topic key `sdd/{change-name}/tasks`; use
     `mem_get(include_timeline=true)` when task chronology matters.
3. Find the first unchecked task in state `- [ ]` or `- [~]`.
4. Build a mental model of the plan: total tasks, remaining work,
   parallelizable work, and dependency order.
5. Load remaining SDD context using mode-aware retrieval in
   [../_shared/persistence-contract.md](../_shared/persistence-contract.md).

### Phase 2: Execute Ready Work

#### A. Mark In-Progress

Before dispatching a task or same-agent batch:

1. Select the next ready task, or the next consecutive ready tasks that target
   the same execution agent and can safely be handled in one dispatch.
2. Edit the canonical tasks artifact and change each selected task from
   `- [ ]` to `- [~]`.
3. If the mode is `thoth-mem` or `hybrid`, re-persist the updated tasks
   artifact with topic key `sdd/{change-name}/tasks`.
4. Re-read `tasks.md` after the edit to confirm the change persisted.

#### B. Dispatch

Choose the semantic execution role based on task type. Preserve the role
boundary even when the active harness uses different invocation syntax:

| Need | Semantic role |
| --- | --- |
| Broad codebase discovery | explorer |
| External docs or APIs | librarian |
| Architecture or debugging | oracle |
| UI or UX work | designer |
| Simple, precise changes | quick |
| Complex, multi-file changes | deep |

Prefer one dispatch for consecutive ready tasks assigned to the same execution
role, especially repeated UI/UX work for designer, repeated narrow edits for
quick, or related implementation tasks for deep.

Every dispatch prompt MUST include these 6 parts:

1. `TASKS` — exact task number(s) and title(s)
2. `CONTEXT` — relevant proposal, spec, design, and prior-task state
3. `REQUIREMENTS` — concrete outcomes and constraints
4. `BOUNDARIES` — files, scope limits, and non-goals
5. `VERIFICATION` — checks the sub-agent must run or report
6. `RETURN ENVELOPE` — the exact structured response contract in this skill

`BOUNDARIES` must not contradict accepted proposal or spec scope. Use it to
limit the current assigned task, not to redefine the approved change scope.

#### C. Receive and Verify

Read the sub-agent return envelope and respond by status:

- `completed`: inspect the reported file changes, run verification checks, and
  confirm every task's acceptance criteria were actually met.
- `failed`: assess the blocker, decide whether to retry with sharper guidance,
  switch agents, or escalate.
- `partial`: assess what is already done, preserve that context, and dispatch a
  focused follow-up for the remainder.

#### D. Mark Complete

After verified completion:

1. Edit the canonical tasks artifact and change each verified task from
   `- [~]` to `- [x]`. If a batched result only completed some tasks, update
   only those tasks and keep the rest in progress, skipped, or retryable based
   on evidence.
2. If the mode is `thoth-mem` or `hybrid`, re-persist the updated tasks
   artifact under `sdd/{change-name}/tasks`.
3. Persist a progress checkpoint under `sdd/{change-name}/apply-progress` when
   the mode includes thoth-mem.
4. Re-read `tasks.md` after the edit to confirm the completed state persisted.

#### E. Auto-Continue

Immediately proceed to the next task.

Do not ask the user whether execution should continue unless one of these is
true:

- the work is truly blocked
- a critical failure prevents safe continuation
- the current task or batch has failed 3 consecutive times

### Phase 3: Between Tasks

Between every task or same-agent batch:

1. Re-read `tasks.md` because later tasks may depend on earlier outputs.
2. Re-check that assumptions still hold.
3. If a prior task introduced breakage, fix that before starting the next task.

### Phase 4: Escalation Policy

- Attempt 1: re-dispatch the same task with explicit fix instructions and the
  missing evidence called out.
- Attempt 2: switch to a different agent or fix directly when appropriate.
- Attempt 3: make one final targeted attempt with narrowed scope.
- "Narrowed scope" means a narrower recovery attempt for the assigned task
  only. It must not redefine accepted proposal or spec scope for the change.
- After 3 consecutive failures, mark the task `- [-]` with a clear reason and
  escalate to the user.

### Phase 5: Completion

After the task list is complete:

1. Run final verification using the project's configured instructions and the
   smallest sufficient checks: typecheck, tests, lint, and build when
   appropriate.
2. Report a completion summary with evidence.
3. If the work is SDD-backed, suggest `sdd-verify` as the next step.

## Return Envelope Contract

Every execution sub-agent MUST return this exact structure:

```markdown
## Task Result

**Status**: completed | failed | partial
**Tasks**: {task number(s) and name(s)}

### What was done
- {concrete change 1}
- {concrete change 2}

### Per-task outcome
- `{task number}` — completed | failed | partial: {task-specific evidence}

### Files changed
- `path/to/file.ts` — {what changed}

### Verification
- {check 1}: passed | failed
- {check 2}: passed | failed

### Issues (if any)
- {issue description} — {severity: critical | important | minor}

### Failure reason (if failed)
{Why it failed, what was attempted, what blocked progress}

### Skip reason (if skipped)
{Why it was skipped, what prerequisite is missing}
```

Treat missing sections or vague summaries as incomplete execution results.

## Recovery Protocol

To resume safely:

1. Determine the artifact store mode from config.
2. Recover task state using mode-aware retrieval:
   - `openspec`: read `openspec/changes/{change-name}/tasks.md`.
   - `thoth-mem`: recover `sdd/{change-name}/tasks` and
     `sdd/{change-name}/apply-progress` via the recall funnel
     (`mem_recall(mode="compact")` -> `mem_recall(mode="context")` ->
     `mem_get(...)`); use `mem_get(include_timeline=true)` when task chronology
     matters.
   - `hybrid`: do both recovery paths and prefer thoth-mem as the source of
     truth if state diverges.
3. Resume from the first task marked `- [ ]` or `- [~]`.

## Guardrails

- Do not execute tasks out of dependency order.
- Do not mark a task complete without verification evidence.
- Do not skip SDD context recovery.
- Do not modify task-list structure; only update checkbox state and explicit skip
  reasons.
- Do not continue past a blocked task without escalation.
- Do not claim completion without evidence.
