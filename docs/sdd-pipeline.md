# SDD Pipeline

This document explains the bundled spec-driven development workflow shipped with
thoth-agents.

## Overview

The full pipeline is:

```text
sdd-init (if openspec/ missing) -> sdd-explore -> propose -> spec -> clarify -> design -> tasks -> apply -> verify -> archive
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
- moderate complexity: accelerated SDD, usually `sdd-explore -> propose -> tasks`
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

## Delegation Matrix

| Phase | Primary delegate | Support / fallback | Why |
| --- | --- | --- | --- |
| `sdd-init` | `quick` | `explorer` support | Fast mechanical bootstrap; explorer supplies repository facts when needed. |
| `sdd-explore` | `explorer` | `librarian` for external APIs/docs | Read-only repository discovery before artifact-producing phases. |
| `sdd-propose` | `deep` | `oracle` review when risk is high | Structured reasoning, alternatives, and trade-off synthesis. |
| `sdd-spec` | `deep` | `oracle` review when ambiguity is high | Quality-sensitive requirement contract and scenarios. |
| `sdd-clarify` | `deep` | `oracle` fallback | Bounded resolution of residual spec ambiguity before design (full pipeline only). |
| `sdd-design` | `deep` | `designer` only for UI/UX concerns | Technical architecture, file changes, interfaces, and data flow. |
| `sdd-tasks` | `quick` | `deep` fallback for complex plans | Mechanical conversion of settled design into ordered tasks. |
| `plan-reviewer` | `oracle` | `quick` persists the artifact when writes are required | Independent read-only executability review; result is durable at `plan-review.md`. |
| `sdd-apply` | `deep` | `quick` for mechanical batches, `designer` for UI/visual work | Correctness-heavy implementation by default. |
| `sdd-verify` | `oracle` | `quick` persists the report when writes are required | Independent verification review against specs and evidence. |
| `sdd-archive` | `quick` | None | Mechanical closeout after verification passes. |

`sdd-constitution` is a governance skill, not a linear pipeline phase. It is
invoked explicitly (or accepted from a non-blocking auto-suggest emitted by
`sdd-verify` and `sdd-archive`) to amend the constitution. Its suggested owner is
`deep`, with `oracle` review for principle changes. See
[Constitution Governance](#constitution-governance) below.

### 0. `sdd-init`

Bootstraps OpenSpec structure when OpenSpec-backed persistence is selected and
`openspec/` is missing.

### 1. `sdd-explore`

Maps the repository context needed for SDD: existing implementations,
dependencies, tests, conventions, and verification targets. This is read-only
and feeds the proposal phase.

### 2. `sdd-propose`

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

### 3. `sdd-spec`

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

### 4. `sdd-clarify`

Resolves residual ambiguity that survives `sdd-spec` before `sdd-design`
consumes the spec. Full pipeline only; the accelerated and direct routes skip
it. It scans the spec against an ambiguity taxonomy (ambiguous quantifiers,
undefined terms, missing error/edge behavior, unresolved decision forks,
underspecified data shapes, unstated non-functional bounds) plus every
`[NEEDS CLARIFICATION]` marker, resolves a bounded set (capped per spec file,
default 3) via informed-guess defaults or a blocking question, and writes the
resolutions back into the same delta spec in place. It creates no new artifact
and reuses the canonical `sdd/{change-name}/spec` topic key (upsert).

Typical output:

- residual ambiguities resolved in place (marker/taxonomy class -> resolution)
- recorded defaults folded into the spec's `## Assumptions`
- re-validated `checklists/requirements.md` and design handoff hints

Canonical file path (edited in place):

```text
openspec/changes/{change-name}/specs/{domain}/spec.md
```

### 5. `sdd-design`

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

#### Optional design sub-artifacts

Beyond the always-present `design.md`, `sdd-design` MAY emit optional plan
sub-artifacts when both the config gate (`rules.design.sub_artifacts: true`) and
the complexity threshold (`rules.design.complexity_threshold`) are met. An
eligible change may still produce zero. The optional types are `research.md`
(genuine unknown investigation), `data-model.md` (non-trivial data shape),
`contracts/` (interfaces to pin), and `quickstart.md` (a runnable smoke path).
When the config gate is `false` or absent, no sub-artifacts are produced.

### 6. `sdd-tasks`

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

#### Task annotation conventions

`tasks.md` items use optional, additive annotations (legacy task lists without
them still execute):

- **`[P]`** — a parallel marker placed AFTER the `N.M` number
  (`- [ ] 2.1 [P] Title`). It flags a task that is intra-phase, dependency-free
  of every other task in the same phase, and assigned to the same execution
  agent. Gated by `rules.tasks.parallel_markers`.
- **`[USN-<n>]`** — a user-story-number grouping label (a coarse story/epic
  bucket). It is NOT the requirement linkage.
