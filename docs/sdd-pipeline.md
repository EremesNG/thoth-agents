# SDD Pipeline

This document explains the bundled spec-driven development workflow shipped with
thoth-agents.

## Overview

The full pipeline is:

```text
sdd-init (if openspec/ missing) -> propose -> [spec || design] -> tasks -> apply -> verify -> archive
```

The requirements interview runs before this when the request is ambiguous, open-ended, or too
large to implement safely without scope alignment.

If `openspec/` does not exist yet, `sdd-init` bootstraps the structure before
planning artifacts are created.

## How the Requirements Interview Feeds into SDD

The bundled `requirements-interview` skill decides the handoff route
after clarification using a 6-dimension complexity assessment (logic
depth, contract sensitivity, context span, discovery need, failure
cost, and concern coupling).

- low complexity: direct implementation
- moderate complexity: accelerated SDD, usually `propose -> tasks`
- high complexity: full SDD pipeline

Routing is based on the nature and risk of the change, not file count.
A mechanical rename across many files routes direct, while a dense
business-logic rewrite in two files may need full SDD.

Before SDD begins, the user chooses an artifact store mode.

## Artifact Store Policy

The artifact store controls where planning artifacts persist.

| Mode | Writes to | Token cost | Use when |
| --- | --- | --- | --- |
| `thoth-mem` | thoth memory only | Low | You want lightweight planning with no repo files |
| `openspec` | `openspec/` files only | Medium | You want reviewable repo artifacts |
| `hybrid` | both | High | You want maximum durability and recovery |
| `none` | Neither | Lowest | Ephemeral iterations, no artifact persistence |

Config:

```json
{
  "artifactStore": {
    "mode": "hybrid"
  }
}
```

Default mode is `hybrid`.

## Phase-by-Phase Flow

Dispatch notes:

- Dispatch independent phases or subtasks in parallel when they do not depend on
  each other.
- If a delegated phase fails or returns conflicting results, retry once with a
  more specific prompt.
- After that retry, report the limitation or failure clearly to the user.
- Maximum retries per delegated task: one.

### 1. `sdd-propose`

Creates or updates `proposal.md` for a named change.

Typical output:

- intent
- scope
- affected areas
- risks
- rollback plan
- success criteria

Canonical file path when OpenSpec files are enabled:

```text
openspec/changes/{change-name}/proposal.md
```

### 2. `sdd-spec`

Turns the proposal into requirements and Given/When/Then scenarios.

Typical output:

- ADDED requirements
- MODIFIED requirements
- REMOVED requirements
- RFC 2119 wording
- scenario-based acceptance criteria

Canonical file path:

```text
openspec/changes/{change-name}/specs/{domain}/spec.md
```

### 3. `sdd-design`

Explains how the approved spec will be built.

Typical output:

- technical approach
- architecture decisions
- data flow
- file changes
- interfaces or contracts
- testing strategy

Canonical file path:

```text
openspec/changes/{change-name}/design.md
```

### 4. `sdd-tasks`

Generates an executable checklist from the proposal, spec, and design.

Typical output:

- phased checklist
- concrete file references
- explicit verification steps
- dependency-respecting order

Canonical file path:

```text
openspec/changes/{change-name}/tasks.md
```

### 5. `sdd-apply`

Implements assigned tasks and reports structured results back to the
`orchestrator`.

Typical output:

- status: completed, failed, or partial
- what changed
- files changed
- verification evidence
- blockers or remaining work

`sdd-apply` executes assigned work. It does not own task checkbox updates.

### 6. `sdd-verify`

Builds a verification report against specs and execution evidence.

Typical output:

- completeness summary
- build and test evidence
- scenario compliance matrix
- issues found
- verdict

Canonical file path:

```text
openspec/changes/{change-name}/verify-report.md
```

### 7. `sdd-archive`

Closes the loop by merging verified deltas into main specs and archiving the
change.

Typical output:

- merged domains
- archive path
- verification lineage
- audit summary

Archive path pattern:

```text
openspec/changes/archive/YYYY-MM-DD-{change-name}/
```

## Plan Reviewer Oracle Loop

After `sdd-tasks`, the `orchestrator` can run an oracle review loop with the
bundled `plan-reviewer` skill.

Blocking user decisions during this loop or any later execution step MUST go
through the `question` tool rather than plain-text questions.

Flow:

1. Generate `tasks.md`
2. Dispatch oracle with `plan-reviewer`
3. If result is `[OKAY]`, ask the user whether to proceed to implementation
4. Do not run `sdd-apply` until the user confirms implementation
5. If result is `[REJECT]`, fix only the blocking issues
6. Re-run review until `[OKAY]`, then ask for implementation confirmation

`plan-reviewer` is intentionally narrow. It checks executability, not style.

## Task Progress Tracking

The `executing-plans` skill defines the task-state model used during execution.

Progress tracking has two mandatory layers:

- `todowrite`: macro-level visual task list for the user; always active for
  multi-step work
- Persistent SDD artifact: canonical checkboxes in `tasks.md` and/or thoth
  memory

Both layers must be updated before dispatching work and again after receiving
results.

| State | Meaning |
| --- | --- |
| `- [ ]` | Pending |
| `- [~]` | In progress |
| `- [x]` | Completed |
| `- [-]` | Skipped with explicit reason |

Rules:

1. Mark a task or same-agent batch `- [~]` before dispatching work
2. Mark each task `- [x]` only after verification succeeds
3. Mark a task `- [-]` only with a clear skip or escalation reason
4. Group consecutive ready tasks for the same execution agent into one dispatch
   when dependencies, scope, and verification can be handled together
5. Update both tracking layers before dispatch and after results return
6. Re-read `tasks.md` after each update to confirm persistence

## Executing-Plans Ownership Model

`executing-plans` makes the `orchestrator` the owner of progress tracking.

- The `orchestrator` updates checkbox state
- Sub-agents return structured results
- Verification happens before completion is recorded
- Escalation occurs after repeated failures instead of silent skipping

## Thoth Topic Keys

When the selected mode includes thoth memory, SDD artifacts use deterministic
topic keys:

```text
sdd/{change-name}/proposal
sdd/{change-name}/spec
sdd/{change-name}/design
sdd/{change-name}/design-brief
sdd/{change-name}/tasks
sdd/{change-name}/apply-progress
sdd/{change-name}/verify-report
sdd/{change-name}/archive-report
```

For targeted memory retrieval, use the 3-layer recall protocol:

1. `mem_search` (compact) — scan IDs and titles
2. `mem_timeline` — chronological context around candidates
3. `mem_get_observation` — full content for selected records

An automatic save nudge also reminds the `orchestrator` to persist observations
after each completed task.

## Related Docs

- [Quick Reference](quick-reference.md)
- [Skills and MCPs](skills-and-mcps.md)
- [Installation Guide](installation.md)
