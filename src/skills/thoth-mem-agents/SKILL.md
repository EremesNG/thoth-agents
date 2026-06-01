---
name: thoth-mem-agents
description: Mandatory thoth-mem workflow contract for orchestrator/subagent memory ownership, parent session_id/project dispatch, prompt-save prohibitions, project-scoped read tools, session-summary ownership, and durable observation rules. Use whenever work mentions thoth-mem, persistent memory, orchestrator/subagents, session_id, project, saved prompts, session summaries, or project-level memory context.
metadata:
  author: thoth-agents
  version: '1.0'
---

# thoth-mem Agents Skill

Use this skill whenever memory work crosses the orchestrator/subagent boundary.
It prevents prompt pollution, implicit fallback sessions such as
`manual-save-{project}`, and session-level writes from the wrong agent.

## Shared References

Read these first:

- [../_shared/persistence-contract.md](../_shared/persistence-contract.md)
- [../_shared/thoth-mem-convention.md](../_shared/thoth-mem-convention.md)

## Active MCP Surface

Use thoth-mem through these MCP tools:

- `mem_recall` for fused retrieval and search
- `mem_save` for observations, prompts, session summaries, and passive learnings
- `mem_context` for recent session/project continuity
- `mem_get` for full memory content and optional timeline context
- `mem_project` for project summaries, graph facts, topics, and topic context
- `mem_session` for root-owned session lifecycle and checkpoints

Admin/export/import/sync/migration/rebuild/index/trace operations are CLI/HTTP/dashboard operations, not MCP tools.

## Hard Ownership Split

### Root/main orchestrator identity

The initial/root agent in the harness is the orchestrator owner for this
session, even when the runtime does not label it `orchestrator`.

### Root-only session and prompt ownership

At new root session start, when tools and identity are available, the root:

1. Loads `thoth-mem-agents` and `requirements-interview`.
2. Calls `mem_session(action="start")` with root session identity.
3. Saves real user intent with `mem_save(kind="prompt")`.

Root owns these operations:

- `mem_session(action="start")`
- `mem_session(action="checkpoint")` when used for root progress checkpoints
- `mem_session(action="summary")`
- `mem_save(kind="prompt")`
- root-owned session summaries/checkpoints, including `mem_save(kind="session_summary")` when used as the summary carrier

Subagents must never start/checkpoint/summarize sessions or save prompts.

If tools or required identity are missing, report that bootstrap/compaction
could not be persisted and continue without claiming memory was saved.

## Root Recall and Save Protocol

### Durable saves

Root should persist durable outcomes with `mem_save`:

- decisions and architecture constraints
- bug fixes and root cause
- non-obvious discoveries and patterns
- configuration changes
- durable preferences/constraints

Keep content structured:

```text
What: concise description
Why: reason or problem solved
Where: files, paths, systems, or artifacts
Learned: caveats or edge cases
```

### Recall funnel (canonical)

1. `mem_recall(mode="compact")`
2. `mem_recall(mode="context")`
3. `mem_get(id=...)`

Use `mem_get(id=..., include_timeline=true)` when chronology matters.
Set `mem_recall` `limit` from 1 to 20. Use `mem_get` with `kind="observation"|"prompt"`, `include_timeline=true` plus `before`/`after`, and `offset`/`max_length` for large content.
Use `mem_context(..., recall_query="...")` only as optional fused context, not
as a replacement for the recall funnel.

### Project navigation

Use `mem_project` for project-level navigation:

- `action="list"`
- `action="summary"`
- `action="graph"`
- `action="topics"`
- `action="topic"`

`mem_project(action="graph")` relations are `HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, and `HAS_LEARNED`.

### Session close and compaction

Before ending meaningful work, root records continuity with either:

- `mem_session(action="summary")`, or
- root-owned `mem_save(kind="session_summary")`

Before delegation after meaningful context changes, root may refresh a
checkpoint/summary context using root-owned session tools. Subagent prompts must
carry recovery instructions, never the raw handoff body.

## Project-Scoped Context Rules

`mem_context` and `mem_project(...)` are bounded context reads, not ownership
transfers.

Rules:

- Use only with parent `session_id` and `project` when delegated.
- Keep calls bounded to the task scope.
- Do not use them to bypass the recall funnel.
- Do not use them to create session summaries or save prompts.

Operational note: semantic lanes can be pending/degraded; lexical/KG fallback is
valid and expected. Treat fallback metadata as state, not failure.

## Dispatch Contract

When subagents may use thoth-mem, dispatch MUST include:

- parent `session_id`
- `project`
- persistence mode
- memory permissions (read-only vs delegated write)
- bounded recall instructions

Without both `session_id` and `project`, subagents must not call thoth-mem.

## Capability Split by Agent Type

### Read-only subagents

Roles: explorer, librarian, oracle.

Allowed:

- recall funnel: `mem_recall(mode="compact")` -> `mem_recall(mode="context")` -> `mem_get`
- optional bounded context: `mem_context`, `mem_project`

Not allowed:

- `mem_save`
- any root session ownership action (`mem_session(...)`)
- `mem_save(kind="prompt")`

### Write-capable subagents

Roles: deep, quick, designer.

Allowed:

- same recall funnel as read-only roles
- optional bounded context via `mem_context`/`mem_project`
- delegated durable saves via `mem_save(kind="observation")`
- deterministic SDD artifact saves only when explicitly delegated

Rules:

- every thoth-mem call uses parent `session_id` and `project`
- never start/checkpoint/summarize sessions
- never save prompts
- report missing/stale/contradictory/insufficient recall context

## Topic-Key Rules

General durable observations must stay outside `sdd/*`.
SDD artifacts use deterministic keys only:

`sdd/{change}/{artifact}`

Examples: `sdd/add-user-auth/spec`, `sdd/add-user-auth/design`,
`sdd/add-user-auth/tasks`.

## Anti-Patterns

Reject immediately:

- asking a subagent to save a generated dispatch prompt
- subagent use of root session operations (`mem_session(...)`)
- subagent save of `kind="prompt"`
- inventing thoth-mem tools outside the six-tool MCP surface
- treating `mem_context` as a substitute for recall funnel
- saving general notes under `sdd/*`

## Response Standard

When applying this skill, state clearly:

- memory owner for each operation (root vs subagent)
- allowed tools for the task
- whether parent `session_id` and `project` are present
- whether context reads are bounded and explicitly allowed
- whether topic keys collide with `sdd/*`
- whether any rule is instruction-level due to runtime enforcement limits