- **`Priority: P<n>`** — task priority, one of `P1`, `P2`, `P3`.
- **`Spec:` trace tag** — names the exact requirement the task implements in
  `{domain}/{Requirement Name}` (optionally `#{Scenario Name}`) form. This is the
  requirement linkage `plan-reviewer` counts for coverage.
- **`Independent Test:`** — how the task's outcome is verified in isolation,
  without depending on other tasks being complete.
- **`[NEEDS CLARIFICATION]`** — a residual-ambiguity marker; `sdd-clarify`
  resolves these (capped per spec file) before design.

### 7. `sdd-apply`

Implements assigned tasks and reports structured results back to the
`orchestrator`.

Typical output:

- status: completed, failed, or partial
- what changed
- files changed
- verification evidence
- blockers or remaining work

`sdd-apply` executes assigned work. It does not own task checkbox updates.

### 8. `sdd-verify`

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

### 9. `sdd-archive`

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

## Constitution Governance

The project constitution (`openspec/memory/constitution.md`) is governed across
its full lifecycle:

- **Created** by `sdd-init` when the OpenSpec structure is bootstrapped.
- **Enforced live** by `sdd-design` (Constitution Check self-review) and
  `plan-reviewer` (independent Constitution Check). Both read the constitution at
  evaluation time, so amendments propagate to gates without re-installing assets.
- **Amended** by `sdd-constitution`, the only writable target being
  `openspec/memory/constitution.md`. An amendment bumps the semver `Version:`
  (MAJOR = a principle removed or redefined; MINOR = a principle added or
  guidance materially expanded; PATCH = clarification with no behavioral change),
  updates `Last-Amended:`, and prepends one `## Sync-Impact Report` entry. The
  bump requires explicit human confirmation; there is no auto-bump.
- **Report-only propagation**: `sdd-constitution` names the live-read consuming
  gates and flags in-flight `design.md` / `tasks.md` that reference changed
  principles for human re-review. It never edits those artifacts or any other
  bundled/installed asset.
- **Auto-suggest**: `sdd-verify` and `sdd-archive` may emit a non-blocking
  suggestion to record an amendment when a completed change is
  governance-touching; a human chooses whether to invoke `sdd-constitution`.

## Plan Reviewer Oracle Loop

After `sdd-tasks`, the `orchestrator` can run an oracle review loop with the
bundled `plan-reviewer` skill.

Blocking user decisions during this loop or any later execution step MUST go
through the `question` tool rather than plain-text questions.

Flow:

1. Generate `tasks.md`
2. Dispatch oracle with `plan-reviewer`
3. Persist the returned review payload at `openspec/changes/{change-name}/plan-review.md` and/or `sdd/{change-name}/plan-review`, according to the selected persistence mode
4. If result is `[OKAY]`, ask the user whether to proceed to implementation
5. Do not run `sdd-apply` until the user confirms implementation
6. If result is `[REJECT]`, fix only the blocking issues
7. Re-run review until `[OKAY]`, then ask for implementation confirmation

`plan-reviewer` is intentionally narrow. It checks executability, not style. On recovery, a saved `[OKAY]` is accepted only when every recorded reviewed-artifact SHA-256 digest still matches the current planning artifacts. Missing, stale, rejected, or unparsable evidence fails closed and reruns Oracle. A fresh approval satisfies plan-review only; it never confirms implementation.

Canonical plan-review artifact:

```text
openspec/changes/{change-name}/plan-review.md
```

Canonical memory topic:

```text
sdd/{change-name}/plan-review
```

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
sdd/{change-name}/plan-review
sdd/{change-name}/apply-progress
sdd/{change-name}/verify-report
sdd/{change-name}/archive-report
```

For targeted memory retrieval, use the recall funnel:

1. `mem_recall(mode="compact")` — scan candidate IDs and titles with focused
   topic-key/query filters.
2. `mem_recall(mode="context")` — expand the strongest hits into retrieved
   context.
3. `mem_get(id=..., include_timeline=true)` — fetch full content and timeline
   context when chronology matters.

Use HyDE/fused hybrid recall (sentence + chunk vectors, FTS, KG enrichment) for
semantic or ambiguous searches; set `mem_recall` `limit` from 1 to 20; narrow
with `topic_key`, `type`, `time_from`, `time_to`, `scope`, `project`, and
`session_id` filters. Use `mem_get` with `kind="observation"|"prompt"`,
`include_timeline=true` plus `before`/`after`, and `offset`/`max_length` for
large content. Use bounded `mem_context(recall_query=...)` or
`mem_project(action="graph"|"topics"|"topic")` for supplemental project
context; `mem_project(action="graph")` relations are `HAS_TYPE`, `IN_PROJECT`,
`HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, and `HAS_LEARNED`.

An automatic save nudge also reminds the `orchestrator` to persist observations
after each completed task.

## Related Docs

- [Quick Reference](quick-reference.md)
- [Skills and MCPs](skills-and-mcps.md)
- [Installation Guide](installation.md)
